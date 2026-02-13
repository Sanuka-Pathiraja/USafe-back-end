import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send USafe Emergency SMS
 * @param {string} phoneNumber - Receiver phone number (+94...)
 * @param {string} userName - User name
 * @param {string} location - Google Maps link or lat,lng
 */
export default function sendSMS(phoneNumber, userName) {
  return client.messages
    .create({
      body: `🚨 USafe Emergency Alert

Name: ${userName}
Time: ${new Date().toLocaleString()}

Please respond immediately.`,
      from: "USafe",
      to: phoneNumber,
    })
    .then((message) => {
      console.log("USafe SMS sent:", message.sid);
    })
    .catch((err) => {
      console.error("USafe SMS error:", err.message);
    });
}
