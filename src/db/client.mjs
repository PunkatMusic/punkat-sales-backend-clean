import pg from "pg";
import { config } from "../config.mjs";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl ? { rejectUnauthorized: false } : false,
});
