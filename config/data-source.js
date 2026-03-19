import { DataSource } from "typeorm";
import "dotenv/config";

const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: true,
  entities: [
    "./Model/User.js",
    "./Model/Contact.js",
    "./Model/CommunityReport.js",
    "./Model/Payment.js",
    "./Model/SmsLog.js",
    "./Model/TripSession.js",
    "./Model/NotificationDeviceToken.js",
    "./Model/PushNotificationLog.js",
  ],
  migrations: ["src/migrations/*.js"],
  ssl: {
    rejectUnauthorized: false,
  },
  extra: {
    ssl: {
      rejectUnauthorized: false,
    },
  },
  poolSize: 5,
});

export default AppDataSource;
