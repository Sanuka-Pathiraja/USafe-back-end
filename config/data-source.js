import { DataSource } from "typeorm";
import "dotenv/config";

const dbConnectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000);
const useSsl = process.env.DB_SSL !== "false";

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: true,
  // Includes TripSession so trip lifecycle APIs can read/write persistent session state.
  entities: ["./Model/User.js", "./Model/Contact.js", "./Model/CommunityReport.js", "./Model/Payment.js", "./Model/SmsLog.js", "./Model/TripSession.js"],
  migrations: ["src/migrations/*.js"],
  ssl: useSsl
    ? {
        rejectUnauthorized: false,
      }
    : false,
  extra: {
    max: 20,
    connectionTimeoutMillis: dbConnectionTimeout,
  },
});

export default AppDataSource;
