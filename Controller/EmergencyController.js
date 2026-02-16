// Controller/EmergencyController.js
import AppDataSource from "../config/data-source.js";
import { sendBulkSameSMS } from "../CallFeat/quicksend.js";
import makeOutboundCall from "../CallFeat/voiceService.js";

/**
 * In-memory session store (demo-ready).
 * If you restart the server, sessions reset.
 *
 * session schema:
 * {
 *   id, userId,
 *   status: "ACTIVE" | "ANSWERED" | "COMPLETED" | "CANCELLED",
 *   answeredBy: null | { contactIndex, to, callId },
 *   contacts: [{ contactId, name, phone, relationship }],
 *   calls: { [callId]: { contactIndex, to, status, answered } },
 *   createdAt
 * }
 */
export const emergencySessions = new Map();

const terminalStatuses = new Set([
  "completed",
  "failed",
  "rejected",
  "busy",
  "unanswered",
  "timeout",
  "cancelled",
  "no-answer",
]);

function requireSession(sessionId) {
  const s = emergencySessions.get(sessionId);
  return s || null;
}

/**
 * POST /emergency/start
 * Auth required
 *
 * What it does:
 * - Loads logged-in user's saved contacts from DB (max 5)
 * - Sends bulk SOS SMS via QuickSend
 * - Creates a server sessionId to track call answer events
 *
 * Response: { sessionId, contactsCount }
 */
export const startEmergency = async (req, res) => {
  try {
    const userId = req.user.id;

    const contactRepo = AppDataSource.getRepository("Contact");
    const contacts = await contactRepo.find({
      where: { user: { id: userId } },
      select: {
        contactId: true,
        name: true,
        phone: true,
        relationship: true,
        user: { id: true },
      },
      relations: { user: true },
      take: 5,
      order: { contactId: "ASC" },
    });

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ error: "No emergency contacts saved" });
    }

    // Create session
    const sessionId = crypto.randomUUID();
    emergencySessions.set(sessionId, {
      id: sessionId,
      userId,
      status: "ACTIVE",
      answeredBy: null,
      contacts: contacts.map((c) => ({
        contactId: c.contactId,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship,
      })),
      calls: {},
      createdAt: Date.now(),
    });

    // Bulk SMS
    const numbers = contacts.map((c) => c.phone);
    const msg = process.env.SOS_MESSAGE || "🚨 SOS! Immediate help needed.";
    const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";
    await sendBulkSameSMS(numbers, msg, senderID);

    return res.json({ sessionId, contactsCount: contacts.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /emergency/:sessionId/call/:contactIndex/start
 * Auth required
 *
 * Starts a call to the given contact index (1..N) inside session
 * Returns { callId }
 *
 * IMPORTANT:
 * - If someone already answered, it blocks new calls (409)
 */
export const startCallToContact = async (req, res) => {
  try {
    const { sessionId, contactIndex } = req.params;
    const userId = req.user.id;

    const session = requireSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    if (session.status === "ANSWERED") {
      return res.status(409).json({
        message: "Already answered",
        answeredBy: session.answeredBy,
      });
    }

    const idx = Number(contactIndex);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      return res.status(400).json({ error: "Invalid contactIndex" });
    }

    const to = (session.contacts[idx - 1].phone || "").trim();
    if (!to) return res.status(500).json({ error: "Missing phone for selected contact" });

    // Starts Vonage call + configures webhook (PUBLIC_BASE_URL required in env)
    const result = await makeOutboundCall(to, {
      sessionId,
      contactIndex: idx,
      publicBaseUrl: process.env.PUBLIC_BASE_URL,
    });

    const callId = result?.uuid;
    if (!callId) return res.status(500).json({ error: "Vonage did not return uuid" });

    session.calls[callId] = {
      contactIndex: idx,
      to,
      status: "started",
      answered: false,
    };

    return res.json({ callId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /emergency/:sessionId/call/:callId/status
 * Auth required
 *
 * Used by Flutter polling to decide if answered is true/false.
 * Response: { status, answered, terminal, answeredBy, sessionStatus }
 */
export const getCallStatus = async (req, res) => {
  try {
    const { sessionId, callId } = req.params;
    const userId = req.user.id;

    const session = requireSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    const call = session.calls[callId];
    if (!call) return res.status(404).json({ error: "Call not found" });

    return res.json({
      status: call.status,
      answered: !!call.answered,
      terminal: terminalStatuses.has(call.status),
      answeredBy: session.answeredBy,
      sessionStatus: session.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /webhooks/voice-event?sessionId=...&contactIndex=...
 * No auth (Vonage calls this)
 *
 * Vonage event payload includes:
 * - uuid
 * - status: started | ringing | answered | completed | ...
 */
export const voiceEventWebhook = async (req, res) => {
  try {
    const sessionId = (req.query.sessionId || "").toString();
    const contactIndex = Number(req.query.contactIndex);

    const body = req.body || {};
    const callId = body.uuid;
    const status = String(body.status || "").toLowerCase();

    // Always return 200 to avoid provider retry loops
    if (!sessionId || !callId || !status) {
      return res.status(200).json({ ok: true, note: "missing identifiers" });
    }

    const session = requireSession(sessionId);
    if (!session) return res.status(200).json({ ok: true, note: "unknown session" });

    // Track/update this call
    const existing = session.calls[callId];
    if (!existing) {
      session.calls[callId] = {
        contactIndex: Number.isFinite(contactIndex) ? contactIndex : null,
        to: body.to || null,
        status,
        answered: false,
      };
    } else {
      existing.status = status;
    }

    // ✅ Receiver picked up
    if (status === "answered" && session.status !== "ANSWERED") {
      session.status = "ANSWERED";
      session.calls[callId].answered = true;

      session.answeredBy = {
        contactIndex: session.calls[callId].contactIndex,
        to: session.calls[callId].to,
        callId,
      };
    }

    // Optional: mark session completed when calls end (not required for your UI)
    // if (status === "completed" && session.status !== "CANCELLED") {
    //   session.status = session.status === "ANSWERED" ? "COMPLETED" : session.status;
    // }

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Still return 200 (provider expects it)
    return res.status(200).json({ ok: true, note: "webhook error" });
  }
};

/**
 * (Optional) GET /emergency/:sessionId/status
 * Auth required
 * Useful if you want to poll whole session, not per callId.
 */
export const getEmergencyStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = requireSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    return res.json({
      sessionId: session.id,
      sessionStatus: session.status,
      answeredBy: session.answeredBy,
      contactsCount: session.contacts.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
