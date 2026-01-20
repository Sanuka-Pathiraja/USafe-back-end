import { DataSource } from "typeorm";
import "dotenv/config";

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: true,
  entities: [new URL("../Model/User.js", import.meta.url).pathname, new URL("../Model/Contact.js", import.meta.url).pathname],
  ssl: {
    rejectUnauthorized: false,
  },
  extra: {
    max: 20,
    connectionTimeoutMillis: 2000,
  },
});

export default AppDataSource;
