/**
 * Builds the Express application (middleware + routes).
 *
 * The app is created here and started in server.js. Splitting them means the
 * app can be imported by a test file without opening a port.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import ApiError from './utils/ApiError.js';

const app = express();

// --- Trust the proxy in front of us ------------------------------------------
// In production the request path is:
//     browser -> Netlify function -> nginx -> this server
//
// Express does not trust proxy headers by default, so req.ip would be the
// socket address — 127.0.0.1, because nginx is on the same machine. Everything
// would then look like one visitor, and the rate limiter on /auth would count
// every student in the world into a single bucket: 20 attempts per 15 minutes
// for the entire site, not per person.
//
// The number is how many proxies to trust. One (nginx) is the hop that sets
// X-Forwarded-For last, so `1` takes the address nginx recorded rather than
// letting a caller spoof the whole chain.
app.set('trust proxy', 1);

// --- Security headers -------------------------------------------------------
// helmet sets a set of safe HTTP headers (no sniffing, no framing, etc.).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- CORS -------------------------------------------------------------------
// The React app runs on a different origin from the API (port 5173 in
// development, a Netlify domain in production), so the browser treats requests
// to the API as cross-origin. We allow only our own frontends rather than "*",
// which would let any website on the internet call this API with a user's
// token attached.
//
// Note: when the frontend is deployed to Netlify with the /api proxy from
// netlify.toml, requests reach this server from Netlify's servers and not from
// the browser, so CORS does not apply at all. This list matters for local
// development and for the "direct" deployment mode where the browser calls the
// API host itself.
const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...config.extraOrigins,
];

/**
 * Netlify gives every branch and pull request its own preview URL, such as
 * https://deploy-preview-42--your-site.netlify.app. Listing them all is
 * impossible, so we match the site's own Netlify subdomains by pattern.
 * NETLIFY_SITE_NAME is the site name only (e.g. "student-opportunity-finder").
 */
const netlifyPreviewPattern = config.netlifySiteName
  ? new RegExp(
      `^https://([a-z0-9-]+--)?${config.netlifySiteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.netlify\\.app$`
    )
  : null;

app.use(
  cors({
    origin(origin, callback) {
      // No origin = a server-to-server call or a tool such as curl/Postman.
      // These carry no browser cookies, so allowing them is safe.
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (netlifyPreviewPattern?.test(origin)) return callback(null, true);

      // A plain Error here would surface as a 500, which looks like a server
      // bug. This is a rejected request, not a crash, so say so with a 403.
      console.warn(`[cors] blocked origin: ${origin}`);
      return callback(
        ApiError.forbidden(
          `Origin ${origin} is not allowed to call this API. ` +
            'Add it to CLIENT_URL or EXTRA_ORIGINS in the backend .env file.'
        )
      );
    },
    credentials: true,
  })
);

// --- Body parsing -----------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Request logging --------------------------------------------------------
if (config.env === 'development') app.use(morgan('dev'));

// --- Routes -----------------------------------------------------------------
app.get('/', (req, res) =>
  res.json({
    success: true,
    data: {
      name: 'Student Opportunity Finder API',
      version: '1.0.0',
      docs: '/api/health',
    },
  })
);

app.use('/api', routes);

// --- Error handling (must be last) -----------------------------------------
app.use(notFound);
app.use(errorHandler);

export default app;
