/**
 * PostgreSQL connection pool.
 *
 * A "pool" keeps a small set of open connections and reuses them. Opening a
 * new TCP connection for every request would be slow, so the pool is created
 * once when the server starts and shared by every controller.
 *
 * IMPORTANT (security): every query in this project uses parameterised
 * queries -- values are passed in the `params` array and never concatenated
 * into the SQL string. This is what prevents SQL injection.
 *
 *   GOOD:  query('SELECT * FROM users WHERE email = $1', [email])
 *   BAD:   query(`SELECT * FROM users WHERE email = '${email}'`)
 */
import pg from 'pg';
import config from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
});

// pg returns DATE columns as JS Date objects in the server's timezone, which
// can shift a deadline by one day. We want the plain "YYYY-MM-DD" string.
pg.types.setTypeParser(1082, (value) => value);

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

/**
 * Runs a single SQL statement.
 * @param {string} text   SQL with $1, $2 ... placeholders
 * @param {Array}  params Values for the placeholders
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (config.env === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.log(`[db] slow query (${ms}ms): ${text.slice(0, 80)}...`);
  }
  return result;
}

/**
 * Runs several statements inside one transaction.
 * If the callback throws, everything is rolled back.
 *
 * Used when we must write to more than one table and cannot afford a
 * half-finished state -- for example creating a user AND their profile.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Simple connectivity check used on server start-up. */
export async function testConnection() {
  const { rows } = await query('SELECT NOW() AS now');
  return rows[0].now;
}

export default { pool, query, withTransaction, testConnection };
