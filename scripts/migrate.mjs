/* =====================================================================
   ILP Academy 2026 — Auto Migration Runner
   ---------------------------------------------------------------------
   Applies every .sql file in supabase/migrations (in name order) to your
   Supabase Postgres database. The SQL is written to be 100% idempotent,
   so it is always safe to run again — nothing is dropped or duplicated.

   USAGE (locally):
     1. npm install
     2. export SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
        (Supabase Dashboard → Project Settings → Database → Connection string → URI)
     3. npm run migrate

   USAGE (CI / GitHub Actions):
     Set the repository secret SUPABASE_DB_URL — see .github/workflows/migrate.yml.
   ===================================================================== */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

const CONN =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!CONN) {
  console.error(
    "\n[ERR]  No database URL found.\n" +
      "   Set SUPABASE_DB_URL (or DATABASE_URL) to your Supabase connection string.\n" +
      "   Supabase Dashboard → Project Settings → Database → Connection string → URI\n"
  );
  process.exit(1);
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function run() {
  const files = listMigrations();
  if (!files.length) {
    console.log("No migration files found in supabase/migrations.");
    return;
  }

  const client = new pg.Client({
    connectionString: CONN,
    // Supabase requires SSL; allow self-signed on the pooler/direct host.
    ssl: { rejectUnauthorized: false },
  });

  console.log("→ Connecting to database…");
  await client.connect();
  console.log("[OK] Connected.\n");

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`→ Applying ${file} … `);
    try {
      await client.query(sql);
      console.log("done.");
    } catch (err) {
      console.log("FAILED.");
      console.error(`\n[ERR]  Error while applying ${file}:\n   ${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\n[OK] All migrations applied successfully. Database is up to date.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
