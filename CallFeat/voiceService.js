import { Vonage } from "@vonage/server-sdk";
import fs from "fs";

// Check if VONAGE_PRIVATE_KEY is set
if (!process.env.VONAGE_PRIVATE_KEY) {
  throw new Error("❌ VONAGE_PRIVATE_KEY is missing in .env");
}

// Check if the private key file exists
const privateKeyPath = process.env.VONAGE_PRIVATE_KEY;
if (!fs.existsSync(privateKeyPath)) {
  throw new Error(`❌ Private key file not found at: ${privateKeyPath}`);
}

// Initialize Vonage only if checks pass
const vonage = new Vonage({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: fs.readFileSync(privateKeyPath),
});

export default async function makeOutboundCall() {
  try {
    console.log("📞 Attempting to call:", "94769653219");
    console.log("📞 From number:", process.env.VONAGE_FROM_NUMBER);
    
    const response = await vonage.voice.createOutboundCall({
      to: [{ type: "phone", number: "94769653219" }],
      from: { type: "phone", number: process.env.VONAGE_FROM_NUMBER },
      ncco: [
        {
          action: "talk",
          language: "en-US",
          style: 0,
          premium: false,
          text: "Hello! This is a test call from USafe.",
        },
      ],
    });
    
    console.log("✅ Call initiated:", response);
    return response;
  } catch (error) {
    console.error("❌ Vonage API Error:", error.response?.data || error.message);
    throw error;
  }
}
