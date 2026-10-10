/**
 * Authentication: register, login, admin login, current user, password change.
 *
 * Password handling:
 *  - We never store the password itself. bcrypt turns it into a one-way hash
 *    with a random "salt", so two students with the same password still get
 *    different hashes and the original text cannot be recovered.
 *  - On login we hash the entered password again and compare the hashes.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getFullProfile } from '../services/profileService.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';

const SALT_ROUNDS = 10; // higher = slower = harder to brute force

/** Shapes a user row for the client (never include password_hash). */
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url || null,
    emailVerified: user.email_verified ?? true,
  };
}

const hashCode = (code) => createHash('sha256').update(String(code)).digest('hex');

async function issueVerification(userId, email) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await query(
    `UPDATE users SET verification_code_hash = $1,
                      verification_expires_at = NOW() + INTERVAL '10 minutes',
                      verification_attempts = 0 WHERE id = $2`,
    [hashCode(code), userId]
  );
  try {
    await sendVerificationEmail(email, code);
    return true;
  } catch (error) {
    console.error(`[email] Verification send failed for user ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * POST /api/auth/register
 * Creates the user and an (empty) student profile in one transaction,
 * then sends a short-lived email code before creating an authenticated session.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, college, degree, branch, year, city, phone, state } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const existing = await query('SELECT id, email, password_hash, role, email_verified FROM users WHERE email = $1', [normalisedEmail]);
  if (existing.rows.length) {
    const pending = existing.rows[0];
    if (pending.role === 'student' && !pending.email_verified && await bcrypt.compare(password, pending.password_hash)) {
      const verificationSent = await issueVerification(pending.id, pending.email);
      return res.status(200).json({ success: true, data: { verificationRequired: true, verificationSent, email: pending.email } });
    }
    throw ApiError.conflict('An account with this email already exists. Try logging in.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, 'student', FALSE)
       RETURNING id, name, email, role, avatar_url, email_verified`,
      [name.trim(), normalisedEmail, passwordHash]
    );
    const newUser = inserted.rows[0];

    // The registration form already collects some education details, so we
    // store them right away and the onboarding wizard pre-fills them.
    await client.query(
      `INSERT INTO student_profiles (user_id, college, degree, branch, year, city, phone, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newUser.id,
        college?.trim() || null,
        degree?.trim() || null,
        branch?.trim() || null,
        year ? Number(year) : null,
        city?.trim() || null,
        phone?.trim() || null,
        state?.trim() || null,
      ]
    );

    // A friendly first notification.
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, 'system')`,
      [
        newUser.id,
        'Welcome to Student Opportunity Finder',
        'Complete your profile to unlock personalised opportunity recommendations.',
      ]
    );

    return newUser;
  });

  const verificationSent = await issueVerification(user.id, user.email);
  res.status(201).json({
    success: true,
    data: {
      verificationRequired: true,
      verificationSent,
      email: user.email,
    },
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email).toLowerCase().trim();
  const code = String(req.body.code).trim();
  const { rows } = await query(
    `SELECT id, name, email, role, avatar_url, email_verified,
            verification_code_hash, verification_expires_at, verification_attempts
       FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user || user.role !== 'student') throw ApiError.badRequest('That verification request is no longer available. Register again or request a new code.');
  if (user.email_verified) throw ApiError.badRequest('This email is already verified. Please log in.');
  if (!user.verification_code_hash || new Date(user.verification_expires_at) <= new Date()) throw ApiError.badRequest('That code expired. Request a new verification code.');
  if (user.verification_attempts >= 5) throw ApiError.tooManyRequests('Too many incorrect codes. Request a new code.');

  const expected = Buffer.from(user.verification_code_hash, 'hex');
  const supplied = Buffer.from(hashCode(code), 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    await query('UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = $1', [user.id]);
    throw ApiError.badRequest('That code is incorrect. Check the email and try again.');
  }

  await query(
    `UPDATE users SET email_verified = TRUE, verification_code_hash = NULL,
                      verification_expires_at = NULL, verification_attempts = 0 WHERE id = $1`,
    [user.id]
  );
  const profile = await query('SELECT onboarding_done FROM student_profiles WHERE user_id = $1', [user.id]);
  const verifiedUser = { ...user, email_verified: true };
  res.json({ success: true, data: { token: signToken(verifiedUser), user: publicUser(verifiedUser), onboardingDone: profile.rows[0]?.onboarding_done ?? false } });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const email = String(req.body.email).toLowerCase().trim();
  const { rows } = await query("SELECT id, email, email_verified FROM users WHERE email = $1 AND role = 'student'", [email]);
  const sent = rows[0] && !rows[0].email_verified
    ? await issueVerification(rows[0].id, rows[0].email)
    : false;
  res.json({ success: true, data: { sent, message: sent ? 'A fresh code has been sent.' : 'No code was sent. Check the email address and mail configuration.' } });
});

/**
 * POST /api/auth/login
 * Works for both students and admins. The response includes the role so the
 * React app knows which dashboard to open.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const { rows } = await query(
    'SELECT id, name, email, password_hash, role, avatar_url, is_active, email_verified FROM users WHERE email = $1',
    [normalisedEmail]
  );
  const user = rows[0];

  // Note: we return the SAME message whether the email or the password was
  // wrong. Saying "no such email" would let an attacker discover which
  // addresses are registered.
  if (!user) throw ApiError.unauthorized('Incorrect email or password.');

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw ApiError.unauthorized('Incorrect email or password.');

  if (user.role === 'student' && !user.email_verified) throw ApiError.forbidden('Verify your email before logging in. Use the resend code option on the registration page.');

  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated.');

  let onboardingDone = true;
  if (user.role === 'student') {
    const profile = await query(
      'SELECT onboarding_done FROM student_profiles WHERE user_id = $1',
      [user.id]
    );
    onboardingDone = profile.rows[0]?.onboarding_done ?? false;
  }

  res.json({
    success: true,
    data: { token: signToken(user), user: publicUser(user), onboardingDone },
  });
});

/**
 * POST /api/auth/admin/login
 * Same check as login but refuses non-admin accounts, so a student cannot
 * sign in through the admin screen.
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const { rows } = await query(
    'SELECT id, name, email, password_hash, role, avatar_url, is_active FROM users WHERE email = $1',
    [normalisedEmail]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  if (user.role !== 'admin') {
    throw ApiError.forbidden('This login is for administrator accounts only.');
  }
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated.');

  res.json({
    success: true,
    data: { token: signToken(user), user: publicUser(user), onboardingDone: true },
  });
});

/**
 * GET /api/auth/me
 * Used by the React app on page refresh to restore the session from the
 * stored token.
 */
export const getMe = asyncHandler(async (req, res) => {
  const profile = req.user.role === 'student' ? await getFullProfile(req.user.id) : null;

  res.json({
    success: true,
    data: {
      user: publicUser(req.user),
      profile,
      onboardingDone: req.user.role === 'admin' ? true : profile?.onboardingDone ?? false,
    },
  });
});

/** PATCH /api/auth/password -- change password while logged in. */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect.');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

  res.json({ success: true, data: { message: 'Password updated successfully.' } });
});

/**
 * POST /api/auth/forgot-password
 *
 * A real product would email a one-time reset link. Sending email needs an
 * SMTP account, which is out of scope for this semester project, so we
 * confirm the request without revealing whether the email is registered.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email).toLowerCase().trim();
  const { rows } = await query("SELECT id, email FROM users WHERE email = $1 AND role = 'student' AND email_verified = TRUE", [email]);
  let sent = false;
  if (rows[0]) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await query(`UPDATE users SET password_reset_hash = $1,
                                  password_reset_expires_at = NOW() + INTERVAL '10 minutes',
                                  password_reset_attempts = 0 WHERE id = $2`, [hashCode(code), rows[0].id]);
    try {
      await sendPasswordResetEmail(email, code);
      sent = true;
    } catch (error) {
      console.error(`[email] Password reset send failed for user ${rows[0].id}: ${error.message}`);
    }
  }
  res.json({ success: true, data: { sent, message: sent ? 'A password reset code has been sent.' : 'If that verified student account exists, a reset code will be sent.' } });
});

/**
 * POST /api/auth/reset-password
 *
 * Completes a reset only with a short-lived, single-use email code.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const { rows } = await query(`SELECT id, role, password_reset_hash, password_reset_expires_at, password_reset_attempts
                                  FROM users WHERE email = $1`, [normalisedEmail]);
  const user = rows[0];

  if (!user || user.role !== 'student' || !user.password_reset_hash) {
    // Same generic answer either way, so this cannot be used to probe emails.
    return res.json({
      success: true,
      data: { message: 'If that student account exists, a valid reset request is required.' },
    });
  }

  if (new Date(user.password_reset_expires_at) <= new Date()) throw ApiError.badRequest('That reset code expired. Request a new one.');
  if (user.password_reset_attempts >= 5) throw ApiError.tooManyRequests('Too many incorrect codes. Request a new one.');
  const expected = Buffer.from(user.password_reset_hash, 'hex');
  const supplied = Buffer.from(hashCode(code || ''), 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    await query('UPDATE users SET password_reset_attempts = password_reset_attempts + 1 WHERE id = $1', [user.id]);
    throw ApiError.badRequest('That reset code is incorrect.');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(`UPDATE users SET password_hash = $1, password_reset_hash = NULL,
                               password_reset_expires_at = NULL, password_reset_attempts = 0
                WHERE id = $2`, [passwordHash, user.id]);

  res.json({
    success: true,
    data: { message: 'Password reset successfully. You can now log in.' },
  });
});

export default {
  register,
  verifyEmail,
  resendVerification,
  login,
  adminLogin,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
