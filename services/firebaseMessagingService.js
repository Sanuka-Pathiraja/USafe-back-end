import { JWT } from "google-auth-library";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

function normalizePrivateKey(value) {
  if (!value) return null;
  return String(value).replace(/\\n/g, "\n");
}

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || null;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function isFirebaseConfigured() {
  const { projectId, clientEmail, privateKey } = getFirebaseConfig();
  return Boolean(projectId && clientEmail && privateKey);
}

async function getAccessToken() {
  const { clientEmail, privateKey } = getFirebaseConfig();
  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [FCM_SCOPE],
  });

  const { access_token: accessToken } = await client.authorize();
  return accessToken;
}

function buildEndpoint() {
  const { projectId } = getFirebaseConfig();
  return `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
}

function parseFcmError(payload) {
  const error = payload?.error;
  const details = Array.isArray(error?.details) ? error.details : [];
  const fcmDetail = details.find((item) => item?.["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError");

  return {
    httpStatus: error?.status || null,
    message: error?.message || null,
    fcmErrorCode: fcmDetail?.errorCode || null,
  };
}

function isTokenInvalid(payload) {
  const parsed = parseFcmError(payload);
  return parsed.fcmErrorCode === "UNREGISTERED" || parsed.fcmErrorCode === "INVALID_ARGUMENT";
}

export async function sendFcmMessage(message) {
  if (!isFirebaseConfigured()) {
    return {
      success: false,
      skipped: true,
      code: "FCM_NOT_CONFIGURED",
      message: "Firebase Cloud Messaging is not configured.",
    };
  }

  const accessToken = await getAccessToken();
  const response = await fetch(buildEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const parsedError = parseFcmError(payload);
    const error = new Error(parsedError.message || "FCM send failed");
    error.status = response.status;
    error.payload = payload;
    error.fcmErrorCode = parsedError.fcmErrorCode;
    error.httpStatusText = parsedError.httpStatus;
    throw error;
  }

  return {
    success: true,
    provider: "fcm",
    providerResponse: payload,
  };
}

export { isFirebaseConfigured, isTokenInvalid };
