// PostgreSQL migration runner for reviewed Prisma-generated SQL. No engine downloads.
// A transaction + advisory lock makes concurrent and repeated starts safe.
const { Client } = require("pg");
const { readdir, readFile } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");
async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(657231094)");
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_kytew_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    );
    const root = path.resolve(__dirname, "../apps/api/prisma/migrations");
    const dirs = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of dirs) {
      const sql = await readFile(
        path.join(root, name, "migration.sql"),
        "utf8",
      );
      if (!sql.trim()) throw new Error(`Empty migration: ${name}`);
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query(
        'SELECT checksum FROM "_kytew_migrations" WHERE name=$1',
        [name],
      );
      if (prior.rowCount) {
        if (prior.rows[0].checksum !== checksum)
          throw new Error(`Applied migration was modified: ${name}`);
        console.log(`Unchanged: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO "_kytew_migrations" (name, checksum) VALUES ($1,$2)',
        [name, checksum],
      );
      console.log(`Applied: ${name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
