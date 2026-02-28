import AppDataSource from "../config/data-source.js";
import { sendNotifySMS } from "../CallFeat/notifylksms.js";
import makeOutboundCall from "../CallFeat/voiceService.js";
import { hangupCall } from "../CallFeat/voiceCancel.js";

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

const activeCallStatuses = new Set(["started", "ringing", "answered", "in-progress"]);
const allowDemoCallFallback = process.env.ALLOW_DEMO_CALL_FALLBACK === "true";
const callProvider = process.env.CALL_PROVIDER || "vonage";

function toOperatorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return "Unknown provider error";
  if (/insufficient|low\s*fund|balance/i.test(raw)) return "Insufficient SMS balance";
  if (/timeout|timed out/i.test(raw)) return "Call provider timeout";
  return raw;
}

function toMachineCode(err, fallback = "PROVIDER_ERROR") {
  const raw = String(err?.message || err || "").toLowerCase();
  if (/insufficient|low\s*fund|balance/.test(raw)) return "LOW_FUNDS";
  if (/timeout|timed out/.test(raw)) return "TIMEOUT";
  if (/reject|denied|forbidden/.test(raw)) return "REJECTED";
  return fallback;
}

function maskPhone(raw) {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return null;

  // Keep country/local prefix signal and last 3 digits only.
  const last3 = s.slice(-3);
  if (s.startsWith("+")) return `${s.slice(0, 3)}******${last3}`;
  if (s.startsWith("0")) return `0******${last3}`;
  return `******${last3}`;
}

function getRequestId(req) {
  return req?.id || req?.requestId || req?.headers?.["x-request-id"] || null;
}

function normalizeCallStatus(rawStatus) {
  const s = String(rawStatus || "").toLowerCase();
  if (["queued"].includes(s)) return "queued";
  if (["started", "initiated"].includes(s)) return "initiated";
  if (["ringing"].includes(s)) return "ringing";
  if (["answered", "in-progress", "in_progress"].includes(s)) return "in-progress";
  if (["busy"].includes(s)) return "busy";
  if (["timeout"].includes(s)) return "timeout";
  if (["no-answer", "no_answer", "unanswered"].includes(s)) return "no-answer";
  if (["failed", "rejected"].includes(s)) return "failed";
  if (["completed", "cancelled"].includes(s)) return "completed";
  return s || "failed";
}

function normalizeAttemptFinalStatus(rawStatus) {
  const s = String(rawStatus || "").toLowerCase();
  if (["answered", "in-progress", "in_progress"].includes(s)) return "answered";
  if (["busy"].includes(s)) return "busy";
  if (["timeout"].includes(s)) return "timeout";
  if (["no-answer", "no_answer", "unanswered", "completed", "cancelled", "rejected"].includes(s)) {
    return "no-answer";
  }
  if (["missing-config", "not-configured", "not_configured"].includes(s)) return "not-configured";
  if (["failed"].includes(s)) return "failed";
  return "failed";
}

function buildAttemptResult({ answered = false, finalStatus = "failed", message = null, code = null, success = null }) {
  const status = String(finalStatus || "failed").toLowerCase();

  if (status === "answered") {
    return {
      success: true,
      answered: true,
      finalStatus: "answered",
      message: message || "Call answered",
      code: code || "ANSWERED",
    };
  }

  if (status === "busy") {
    return {
      success: success ?? true,
      answered: false,
      finalStatus: "busy",
      message: message || "Line is busy",
      code: code || "BUSY",
    };
  }

  if (status === "timeout") {
    return {
      success: success ?? true,
      answered: false,
      finalStatus: "timeout",
      message: message || "Call timed out",
      code: code || "TIMEOUT",
    };
  }

  if (status === "no-answer") {
    return {
      success: success ?? true,
      answered: false,
      finalStatus: "no-answer",
      message: message || "No answer within timeout",
      code: code || "NO_ANSWER",
    };
  }

  if (status === "not-configured") {
    return {
      success: false,
      answered: false,
      finalStatus: "not-configured",
      message: message || "Call provider is not configured",
      code: code || "NOT_CONFIGURED",
    };
  }

  return {
    success: success ?? false,
    answered: false,
    finalStatus: "failed",
    message: message || "Provider rejected request",
    code: code || "CALL_PROVIDER_ERROR",
  };
}

function logEvent(req, event, payload = {}) {
  const line = {
    event,
    requestId: getRequestId(req),
    endpoint: req?.originalUrl || null,
    ts: new Date().toISOString(),
    ...payload,
  };
  console.log(JSON.stringify(line));
}

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    ok: false,
    success: false,
    code,
    message,
    ...extra,
  });
}

function resolveUnicodeMode(text, requested) {
  if (requested !== undefined && requested !== null) return Boolean(requested);
  if (process.env.NOTIFY_SMS_UNICODE === "true") return true;
  if (process.env.NOTIFY_SMS_UNICODE === "false") return false;
  return /[^\x00-\x7F]/.test(String(text || ""));
}

function getSession(sessionId) {
  return emergencySessions.get(sessionId) || null;
}

function touchSession(session) {
  if (session) session.updatedAt = Date.now();
}

async function endOtherOngoingCalls(session, keepCallId = null) {
  const calls = session?.calls || {};

  for (const [callId, call] of Object.entries(calls)) {
    if (callId === keepCallId) continue;
    if (!call || !activeCallStatuses.has(String(call.status || "").toLowerCase())) continue;

    // DEV call IDs are local placeholders and cannot be hung up via Vonage.
    if (callId.startsWith("DEV_")) {
      call.status = "cancelled";
      call.endedAt = Date.now();
      continue;
    }

    try {
      await hangupCall(callId);
      call.status = "cancelled";
      call.endedAt = Date.now();
    } catch (e) {
      call.status = call.status || "unknown";
      call.hangupError = e?.message || String(e);
    }
  }

  touchSession(session);
}

/* ===================== NOTIFY.LK PHONE NORMALIZATION ===================== */
/**
 * Notify.lk accepts LK numbers that can be normalized by sendNotifySMS.
 * Here we only ensure there is a likely phone payload and keep original format.
 */
function toNotifyNumber(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s;
}

function isValidNotifyLkMobile(n) {
  if (typeof n !== "string") return false;
  const digits = n.replace(/\D/g, "");
  return digits.length >= 9;
}

/**
 * POST /emergency/start
 * Auth required
 * - loads saved contacts from DB (max 5)
 * - sends SOS SMS via Notify.lk
 * - creates sessionId
 *
 * ✅ IMPORTANT: Never blocks emergency session creation if SMS fails.
 */
export const startEmergency = async (req, res) => {
  const userId = req.user.id;
  const startedAt = Date.now();
  const {
    locationText,
    message,
    unicode: unicodeRequested,
    dangerTime,
    time,
    eventTime,
    messageMode,
    useDefaultTemplate,
  } = req.body || {};

  console.log("========================================");
  console.log("🚨 Emergency Start Requested");
  console.log("👤 User ID:", userId);
  console.log("🕒 Time:", new Date().toISOString());
  logEvent(req, "EMERGENCY_START_REQUEST", {
    userId,
    locationText: locationText || null,
    dangerTime: dangerTime || time || eventTime || null,
    hasCustomMessage: Boolean(message),
    messageMode: messageMode || null,
    useDefaultTemplate: useDefaultTemplate ?? null,
    unicode: Boolean(unicodeRequested),
  });

  try {
    const contactRepo = AppDataSource.getRepository("Contact");
    let contacts = await contactRepo.find({
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

    // MOCK BYPASS: Inject test contact for user 1 if none found
    if (userId === 1 && contacts.length === 0) {
      console.warn("⚠️ [MOCK] Injecting test contact for User ID 1");
      contacts = [{
        contactId: 999,
        name: "Test Contact",
        phone: process.env.SOS_SMS_TO || "94769653219",
        relationship: "Emergency",
        user: { id: 1 }
      }];
    }

    console.log("📇 Contacts found:", contacts.length);

    if (!contacts || contacts.length === 0) {
      console.log("❌ No emergency contacts saved");
      console.log("========================================");
      return fail(res, 400, "NO_CONTACTS", "No emergency contacts saved");
    }

    // Build target list with normalization + validation for Notify.lk
    const targets = contacts.map((c) => {
      const normalized = toNotifyNumber(c.phone);
      const valid = normalized ? isValidNotifyLkMobile(normalized) : false;

      return {
        contactId: c.contactId,
        name: c.name,
        relationship: c.relationship,
        rawPhone: c.phone,
        phone: normalized,
        valid,
      };
    });

    console.log("📞 Normalized targets (Notify.lk):");
    for (const t of targets) {
      console.log(
        ` - [${t.contactId}] ${t.name} | raw=${maskPhone(t.rawPhone)} | norm=${maskPhone(t.phone)} | valid=${t.valid}`
      );
    }

    const validTargets = targets.filter((t) => t.valid);
    const validNumbers = validTargets.map((t) => t.phone);

    if (validNumbers.length === 0) {
      console.log("❌ No valid phone numbers after normalization");
      console.log("========================================");
      return fail(res, 400, "NO_VALID_NUMBERS", "No valid phone numbers found in contacts", {
        invalid: targets
          .filter((t) => !t.valid)
          .map((t) => ({ contactId: t.contactId, name: t.name, phone: t.rawPhone })),
      });
    }

    // Create session first (so even if SMS fails, we still have a session)
    const sessionId = crypto.randomUUID();

    const smsReport = {
      attempted: validNumbers.length,
      mode: "notify",
      singles: [],
      failures: [],
    };

    emergencySessions.set(sessionId, {
      id: sessionId,
      userId,
      status: "ACTIVE", // ACTIVE | ANSWERED | COMPLETED | CANCELLED
      answeredBy: null,
      someoneAnswered: false,
      answeredByContactIndex: null,
      emergencyServicesCalled: false,
      messageSentAt: Date.now(),
      contacts: targets.map((t) => ({
        contactId: t.contactId,
        name: t.name,
        phone: t.phone || t.rawPhone, // keep something usable
        relationship: t.relationship,
      })),
      calls: {}, // callId -> {contactIndex,to,status,answered,startedAt,endedAt}
      callAttempts: {},
      smsReport,
      messaging: {
        success: null,
        code: null,
        message: null,
        attempted: validNumbers.length,
        sent: 0,
        failed: validNumbers.length,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const safeLocation = String(locationText || "").trim() || "Unknown location";
    const rawDangerTime = dangerTime || time || eventTime;
    let safeDangerTime = new Date().toISOString();
    if (rawDangerTime !== undefined && rawDangerTime !== null && String(rawDangerTime).trim() !== "") {
      const parsed = new Date(rawDangerTime);
      safeDangerTime = Number.isNaN(parsed.getTime()) ? String(rawDangerTime) : parsed.toISOString();
    }

    const defaultEmergencyMessage =
      `USafe Alert ⚠️\n` +
      `Danger detected\n` +
      `Location: ${safeLocation}\n` +
      `Time: ${safeDangerTime}`;
    const customMessage = String(message || "").trim();
    const isExactMode = String(messageMode || "").toLowerCase() === "exact";
    const useTemplateFlag = useDefaultTemplate === undefined ? null : Boolean(useDefaultTemplate);
    const shouldUseDefaultTemplate = useTemplateFlag === null ? !isExactMode : useTemplateFlag;
    const msg = !customMessage
      ? defaultEmergencyMessage
      : shouldUseDefaultTemplate
        ? `${customMessage}\nLocation: ${safeLocation}\nTime: ${safeDangerTime}`
        : customMessage;
    const renderMode = !customMessage
      ? "default-template"
      : shouldUseDefaultTemplate
        ? "custom-plus-location-time"
        : "custom-message";
    const includesLocationTime = renderMode !== "custom-message";
    const unicode = resolveUnicodeMode(msg, unicodeRequested);

    console.log("📨 Sending Notify.lk SMS to:", validNumbers);
    for (const t of validTargets) {
      try {
        const notifyRes = await sendNotifySMS({
          to: t.phone,
          message: msg,
          unicode,
        });

        smsReport.singles.push({
          to: t.phone,
          contactId: t.contactId,
          name: t.name,
          ok: true,
          res: notifyRes,
        });

        console.log(`✅ Notify.lk SMS success -> ${t.phone}`);
      } catch (notifyErr) {
        const notifyMsg = notifyErr?.message || String(notifyErr);

        smsReport.singles.push({
          to: t.phone,
          contactId: t.contactId,
          name: t.name,
          ok: false,
          error: notifyMsg,
        });

        smsReport.failures.push({
          to: t.phone,
          contactId: t.contactId,
          name: t.name,
          error: notifyMsg,
        });

        console.warn(`❌ Notify.lk SMS failed -> ${t.phone}:`, notifyMsg);
      }
    }

    // Save report back to session
    const session = getSession(sessionId);
    if (session) {
      const attempted = smsReport.attempted || 0;
      let sent = 0;
      let failed = attempted;

      sent = (smsReport.singles || []).filter((s) => s.ok).length;
      failed = Math.max(0, attempted - sent);

      const lowFunds = (smsReport.failures || []).some((f) => /insufficient|low\s*fund|balance/i.test(String(f.error || "")));
      const code = failed === 0 ? "OK" : sent > 0 ? "PARTIAL_SEND" : lowFunds ? "LOW_FUNDS" : "SEND_FAILED";
      const success = sent > 0;
      const message = code === "OK"
        ? "Messages sent to all emergency contacts"
        : code === "LOW_FUNDS"
          ? "Insufficient SMS balance"
          : code === "PARTIAL_SEND"
            ? `Messaging partially failed (${sent}/${attempted} sent)`
            : "Failed to send emergency messages";

      session.smsReport = smsReport;
      session.messaging = { success, code, message, attempted, sent, failed, renderMode, includesLocationTime };
      touchSession(session);
    }

    console.log("📋 SMS Report Summary:", {
      mode: smsReport.mode,
      attempted: smsReport.attempted,
      failures: smsReport.failures.length,
    });

    console.log("✅ Emergency session created:", sessionId);
    console.log("========================================");

    const doneSession = getSession(sessionId);
    const messaging = doneSession?.messaging || {
      success: false,
      code: "SEND_FAILED",
      message: "Failed to send emergency messages",
      attempted: validNumbers.length,
      sent: 0,
      failed: validNumbers.length,
    };

    logEvent(req, "MESSAGE_STEP_RESULT", {
      sessionId,
      userId,
      success: !!messaging.success,
      code: messaging.code,
      message: messaging.message,
      attempted: messaging.attempted,
      sent: messaging.sent,
      failed: messaging.failed,
      renderMode,
      includesLocationTime,
      elapsedMs: Date.now() - startedAt,
    });

    return res.json({
      sessionId,
      ok: !!messaging.success,
      success: !!messaging.success,
      code: messaging.code,
      message: messaging.message,
      renderMode,
      includesLocationTime,
      messaging: {
        attempted: messaging.attempted,
        sent: messaging.sent,
        failed: messaging.failed,
      },
      contactsCount: targets.length,
      contacts: targets.map((t, i) => ({
        contactIndex: i + 1,
        contactId: t.contactId,
        name: t.name,
        relationship: t.relationship,
        phone: t.phone || t.rawPhone,
      })),
      validSmsTargets: validNumbers.length,
      smsMode: smsReport.mode,
      smsFailures: smsReport.failures,
    });
  } catch (err) {
    console.error("❌ Emergency start failed:", err.message);
    console.log("========================================");
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
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
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    // stop future calls if already answered
    if (session.status === "ANSWERED") {
      return fail(res, 409, "ALREADY_ANSWERED", "Already answered", { answeredBy: session.answeredBy });
    }

    const idx = Number(contactIndex);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      return fail(res, 404, "CONTACT_NOT_FOUND", "contactIndex not found");
    }

    const to = (session.contacts[idx - 1]?.phone || "").trim();
    if (!to) return fail(res, 500, "MISSING_PHONE", "Missing phone for selected contact");

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
      startedAt: Date.now(),
    };
    touchSession(session);

    return res.json({ callId, demo });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
  }
};

/**
 * POST /emergency/:sessionId/call/:contactIndex/attempt
 * Auth required
 * Starts a call and waits up to timeoutSec for answered/terminal state.
 * Returns `answered` so Flutter can decide whether to skip remaining contacts.
 */
export const attemptCallToContact = async (req, res) => {
  try {
    const { sessionId, contactIndex } = req.params;
    const userId = req.user.id;
    const attemptStartedAt = Date.now();
    const rawTimeout = Number(req.body?.timeoutSec ?? req.query?.timeoutSec ?? 30);
    const timeoutSec = Math.max(5, Math.min(90, Number.isFinite(rawTimeout) ? rawTimeout : 30));

    const session = getSession(sessionId);
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    const idx = Number(contactIndex);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      logEvent(req, "CALL_ATTEMPT_RESULT", {
        sessionId,
        userId,
        contactIndex: Number.isFinite(idx) ? idx : contactIndex,
        answered: false,
        finalStatus: "not-found",
        elapsedMs: Date.now() - attemptStartedAt,
        reason: "contactIndex not found",
        code: "CONTACT_NOT_FOUND",
      });
      return fail(res, 404, "CONTACT_NOT_FOUND", "contactIndex not found");
    }

    if (session.status === "ANSWERED") {
      const result = buildAttemptResult({ finalStatus: "answered" });
      logEvent(req, "CALL_ATTEMPT_RESULT", {
        sessionId,
        userId,
        contactIndex: idx,
        answered: result.answered,
        finalStatus: result.finalStatus,
        elapsedMs: Date.now() - attemptStartedAt,
        reason: "Session already answered by another contact",
      });
      return res.json({
        success: result.success,
        answered: result.answered,
        finalStatus: result.finalStatus,
        message: "Session already answered by another contact",
        code: "ALREADY_ANSWERED",
        alreadyAnswered: true,
        answeredBy: session.answeredBy,
      });
    }

    const contact = session.contacts[idx - 1] || {};
    const to = (session.contacts[idx - 1]?.phone || "").trim();
    if (!to) return fail(res, 500, "MISSING_PHONE", "Missing phone for selected contact");
    logEvent(req, "CALL_ATTEMPT_STARTED", {
      sessionId,
      userId,
      contactIndex: idx,
      contactName: contact.name || null,
      contactPhone: maskPhone(to),
      timeoutSec,
    });

    let callId;
    let demo = false;

    try {
      const result = await makeOutboundCall(to, {
        sessionId,
        contactIndex: idx,
        publicBaseUrl: process.env.PUBLIC_BASE_URL,
      });
      callId = result?.uuid;
      if (!callId) throw new Error("Vonage did not return uuid");
      logEvent(req, "CALL_PROVIDER_REQUESTED", {
        sessionId,
        userId,
        contactIndex: idx,
        provider: callProvider,
        providerRequestId: callId,
      });
    } catch (e) {
      if (!allowDemoCallFallback) {
        const rawMsg = String(e?.message || "");
        const isNotConfigured = /missing|not set|private key|application_id|from_number|not found/i.test(rawMsg);
        const baseFinalStatus = isNotConfigured ? "not-configured" : "failed";
        const result = buildAttemptResult({
          success: false,
          finalStatus: baseFinalStatus,
          message: toOperatorMessage(e),
          code: isNotConfigured ? "NOT_CONFIGURED" : toMachineCode(e, "CALL_PROVIDER_ERROR"),
        });

        session.callAttempts[idx] = {
          status: result.finalStatus,
          answered: result.answered,
          message: result.message,
          code: result.code,
          at: Date.now(),
        };
        touchSession(session);
        logEvent(req, "CALL_ATTEMPT_RESULT", {
          sessionId,
          userId,
          contactIndex: idx,
          answered: result.answered,
          finalStatus: result.finalStatus,
          elapsedMs: Date.now() - attemptStartedAt,
          reason: result.message,
          code: result.code,
        });
        return res.json({
          contactIndex: idx,
          ...result,
          status: result.finalStatus,
        });
      }
      demo = true;
      callId = `DEV_${sessionId}_${idx}_${Date.now()}`;
      logEvent(req, "CALL_PROVIDER_REQUESTED", {
        sessionId,
        userId,
        contactIndex: idx,
        provider: "demo-fallback",
        providerRequestId: callId,
      });
    }

    session.calls[callId] = {
      contactIndex: idx,
      to,
      status: demo ? "ringing" : "started",
      answered: false,
      startedAt: Date.now(),
    };
    touchSession(session);
    const timeoutMs = timeoutSec * 1000;
    const started = Date.now();

    let lastStatus = session.calls[callId].status;
    let lastLoggedStatus = null;
    while (Date.now() - started < timeoutMs) {
      const call = session.calls[callId];
      if (!call) break;

      lastStatus = call.status;
      const normalized = normalizeCallStatus(lastStatus);
      if (normalized !== lastLoggedStatus) {
        lastLoggedStatus = normalized;
        logEvent(req, "CALL_STATUS_UPDATE", {
          sessionId,
          userId,
          contactIndex: idx,
          providerCallId: callId,
          status: normalized,
        });
      }

      if (session.status === "ANSWERED" || call.answered) {
        if (session.status !== "ANSWERED") {
          session.status = "ANSWERED";
          session.someoneAnswered = true;
          session.answeredByContactIndex = idx;
          session.answeredBy = {
            contactIndex: idx,
            to,
            callId,
          };
        }

        await endOtherOngoingCalls(session, callId);
        const result = buildAttemptResult({ finalStatus: "answered" });
        session.callAttempts[idx] = { status: result.finalStatus, answered: result.answered, message: result.message, code: result.code, at: Date.now() };
        touchSession(session);
        logEvent(req, "CALL_ATTEMPT_RESULT", {
          sessionId,
          userId,
          contactIndex: idx,
          providerCallId: callId,
          answered: result.answered,
          finalStatus: result.finalStatus,
          elapsedMs: Date.now() - attemptStartedAt,
        });

        return res.json({
          contactIndex: idx,
          callId,
          demo,
          ...result,
          status: result.finalStatus,
          answeredBy: session.answeredBy,
          stopRemaining: true,
        });
      }

      if (terminalStatuses.has(String(call.status || "").toLowerCase())) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const observedStatus = lastStatus || "unknown";
    const finalTerminal = terminalStatuses.has(String(observedStatus).toLowerCase());
    const normalizedFinalStatus = finalTerminal ? normalizeAttemptFinalStatus(observedStatus) : "timeout";
    const result = buildAttemptResult({ finalStatus: normalizedFinalStatus });

    session.callAttempts[idx] = { status: result.finalStatus, answered: result.answered, message: result.message, code: result.code, at: Date.now() };
    touchSession(session);
    logEvent(req, "CALL_ATTEMPT_RESULT", {
      sessionId,
      userId,
      contactIndex: idx,
      providerCallId: callId,
      answered: result.answered,
      finalStatus: result.finalStatus,
      elapsedMs: Date.now() - attemptStartedAt,
      reason: result.message,
      code: result.code,
    });

    return res.json({
      contactIndex: idx,
      callId,
      demo,
      ...result,
      status: result.finalStatus,
      terminal: finalTerminal,
      answeredBy: session.answeredBy,
      stopRemaining: session.status === "ANSWERED",
    });
  } catch (err) {
    logEvent(req, "CALL_ATTEMPT_RESULT", {
      sessionId: req?.params?.sessionId || null,
      userId: req?.user?.id || null,
      contactIndex: req?.params?.contactIndex || null,
      answered: false,
      finalStatus: "failed",
      reason: err.message || "Internal server error",
      code: "INTERNAL_ERROR",
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      code: "INTERNAL_ERROR",
      message: err.message || "Internal server error",
    });
  }
};

/**
 * POST /emergency/:sessionId/call-119
 * Auth required
 * Calls emergency services (defaults to 119) and marks the session.
 */
export const callEmergencyServices = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const callStartedAt = Date.now();

    const session = getSession(sessionId);
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    logEvent(req, "CALL_119_STARTED", {
      sessionId,
      userId,
      timeoutSec: null,
    });

    if (session.emergencyServicesCalled) {
      logEvent(req, "CALL_119_RESULT", {
        sessionId,
        userId,
        emergencyServicesCalled: true,
        finalStatus: "already-called",
        elapsedMs: Date.now() - callStartedAt,
      });
      return res.json({
        ok: true,
        success: true,
        emergencyServicesCalled: true,
        alreadyCalled: true,
        message: "119 already called for this session",
      });
    }

    const to = String(process.env.EMERGENCY_SERVICE_NUMBER || "119").trim();

    let callId;
    let demo = false;
    try {
      const result = await makeOutboundCall(to, {
        sessionId,
        contactIndex: 119,
        publicBaseUrl: process.env.PUBLIC_BASE_URL,
      });
      callId = result?.uuid;
      if (!callId) throw new Error("Vonage did not return uuid");
      logEvent(req, "CALL_PROVIDER_REQUESTED", {
        sessionId,
        userId,
        contactIndex: 119,
        provider: callProvider,
        providerRequestId: callId,
      });
      logEvent(req, "CALL_119_STATUS_UPDATE", {
        sessionId,
        userId,
        providerCallSid: callId,
        status: "initiated",
      });
    } catch (e) {
      if (!allowDemoCallFallback) {
        touchSession(session);
        const reason = toOperatorMessage(e) || "119 route unavailable";
        const code = toMachineCode(e, "CALL_119_FAILED");
        logEvent(req, "CALL_119_RESULT", {
          sessionId,
          userId,
          emergencyServicesCalled: false,
          finalStatus: "failed",
          elapsedMs: Date.now() - callStartedAt,
          reason,
          code,
        });
        return res.status(502).json({
          ok: false,
          success: false,
          emergencyServicesCalled: false,
          code,
          message: reason,
        });
      }
      demo = true;
      callId = `DEV_${sessionId}_119_${Date.now()}`;
      logEvent(req, "CALL_PROVIDER_REQUESTED", {
        sessionId,
        userId,
        contactIndex: 119,
        provider: "demo-fallback",
        providerRequestId: callId,
      });
      logEvent(req, "CALL_119_STATUS_UPDATE", {
        sessionId,
        userId,
        providerCallSid: callId,
        status: "initiated",
      });
    }

    session.calls[callId] = {
      contactIndex: 119,
      to,
      status: demo ? "ringing" : "started",
      answered: false,
      emergencyService: true,
      startedAt: Date.now(),
    };
    session.emergencyServicesCalled = true;
    touchSession(session);
    logEvent(req, "CALL_119_RESULT", {
      sessionId,
      userId,
      providerCallSid: callId,
      emergencyServicesCalled: true,
      finalStatus: "completed",
      elapsedMs: Date.now() - callStartedAt,
    });
    logEvent(req, "EMERGENCY_SESSION_SUMMARY", {
      sessionId,
      userId,
      messageSent: !!session?.messaging?.success,
      answeredByContactIndex: session?.answeredByContactIndex || null,
      emergencyServicesCalled: !!session?.emergencyServicesCalled,
      failedCalls: Object.values(session?.callAttempts || {}).filter((x) => !x?.answered).length,
    });

    return res.json({
      ok: true,
      success: true,
      emergencyServicesCalled: true,
      message: demo ? "119 call simulated (demo mode)" : "119 call placed",
      callId,
      demo,
      to,
    });
  } catch (err) {
    logEvent(req, "CALL_119_RESULT", {
      sessionId: req?.params?.sessionId || null,
      userId: req?.user?.id || null,
      emergencyServicesCalled: false,
      finalStatus: "failed",
      reason: err.message || "Internal server error",
      code: "INTERNAL_ERROR",
    });
    return res.status(500).json({
      ok: false,
      success: false,
      emergencyServicesCalled: false,
      code: "INTERNAL_ERROR",
      message: err.message || "Internal server error",
    });
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
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    const call = session.calls[callId];
    if (!call) return fail(res, 404, "CALL_NOT_FOUND", "Call not found");

    return res.json({
      status: call.status,
      answered: !!call.answered,
      terminal: terminalStatuses.has(call.status),
      answeredBy: session.answeredBy,
      sessionStatus: session.status,
    });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
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
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    return res.json({
      sessionId: session.id,
      sessionStatus: session.status,
      messaging: session.messaging || null,
      callAttempts: session.callAttempts || {},
      someoneAnswered: !!session.someoneAnswered,
      answeredByContactIndex: session.answeredByContactIndex,
      answeredBy: session.answeredBy,
      contactsCount: session.contacts.length,
      emergencyServicesCalled: !!session.emergencyServicesCalled,
      smsReport: session.smsReport || null,
    });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
  }
};

/**
 * POST /emergency/:sessionId/cancel
 * Auth required
 * Marks session cancelled and notifies contacts that user cancelled the process.
 */
export const cancelEmergency = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = getSession(sessionId);
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    if (session.status === "CANCELLED") {
      return res.json({
        ok: true,
        success: true,
        code: "ALREADY_CANCELLED",
        message: "This emergency was already cancelled.",
        sessionId,
        cancelled: true,
        emergencyServicesCalled: !!session.emergencyServicesCalled,
      });
    }

    session.status = "CANCELLED";
    touchSession(session);

    const cancelMessage = process.env.SOS_CANCEL_MESSAGE || "User has cancelled the emergency process.";
    const unicode = resolveUnicodeMode(cancelMessage);

    const notifyTargets = (session.contacts || [])
      .map((c) => String(c?.phone || "").trim())
      .filter(Boolean);

    const notifyResults = await Promise.allSettled(
      notifyTargets.map((to) =>
        sendNotifySMS({
          to,
          message: cancelMessage,
          unicode,
        })
      )
    );

    const sent = notifyResults.filter((r) => r.status === "fulfilled").length;
    const failed = notifyResults.length - sent;
    const userCancelMessage =
      failed === 0
        ? "Emergency cancelled. Your contacts were informed."
        : sent > 0
          ? "Emergency cancelled. Some contacts could not be informed."
          : "Emergency cancelled. We could not notify your contacts.";

    session.cancelReport = {
      notified: notifyResults.length,
      sent,
      failed,
      at: Date.now(),
    };
    touchSession(session);

    logEvent(req, "EMERGENCY_CANCELLED", {
      sessionId,
      userId,
      notified: notifyResults.length,
      sent,
      failed,
      emergencyServicesCalled: !!session.emergencyServicesCalled,
    });

    return res.json({
      ok: true,
      success: true,
      code: "CANCELLED",
      message: userCancelMessage,
      sessionId,
      cancelled: true,
      emergencyServicesCalled: !!session.emergencyServicesCalled,
      cancellationMessaging: {
        attempted: notifyResults.length,
        sent,
        failed,
      },
    });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
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
    const rawStatus = String(body.status || "").toLowerCase();
    const status = normalizeCallStatus(rawStatus);

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
        startedAt: Date.now(),
      };
    } else {
      session.calls[callId].status = status;
    }

    const idxFromWebhook = session.calls[callId]?.contactIndex;
    const commonStatusPayload = {
      sessionId,
      contactIndex: Number.isFinite(idxFromWebhook) ? idxFromWebhook : null,
      providerCallSid: callId,
      status,
      durationSec: Number.isFinite(Number(body.duration)) ? Number(body.duration) : null,
      code: body?.network_code || body?.status_code || null,
      reason: body?.reason || body?.error || body?.hangup_reason || null,
    };
    if (idxFromWebhook === 119) {
      logEvent(req, "CALL_119_STATUS_UPDATE", commonStatusPayload);
    } else {
      logEvent(req, "CALL_STATUS_UPDATE", commonStatusPayload);
    }

    if (Number.isFinite(idxFromWebhook) && idxFromWebhook > 0 && idxFromWebhook !== 119) {
      session.callAttempts[idxFromWebhook] = {
        status,
        answered: status === "answered",
        message: status === "answered" ? "Call answered" : `Call status: ${status}`,
        code: status === "answered" ? "ANSWERED" : String(status || "UNKNOWN").toUpperCase(),
        at: Date.now(),
      };
    }

    if (status === "answered" && session.status !== "ANSWERED") {
      session.status = "ANSWERED";
      session.calls[callId].answered = true;
      session.someoneAnswered = true;
      session.answeredByContactIndex = session.calls[callId].contactIndex;

      session.answeredBy = {
        contactIndex: session.calls[callId].contactIndex,
        to: session.calls[callId].to,
        callId,
      };

      await endOtherOngoingCalls(session, callId);
    }

    if (terminalStatuses.has(status) && session.calls[callId]) {
      session.calls[callId].endedAt = Date.now();
    }

    touchSession(session);

    return res.status(200).json({ ok: true });
  } catch {
    logEvent(req, "CALL_STATUS_UPDATE", {
      sessionId: req?.query?.sessionId || null,
      contactIndex: Number(req?.query?.contactIndex || null),
      providerCallSid: req?.body?.uuid || null,
      status: "failed",
      reason: "Webhook processing error",
    });
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
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    const idx = Number(req.query.contactIndex || 1);
    if (!Number.isFinite(idx) || idx < 1 || idx > session.contacts.length) {
      return fail(res, 400, "INVALID_CONTACT_INDEX", "Invalid contactIndex");
    }

    session.status = "ANSWERED";
    session.someoneAnswered = true;
    session.answeredByContactIndex = idx;
    session.answeredBy = {
      contactIndex: idx,
      to: session.contacts[idx - 1]?.phone || null,
      callId: "DEV_CALL",
    };

    // optional: mark all existing calls as completed
    for (const callId of Object.keys(session.calls)) {
      session.calls[callId].status = "completed";
      session.calls[callId].answered = false;
      session.calls[callId].endedAt = Date.now();
    }

    touchSession(session);

    return res.json({ ok: true, answeredBy: session.answeredBy });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
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
    if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "Session not found");
    if (session.userId !== userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

    session.status = "ACTIVE";
    session.answeredBy = null;
    session.someoneAnswered = false;
    session.answeredByContactIndex = null;
    session.calls = {};
    session.smsReport = null;
    session.emergencyServicesCalled = false;
    touchSession(session);

    return res.json({ ok: true, sessionStatus: session.status });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", err.message || "Internal server error");
  }
};
