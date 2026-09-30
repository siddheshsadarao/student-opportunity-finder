/**
 * Loads environment variables from the .env file and exposes them as one
 * typed configuration object.
 *
 * Why a separate file?
 *  - Every other module imports "config" instead of touching process.env
 *    directly, so all configuration lives in one place.
 *  - We fail fast on start-up if a critical secret is missing, instead of
 *    discovering the problem later when a user tries to log in.
 */
import dotenv from 'dotenv';

dotenv.config();

/** Reads a variable and throws a clear error if it is missing. */
function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable "${key}". ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),

  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(required('DB_PORT', '5432')),
    database: required('DB_NAME', 'student_opportunity_finder'),
    user: required('DB_USER', 'postgres'),
    password: String(required('DB_PASSWORD')),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Extra origins allowed to call the API, comma separated. Use this when the
  // frontend is hosted somewhere else (for example a Netlify site) and calls
  // the API host directly rather than through a proxy.
  //   EXTRA_ORIGINS=https://my-site.netlify.app,https://www.mydomain.com
  extraOrigins: (process.env.EXTRA_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // Netlify site name only, e.g. "student-opportunity-finder". Setting this
  // allows that site's branch and deploy-preview URLs through CORS, which
  // would otherwise need to be listed one by one.
  netlifySiteName: (process.env.NETLIFY_SITE_NAME || '').trim(),

  recommendationServiceUrl:
    process.env.RECOMMENDATION_SERVICE_URL || 'http://127.0.0.1:8000',

  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@sof.com').toLowerCase(),
    // Used only by the seed script. Production deployments must provide it.
    password: process.env.ADMIN_PASSWORD || '',
  },

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

export default config;
