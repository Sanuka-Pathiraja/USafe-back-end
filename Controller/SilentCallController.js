import AppDataSource from "../config/data-source.js";
import makeOutboundCall from "../CallFeat/voiceService.js";
import { normalizeNum } from "../utils/normalizeNumberFormat.js";
import { emergencySessions } from "./EmergencyProcessController.js";

const allowDemoCallFallback = process.env.ALLOW_DEMO_CALL_FALLBACK === "true";

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    ok: false,
    success: false,
    code,
    message,
    ...extra,
  });
}

function getRequestId(req) {
  return req?.id || req?.requestId || req?.headers?.["x-request-id"] || null;
}

function logEvent(req, event, payload = {}) {
  console.log(
    JSON.stringify({
      event,
      requestId: getRequestId(req),
      endpoint: req?.originalUrl || null,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function toOperatorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return "Unknown provider error";
  if (/timeout|timed out/i.test(raw)) return "Call provider timeout";
  return raw;
}

function touchSession(session) {
  if (session) session.updatedAt = Date.now();
}

function getSession(sessionId) {
  return emergencySessions.get(sessionId) || null;
}

function buildSelectedContactPayload(contact, contactIndex, phone) {
  return {
    contactIndex,
    contactId: contact.contactId,
    name: contact.name,
    relationship: contact.relationship,
    phone,
  };
}

function buildSilentCallMessage(rawMessage) {
  return String(rawMessage || "").trim();
}

export const submitSilentCall = async (req, res) => {
  const userId = req.user.id;
  const requestStartedAt = Date.now();
  const message = buildSilentCallMessage(req.body?.message);
  const requestedContacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];

  logEvent(req, "SILENT_CALL_REQUEST", {
    userId,
    contactsRequested: requestedContacts.length,
    hasMessage: Boolean(message),
  });

  if (!message) {
    return fail(res, 400, "MESSAGE_REQUIRED", "Message is required.");
  }

  if (requestedContacts.length === 0) {
    return fail(res, 400, "CONTACTS_REQUIRED", "At least one contact must be selected.");
  }

  try {
    const contactRepo = AppDataSource.getRepository("Contact");
    const selectedContactIds = [
      ...new Set(
        requestedContacts
          .map((contact) => Number(contact?.contactId))
          .filter((contactId) => Number.isFinite(contactId))
      ),
    ];

    if (selectedContactIds.length === 0) {
      return fail(res, 422, "CONTACT_ID_REQUIRED", "Each selected contact must include a valid contactId.");
    }

    const savedContacts = await contactRepo.find({
      where: selectedContactIds.map((contactId) => ({ contactId, user: { id: userId } })),
      relations: { user: true },
      select: {
        contactId: true,
        name: true,
        relationship: true,
        phone: true,
        user: { id: true },
      },
      order: { contactId: "ASC" },
    });

    if (savedContacts.length !== selectedContactIds.length) {
      return fail(res, 422, "CONTACT_VALIDATION_FAILED", "One or more selected contacts are invalid.");
    }

    const savedContactMap = new Map(savedContacts.map((contact) => [Number(contact.contactId), contact]));
    const normalizedContacts = [];

    for (const requestedContact of requestedContacts) {
      const contactId = Number(requestedContact?.contactId);
      const savedContact = savedContactMap.get(contactId);

      if (!savedContact) {
        return fail(res, 422, "CONTACT_VALIDATION_FAILED", "One or more selected contacts are invalid.");
      }

      let normalizedPhone;
      try {
        normalizedPhone = normalizeNum(savedContact.phone);
      } catch {
        return fail(res, 422, "INVALID_PHONE_FORMAT", `Selected contact ${savedContact.name} has an invalid phone number.`);
      }

      normalizedContacts.push({
        contactId: savedContact.contactId,
        name: savedContact.name,
        relationship: savedContact.relationship,
        phone: normalizedPhone,
      });
    }

    const requestId = crypto.randomUUID();
    const sessionContacts = normalizedContacts.map((contact, index) =>
      buildSelectedContactPayload(contact, index + 1, contact.phone)
    );

    const callResults = [];
    const failures = [];

    emergencySessions.set(requestId, {
      id: requestId,
      userId,
      type: "SILENT_CALL",
      status: "ACTIVE",
      answeredBy: null,
      someoneAnswered: false,
      answeredByContactIndex: null,
      emergencyServicesCalled: false,
      messageSentAt: null,
      contacts: sessionContacts,
      calls: {},
      callAttempts: {},
      smsReport: null,
      silentCall: {
        message,
        requestedContacts: normalizedContacts.length,
      },
      messaging: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (const [index, contact] of normalizedContacts.entries()) {
      const contactIndex = index + 1;
      let callId;
      let demo = false;

      try {
        const result = await makeOutboundCall(contact.phone, {
          sessionId: requestId,
          contactIndex,
          publicBaseUrl: process.env.PUBLIC_BASE_URL,
          text: message,
        });
        callId = result?.uuid;
        if (!callId) throw new Error("Vonage did not return uuid");
      } catch (error) {
        if (!allowDemoCallFallback) {
          failures.push({
            contactId: contact.contactId,
            name: contact.name,
            phone: contact.phone,
            error: toOperatorMessage(error),
          });
          continue;
        }

        demo = true;
        callId = `DEV_${requestId}_${contactIndex}_${Date.now()}`;
      }

      const session = getSession(requestId);
      if (session) {
        session.calls[callId] = {
          contactIndex,
          to: contact.phone,
          status: demo ? "ringing" : "started",
          answered: false,
          startedAt: Date.now(),
          silentCall: true,
        };
        touchSession(session);
      }

      callResults.push({
        contactId: contact.contactId,
        name: contact.name,
        phone: contact.phone,
        callId,
        demo,
      });
    }

    const queuedCalls = callResults.length;
    const session = getSession(requestId);
    if (session) {
      session.silentCall.results = {
        queuedCalls,
        failedCalls: failures.length,
      };
      if (queuedCalls === 0) {
        session.status = "FAILED";
      }
      touchSession(session);
    }

    logEvent(req, "SILENT_CALL_RESULT", {
      requestId,
      userId,
      queuedCalls,
      failedCalls: failures.length,
      elapsedMs: Date.now() - requestStartedAt,
    });

    if (queuedCalls === 0) {
      return fail(res, 502, "SILENT_CALL_FAILED", "Failed to process Silent Call request.", {
        requestId,
        queuedCalls: 0,
        failures,
      });
    }

    return res.json({
      success: true,
      message: "Silent Call request submitted successfully.",
      requestId,
      queuedCalls,
      failures,
    });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Failed to process Silent Call request.");
  }
};
