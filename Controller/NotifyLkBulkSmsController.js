import { sendNotifySMS } from "../CallFeat/notifylksms.js";

function maskPhone(raw) {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return null;
  return `******${s.slice(-3)}`;
}

export async function sendNotifyBulkSMS(req, res) {
  try {
    const DISABLE_SMS = process.env.DISABLE_SMS === "true";
    const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

    if (DISABLE_SMS) {
      return res.status(403).json({ ok: false, error: "SMS is disabled" });
    }
    if (DISABLE_BULK_SMS) {
      return res.status(403).json({ ok: false, error: "Bulk SMS is disabled" });
    }

    const { recipients, message, unicode = false, concurrency = 5 } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "recipients must be a non-empty array" });
    }

    if (!message && !recipients.some((r) => r?.message)) {
      return res.status(400).json({
        ok: false,
        error: "Provide 'message' OR provide per-recipient 'message'",
      });
    }

    const limit = clampInt(concurrency, 1, 20);

    console.log(
      JSON.stringify({
        event: "NOTIFY_BULK_REQUEST",
        route: req.originalUrl,
        total: recipients.length,
        concurrency: limit,
        recipients: recipients.map((r) => maskPhone(r?.to || r?.phone)),
        ts: new Date().toISOString(),
      })
    );

    const results = await runWithLimit(recipients, limit, async (r) => {
      const to = r?.to || r?.phone;
      const msg = applyTemplate(r?.message || message, r);

      return await sendNotifySMS({
        to,
        message: msg,
        unicode: Boolean(unicode),

        contact_fname: r?.fname,
        contact_lname: r?.lname,
        contact_email: r?.email,
        contact_address: r?.address,
        contact_group: r?.groupId,
      });
    });

    const success = results.filter((x) => x.ok).length;
    const failed = results.length - success;

    console.log(
      JSON.stringify({
        event: "NOTIFY_BULK_RESULT",
        route: req.originalUrl,
        sent: success,
        failed,
        total: results.length,
        ts: new Date().toISOString(),
      })
    );

    return res.json({
      ok: success > 0,
      sent: success,
      failed,
      total: results.length,
      results,
    });
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("sms is disabled")) {
      return res.status(403).json({ ok: false, error: "SMS is disabled" });
    }

    console.error(
      JSON.stringify({
        event: "NOTIFY_BULK_FAILED",
        route: req.originalUrl,
        error: e.message,
        ts: new Date().toISOString(),
      })
    );

    return res.status(500).json({ ok: false, error: e.message });
  }
}

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function applyTemplate(text, data) {
  if (!text) return text;
  return String(text)
    .replaceAll("{fname}", data?.fname ?? "")
    .replaceAll("{lname}", data?.lname ?? "")
    .replaceAll("{to}", data?.to ?? data?.phone ?? "");
}

async function runWithLimit(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const current = idx++;
        if (current >= items.length) break;

        const r = items[current];
        const to = r?.to || r?.phone;

        try {
          const resp = await worker(r);
          out[current] = { to, ok: true, response: resp };
        } catch (err) {
          out[current] = { to, ok: false, error: err?.message || String(err) };
        }
      }
    }
  );

  await Promise.all(runners);
  return out;
}
