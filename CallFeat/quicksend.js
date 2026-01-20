import axios from "axios";

/**
 * QuickSend SMS Integration
 */

const QUICKSEND_EMAIL = process.env.QUICKSEND_EMAIL;
const QUICKSEND_API_KEY = process.env.QUICKSEND_API_KEY;

const BASE_URL = "https://quicksend.lk/Client/api.php";

function assertQuickSendEnv() {
  if (!QUICKSEND_EMAIL) throw new Error("❌ QUICKSEND_EMAIL is missing in .env");
  if (!QUICKSEND_API_KEY) throw new Error("❌ QUICKSEND_API_KEY is missing in .env");
}

function formatAxiosError(err) {
  return err?.response?.data || err?.message || "Unknown QuickSend error";
}

export async function sendSingleSMS(to, msg, senderID = "QKSendDemo") {
  assertQuickSendEnv();
  if (!to) throw new Error("❌ sendSingleSMS: 'to' is required");
  if (!msg) throw new Error("❌ sendSingleSMS: 'msg' is required");

  try {
    const response = await axios.post(
      `${BASE_URL}?FUN=SEND_SINGLE`,
      { senderID, to, msg },
      {
        auth: { username: QUICKSEND_EMAIL, password: QUICKSEND_API_KEY },
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("Single SMS Response:", response.data);
    return response.data;
  } catch (err) {
    const details = formatAxiosError(err);
    console.error("Error sending single SMS:", details);
    throw new Error(typeof details === "string" ? details : JSON.stringify(details));
  }
}

export async function sendBulkSameSMS(numbers, msg, senderID = "QKSendDemo") {
  assertQuickSendEnv();
  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error("❌ sendBulkSameSMS: 'numbers' must be a non-empty array");
  }
  if (!msg) throw new Error("❌ sendBulkSameSMS: 'msg' is required");

  try {
    const response = await axios.post(
      `${BASE_URL}?FUN=SEND_BULK_SAME`,
      {
        check_cost: false,
        senderID,
        to: numbers,
        msg,
      },
      {
        auth: { username: QUICKSEND_EMAIL, password: QUICKSEND_API_KEY },
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("Bulk Same SMS Response:", response.data);
    return response.data;
  } catch (err) {
    const details = formatAxiosError(err);
    console.error("Error sending bulk same SMS:", details);
    throw new Error(typeof details === "string" ? details : JSON.stringify(details));
  }
}

export async function checkBalance() {
  assertQuickSendEnv();

  try {
    const response = await axios.post(
      `${BASE_URL}?FUN=CHECK_BALANCE`,
      {},
      {
        auth: { username: QUICKSEND_EMAIL, password: QUICKSEND_API_KEY },
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("QuickSend Balance:", response.data);
    return response.data;
  } catch (err) {
    const details = formatAxiosError(err);
    console.error("Error checking balance:", details);
    throw new Error(typeof details === "string" ? details : JSON.stringify(details));
  }
}
