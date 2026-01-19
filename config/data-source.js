import "dotenv/config";
import { DataSource } from "typeorm";

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST, // The Host from Supabase
  port: Number(process.env.DB_PORT), // 6543
  username: process.env.DB_USER, // postgres.xxxx
  password: process.env.DB_PASS, // Your password
  database: process.env.DB_NAME, // postgres
  synchronize: true,
  logging: true,
  entities: ["./Models/*.js"],
  // SUPABASE REQUIRES THIS:
  ssl: {
    rejectUnauthorized: false,
  },
});

export default AppDataSource;
