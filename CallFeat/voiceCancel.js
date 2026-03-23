// CallFeat/voiceCancel.js
import { Vonage } from "@vonage/server-sdk";
import fs from "fs";

const vonage = new Vonage({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: fs.readFileSync(process.env.VONAGE_PRIVATE_KEY),
});

export async function hangupCall(callId) {
  // Vonage: update a call to hang up
  // action is "hangup"
  return await vonage.voice.updateCall(callId, { action: "hangup" });
}
