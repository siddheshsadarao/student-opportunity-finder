/**
 * Entry point: checks the database connection, then starts the HTTP server.
 *
 * Run with:  npm run dev   (auto-restarts on file changes)
 *            npm start     (production)
 */
import app from './app.js';
import config from './config/env.js';
import { testConnection, pool } from './config/db.js';

async function start() {
  try {
    const now = await testConnection();
    console.log(`[db] Connected to PostgreSQL (${config.db.database}) at ${now}`);
  } catch (error) {
    console.error('[db] Could not connect to PostgreSQL.');
    console.error('     ' + error.message);
    console.error('     Check that PostgreSQL is running and backend/.env is correct.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[api] Student Opportunity Finder API running on http://localhost:${config.port}`);
    console.log(`[api] Environment: ${config.env}`);
    console.log(`[api] Recommendation service: ${config.recommendationServiceUrl}`);
  });

  // Close database connections cleanly on Ctrl+C.
  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
