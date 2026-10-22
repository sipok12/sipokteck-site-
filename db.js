const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL absent : le serveur ne pourra pas accéder à PostgreSQL.");
}

const databaseUrl = (process.env.DATABASE_URL || "").replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === "production" || /neon\.tech|supabase\.(co|com)/i.test(process.env.DATABASE_URL || "")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", (err) => console.error("Erreur PostgreSQL inattendue :", err.message));

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { pool, query };
