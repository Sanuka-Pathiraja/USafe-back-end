import { normalizeNum } from "../utils/normalizeNumberFormat.js";

const NOTIFY_URL = "https://app.notify.lk/api/v1/send";

export async function sendNotifySMS({
  to,
  message,
  unicode = false,

  // OPTIONAL Notify.lk contact fields
  contact_fname,
  contact_lname,
  contact_email,
  contact_address,
  contact_group,
}) {
  // ✅ Feature flag (matches your backend style)
  const DISABLE_SMS = process.env.DISABLE_SMS === "true";
  if (DISABLE_SMS) {
    throw new Error("SMS is disabled");
  }

  const user_id = process.env.NOTIFY_USER_ID;
  const api_key = process.env.NOTIFY_API_KEY;
  const sender_id = process.env.NOTIFY_SENDER_ID;

  if (!user_id || !api_key || !sender_id) {
    throw new Error(
      "Missing Notify.lk env vars (NOTIFY_USER_ID / NOTIFY_API_KEY / NOTIFY_SENDER_ID)"
    );
  }

  if (!to) throw new Error("Missing 'to' number");
  if (!message) throw new Error("Missing 'message'");

  const payload = new URLSearchParams({
    user_id,
    api_key,
    sender_id,
    to: normalizeNum(to),
    message: String(message),
    ...(unicode ? { type: "unicode" } : {}),

    ...(contact_fname ? { contact_fname: String(contact_fname) } : {}),
    ...(contact_lname ? { contact_lname: String(contact_lname) } : {}),
    ...(contact_email ? { contact_email: String(contact_email) } : {}),
    ...(contact_address ? { contact_address: String(contact_address) } : {}),
    ...(contact_group !== undefined && contact_group !== null && contact_group !== ""
      ? { contact_group: String(contact_group) }
      : {}),
  });

  const res = await fetch(NOTIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Notify.lk HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data || data.status !== "success") {
    throw new Error(`Notify.lk failed: ${JSON.stringify(data)}`);
  }

  return data; // { status: "success", data: "Sent" }
}
