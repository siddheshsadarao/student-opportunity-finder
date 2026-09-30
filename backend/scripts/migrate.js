/**
 * Creates the database (if missing) and runs database/schema.sql.
 *
 *   npm run db:migrate
 *
 * WARNING: schema.sql starts with DROP TABLE statements, so running this
 * deletes all existing data. That is intentional during development.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../database/schema.sql');

/** Connects to the built-in "postgres" database to create ours if needed. */
async function ensureDatabaseExists() {
  const admin = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
  });

  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    config.db.database,
  ]);

  if (!rows.length) {
    // The database name cannot be a bound parameter in CREATE DATABASE, so we
    // quote it with pg's identifier escaping instead of plain concatenation.
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(config.db.database)}`);
    console.log(`[migrate] Created database "${config.db.database}".`);
  } else {
    console.log(`[migrate] Database "${config.db.database}" already exists.`);
  }

  await admin.end();
}

async function run() {
  await ensureDatabaseExists();

  const sql = await fs.readFile(SCHEMA_PATH, 'utf8');

  const client = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });

  await client.connect();
  console.log('[migrate] Applying database/schema.sql ...');
  await client.query(sql);
  await client.end();

  console.log('[migrate] Done. Now run: npm run db:seed');
}

run().catch((error) => {
  console.error('[migrate] Failed:', error.message);
  process.exit(1);
});
