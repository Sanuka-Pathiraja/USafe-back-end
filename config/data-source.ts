import { DataSource } from "typeorm";
import "dotenv/config";

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: true,
  entities: ["./Model/User.js", "./Model/Contact.js", "./Model/CommunityReport.js", "./Model/Payment.js"],
  migrations: ["src/migrations/*.ts"],
  ssl: { rejectUnauthorized: false },
  extra: { max: 20, connectionTimeoutMillis: 2000 },
});

export default AppDataSource;
