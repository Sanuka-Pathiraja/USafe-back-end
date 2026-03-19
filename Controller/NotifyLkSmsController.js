import { sendNotifySMS } from "../CallFeat/notifylksms.js";

function maskPhone(raw) {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return null;
  return `******${s.slice(-3)}`;
}

export async function sendEmergencyNotifications(req, res) {
  try {
    const DISABLE_SMS = process.env.DISABLE_SMS === "true";
    if (DISABLE_SMS) {
      return res.status(403).json({ ok: false, error: "SMS is disabled" });
    }

    const { sessionId } = req.params;
    const { contacts, locationText, unicode = false } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "contacts must be a non-empty array",
      });
    }

    const msg =
      `USafe Alert: Possible danger detected.\n` +
      `Session: ${sessionId}\n` +
      `Location: ${locationText || "Unknown"}\n` +
      `Please check on the user immediately.`;

    console.log(
      JSON.stringify({
        event: "NOTIFY_EMERGENCY_REQUEST",
        sessionId,
        total: contacts.length,
        contacts: contacts.map((c) => maskPhone(c.phone || c.to)),
        ts: new Date().toISOString(),
      })
    );

    const results = await Promise.allSettled(
      contacts.map((c) =>
        sendNotifySMS({
          to: c.phone || c.to,
          message: msg,
          unicode: Boolean(unicode),
        })
      )
    );

    const formatted = results.map((r, i) => {
      const to = contacts[i]?.phone || contacts[i]?.to;
      if (r.status === "fulfilled") return { to, ok: true, response: r.value };
      return { to, ok: false, error: r.reason?.message || String(r.reason) };
    });

    const successCount = formatted.filter((x) => x.ok).length;

    console.log(
      JSON.stringify({
        event: "NOTIFY_EMERGENCY_RESULT",
        sessionId,
        sent: successCount,
        failed: formatted.length - successCount,
        total: formatted.length,
        ts: new Date().toISOString(),
      })
    );

    return res.json({
      ok: successCount > 0,
      sessionId,
      sent: successCount,
      total: formatted.length,
      results: formatted,
    });
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("sms is disabled")) {
      return res.status(403).json({ ok: false, error: "SMS is disabled" });
    }

    console.error(
      JSON.stringify({
        event: "NOTIFY_EMERGENCY_FAILED",
        route: req.originalUrl,
        error: e.message,
        ts: new Date().toISOString(),
      })
    );

    return res.status(500).json({ ok: false, error: e.message });
  }
}
