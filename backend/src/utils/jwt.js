/**
 * Helpers for creating and verifying JSON Web Tokens.
 *
 * How JWT authentication works in this project:
 *  1. The student logs in with email + password.
 *  2. We verify the password against the bcrypt hash stored in the database.
 *  3. We sign a token containing { id, role } with our secret key.
 *  4. The React app stores the token and sends it on every request as
 *     "Authorization: Bearer <token>".
 *  5. The auth middleware verifies the signature and attaches req.user.
 *
 * The token is signed, not encrypted -- anybody can read its contents, so we
 * never put sensitive data (like a password) inside it.
 */
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

/** Creates a signed token for a user row. */
export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/** Verifies a token and returns its payload, or throws if invalid/expired. */
export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export default { signToken, verifyToken };
