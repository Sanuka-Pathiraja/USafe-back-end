import { sendNotifySMS } from "../CallFeat/notifylksms.js";

export async function sendSms({ to, body }) {
  return sendNotifySMS({
    to,
    message: body,
    unicode: /[^\x00-\x7F]/.test(String(body || "")),
  });
}

export function buildStartMessage({ contactName, userName, tripName, durationMinutes }) {
  return `Hi ${contactName}, ${userName} is starting a trip: '${tripName}'. They expect to arrive safely in ${durationMinutes} mins. You are their emergency contact. No action needed right now.`;
}

export function buildSafeMessage({ userName, tripName }) {
  return `${userName} has safely ended their trip: '${tripName}'. Thank you for being their emergency contact!`;
}

export function buildEmergencyMessage({ userName, tripName, mapsLink }) {
  return `🚨 URGENT: ${userName} failed to check in for their trip '${tripName}'. Last known location: ${mapsLink}. Please contact them immediately.`;
}
