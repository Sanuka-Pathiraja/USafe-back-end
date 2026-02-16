import AppDataSource from "../config/data-source.js";
import { sendBulkSameSMS, sendSingleSMS } from "../CallFeat/quicksend.js";
import makeOutboundCall from "../CallFeat/voiceService.js";

// In-memory sessions (demo-ready)
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

function getSession(sessionId) {
  return emergencySessions.get(sessionId) || null;
}

/* ===================== PHONE NORMALIZATION ===================== */
function normalizeLkNumber(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  // remove spaces/dashes/etc; keep digits and plus
  const cleaned = s.replace(/[^\d+]/g, "");

  // +94XXXXXXXXX -> 94XXXXXXXXX
  if (cleaned.startsWith("+94")) {
    const digits = "94" + cleaned.slice(3).replace(/\D/g, "");
    return digits;
  }

  // 94XXXXXXXXX
  if (cleaned.startsWith("94")) {
    return cleaned.replace(/\D/g, "");
  }

  // 0XXXXXXXXX (10 digits) -> 94XXXXXXXXX
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return "94" + cleaned.slice(1);
  }

  // already like 9477XXXXXXX etc
  if (cleaned.startsWith("947")) {
    return cleaned.replace(/\D/g, "");
  }

  return null;
}

// LK number: 94 + 9 digits (total 11 digits)
function isValidLkMobile(n) {
  return typeof n === "string" && /^94\d{9}$/.test(n);
}

/**
 * POST /emergency/start
 * Auth required
 * - loads saved contacts from DB (max 5)
 * - sends SOS SMS (bulk -> fallback single)
 * - creates sessionId
 */
export const startEmergency = async (req, res) => {
  const userId = req.user.id;

  console.log("========================================");
  console.log("🚨 Emergency Start Requested");
  console.log("👤 User ID:", userId);
  console.log("🕒 Time:", new Date().toISOString());

  try {
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

    console.log("📇 Contacts found:", contacts.length);

    if (!contacts || contacts.length === 0) {
      console.log("❌ No emergency contacts saved");
      console.log("========================================");
      return res.status(400).json({ error: "No emergency contacts saved" });
    }

    // Build target list with normalization + validation
    const targets = contacts.map((c) => {
      const normalized = normalizeLkNumber(c.phone);
      const valid = normalized ? isValidLkMobile(normalized) : false;

      return {
        contactId: c.contactId,
        name: c.name,
        relationship: c.relationship,
        rawPhone: c.phone,
        phone: normalized, // normalized phone
        valid,
      };
    });

    console.log("📞 Normalized targets:");
    for (const t of targets) {
      console.log(
        ` - [${t.contactId}] ${t.name} | raw=${t.rawPhone} | norm=${t.phone} | valid=${t.valid}`
      );
    }

    const validTargets = targets.filter((t) => t.valid);
    const validNumbers = validTargets.map((t) => t.phone);

    if (validNumbers.length === 0) {
      console.log("❌ No valid phone numbers after normalization");
      console.log("========================================");
      return res.status(400).json({
        error: "No valid phone numbers found in contacts",
        invalid: targets
          .filter((t) => !t.valid)
          .map((t) => ({ contactId: t.contactId, name: t.name, phone: t.rawPhone })),
      });
    }

    // Create session first (so even if SMS fails, we still have a session)
    const sessionId = crypto.randomUUID();

    const smsReport = {
      attempted: validNumbers.length,
      mode: null, // "bulk" | "single" | "skipped"
      bulk: null,
      singles: [],
      failures: [],
    };

    emergencySessions.set(sessionId, {
      id: sessionId,
      userId,
      status: "ACTIVE", // ACTIVE | ANSWERED | COMPLETED | CANCELLED
      answeredBy: null,
      contacts: targets.map((t) => ({
        contactId: t.contactId,
        name: t.name,
        phone: t.phone || t.rawPhone, // keep something usable
        relationship: t.relationship,
      })),
      calls: {}, // callId -> {contactIndex,to,status,answered}
      smsReport,
      createdAt: Date.now(),
    });

    const msg = process.env.SOS_MESSAGE || "🚨 SOS! Immediate help needed.";
    const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";

    // 1) Try BULK SMS
    console.log("📨 Trying BULK SMS to:", validNumbers);

    try {
      const bulkRes = await sendBulkSameSMS(validNumbers, msg, senderID);
      smsReport.mode = "bulk";
      smsReport.bulk = bulkRes;
      console.log("✅ Bulk SMS success:", bulkRes);
    } catch (bulkErr) {
      const bulkMsg = bulkErr?.message || String(bulkErr);
      console.warn("⚠️ Bulk SMS failed:", bulkMsg);

      // 2) Fallback to SINGLE SMS per valid target
      smsReport.mode = "single";

      for (const t of validTargets) {
        try {
          console.log(`📨 Sending SINGLE SMS -> ${t.phone} (${t.name})`);
          const singleRes = await sendSingleSMS(t.phone, msg, senderID);

          smsReport.singles.push({
            to: t.phone,
            contactId: t.contactId,
            name: t.name,
            ok: true,
            res: singleRes,
          });

          console.log(`✅ Single SMS success -> ${t.phone}`);
        } catch (singleErr) {
          const singleMsg = singleErr?.message || String(singleErr);

          smsReport.singles.push({
            to: t.phone,
            contactId: t.contactId,
            name: t.name,
            ok: false,
            error: singleMsg,
          });

          smsReport.failures.push({
            to: t.phone,
            contactId: t.contactId,
            name: t.name,
            error: singleMsg,
          });

          console.warn(`❌ Single SMS failed -> ${t.phone}:`, singleMsg);
        }
      }
    }

    // Save report back to session (reference is same object, but keep explicit)
    const session = getSession(sessionId);
    if (session) session.smsReport = smsReport;

    console.log("📋 SMS Report Summary:", {
      mode: smsReport.mode,
      attempted: smsReport.attempted,
      failures: smsReport.failures.length,
    });

    console.log("✅ Emergency session created:", sessionId);
    console.log("========================================");

    // ✅ Do NOT block emergency start if SMS partially fails
    return res.json({
      sessionId,
      contactsCount: targets.length,
      validSmsTargets: validNumbers.length,
      smsMode: smsReport.mode,
      smsFailures: smsReport.failures, // helpful for debugging in Postman
    });
  } catch (err) {
    console.error("❌ Emergency start failed:", err.message);
    console.log("========================================");
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /emergency/:sessionId/call/:contactIndex/start
 * Auth required
 * - starts call to contactIndex (1..N)
 * - returns callId
 *
 * ✅ DEMO MODE fallback: if Vonage fails, it still returns a DEV callId
 */
export const startCallToContact = async (req, res) => {
  try {
    const { sessionId, contactIndex } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    // stop future calls if already answered
    if (session.status === "ANSWERED") {
      return res.status(409).json({ message: "Already answered", answeredBy: session.answeredBy });
    }

    const idx = Number(contactIndex);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      return res.status(400).json({ error: "Invalid contactIndex" });
    }

    const to = (session.contacts[idx - 1]?.phone || "").trim();
    if (!to) return res.status(500).json({ error: "Missing phone for selected contact" });

    let callId;
    let demo = false;

    try {
      const result = await makeOutboundCall(to, {
        sessionId,
        contactIndex: idx,
        publicBaseUrl: process.env.PUBLIC_BASE_URL, // optional in demo; needed for real webhook
      });
      callId = result?.uuid;
      if (!callId) throw new Error("Vonage did not return uuid");
    } catch (e) {
      // ✅ DEMO fallback (no Vonage number needed)
      demo = true;
      callId = `DEV_${sessionId}_${idx}_${Date.now()}`;
    }

    session.calls[callId] = {
      contactIndex: idx,
      to,
      status: demo ? "ringing" : "started",
      answered: false,
    };

    return res.json({ callId, demo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /emergency/:sessionId/call/:callId/status
 * Auth required
 * Flutter polls this to decide answered true/false
 */
export const getCallStatus = async (req, res) => {
  try {
    const { sessionId, callId } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
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
 * GET /emergency/:sessionId/status
 * Auth required
 * Optional helper to inspect the whole session
 */
export const getEmergencyStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    return res.json({
      sessionId: session.id,
      sessionStatus: session.status,
      answeredBy: session.answeredBy,
      contactsCount: session.contacts.length,
      smsReport: session.smsReport || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /webhooks/voice-event?sessionId=...&contactIndex=...
 * No auth (Vonage hits this)
 * Keep for later real integration.
 */
export const voiceEventWebhook = async (req, res) => {
  try {
    const sessionId = (req.query.sessionId || "").toString();
    const contactIndex = Number(req.query.contactIndex);

    const body = req.body || {};
    const callId = body.uuid;
    const status = String(body.status || "").toLowerCase();

    // Always 200 to avoid retries
    if (!sessionId || !callId || !status) {
      return res.status(200).json({ ok: true, note: "missing identifiers" });
    }

    const session = getSession(sessionId);
    if (!session) return res.status(200).json({ ok: true, note: "unknown session" });

    if (!session.calls[callId]) {
      session.calls[callId] = {
        contactIndex: Number.isFinite(contactIndex) ? contactIndex : null,
        to: body.to || null,
        status,
        answered: false,
      };
    } else {
      session.calls[callId].status = status;
    }

    if (status === "answered" && session.status !== "ANSWERED") {
      session.status = "ANSWERED";
      session.calls[callId].answered = true;

      session.answeredBy = {
        contactIndex: session.calls[callId].contactIndex,
        to: session.calls[callId].to,
        callId,
      };
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
};

/**
 * ✅ DEV ONLY: simulate "answered"
 * POST /emergency/:sessionId/dev/mark-answered?contactIndex=1
 * Auth required
 */
export const devMarkAnswered = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    const idx = Number(req.query.contactIndex || 1);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      return res.status(400).json({ error: "Invalid contactIndex" });
    }

    session.status = "ANSWERED";
    session.answeredBy = {
      contactIndex: idx,
      to: session.contacts[idx - 1]?.phone || null,
      callId: "DEV_CALL",
    };

    // optional: mark all existing calls as completed
    for (const callId of Object.keys(session.calls)) {
      session.calls[callId].status = "completed";
      session.calls[callId].answered = false;
    }

    return res.json({ ok: true, answeredBy: session.answeredBy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ DEV ONLY: reset session
 * POST /emergency/:sessionId/dev/reset
 * Auth required
 */
export const devResetSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    session.status = "ACTIVE";
    session.answeredBy = null;
    session.calls = {};
    session.smsReport = null;

    return res.json({ ok: true, sessionStatus: session.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
