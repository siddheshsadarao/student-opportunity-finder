/**
 * Authentication and role-based authorization middleware.
 *
 *   protect          -> the request must carry a valid JWT
 *   restrictTo(role) -> the logged-in user must have one of the listed roles
 *   optionalAuth     -> attaches req.user if a token is present, but never fails
 *
 * "protect" runs before "restrictTo", for example:
 *   router.post('/', protect, restrictTo('admin'), createOpportunity);
 */
import { verifyToken } from '../utils/jwt.js';
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** Pulls the raw token out of the "Authorization: Bearer xxx" header. */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('No token provided. Please log in.');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session expired. Please log in again.');
    }
    throw ApiError.unauthorized('Invalid token. Please log in again.');
  }

  // Re-read the user from the database so a deleted or deactivated account
  // cannot keep using an old token.
  const { rows } = await query(
    'SELECT id, name, email, role, avatar_url, is_active FROM users WHERE id = $1',
    [payload.id]
  );

  const user = rows[0];
  if (!user) throw ApiError.unauthorized('This account no longer exists.');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated.');

  req.user = user;
  next();
});

export const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This area is restricted to ' + roles.join('/') + ' accounts.'));
    }
    next();
  };

/**
 * Used on public endpoints (e.g. browsing opportunities without logging in).
 * If a valid token is present we know who the visitor is and can include
 * personalised fields such as "is_saved"; otherwise we simply continue.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    const { rows } = await query(
      'SELECT id, name, email, role, avatar_url, is_active FROM users WHERE id = $1',
      [payload.id]
    );
    if (rows[0] && rows[0].is_active) req.user = rows[0];
  } catch {
    // Ignore a bad token here -- the route works fine for anonymous visitors.
  }
  next();
});

export default { protect, restrictTo, optionalAuth };
