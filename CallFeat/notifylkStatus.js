const NOTIFY_STATUS_URL = "https://app.notify.lk/api/v1/status";

export async function checkNotifyBalance() {
  const user_id = process.env.NOTIFY_USER_ID;
  const api_key = process.env.NOTIFY_API_KEY;

  if (!user_id || !api_key) {
    throw new Error("Missing Notify.lk env vars (NOTIFY_USER_ID / NOTIFY_API_KEY)");
  }

  const url =
    `${NOTIFY_STATUS_URL}?` +
    new URLSearchParams({ user_id, api_key }).toString();

  const res = await fetch(url, { method: "GET" });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Notify.lk HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data || data.status !== "success" || !data.data) {
    throw new Error(`Notify.lk status failed: ${JSON.stringify(data)}`);
  }

  // data.data = { active: true, acc_balance: 3500.00 }
  return data.data;
}
