import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./client.mjs";
import { config } from "../config.mjs";
import { products } from "../catalog.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase() {
  if (!config.databaseUrl) {
    return {
      enabled: false,
    };
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  await pool.query(schemaSql);

  for (const product of products) {
    await pool.query(
      `insert into products (id, slug, code, name, price, currency, file_name, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update
       set slug = excluded.slug,
           code = excluded.code,
           name = excluded.name,
           price = excluded.price,
           currency = excluded.currency,
           file_name = excluded.file_name,
           active = excluded.active`,
      [
        product.id,
        product.slug,
        product.code,
        product.name,
        product.price,
        product.currency,
        product.fileName,
        product.active,
      ]
    );
  }

  return {
    enabled: true,
    seededProducts: products.length,
  };
}
