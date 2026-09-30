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
import { query, withTransaction } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getFullProfile } from '../services/profileService.js';

const SALT_ROUNDS = 10; // higher = slower = harder to brute force

/** Shapes a user row for the client (never include password_hash). */
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url || null,
  };
}

/**
 * POST /api/auth/register
 * Creates the user and an (empty) student profile in one transaction,
 * then returns a token so the student goes straight to onboarding.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, college, degree, branch, year, city } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const existing = await query('SELECT id FROM users WHERE email = $1', [normalisedEmail]);
  if (existing.rows.length) {
    throw ApiError.conflict('An account with this email already exists. Try logging in.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'student')
       RETURNING id, name, email, role, avatar_url`,
      [name.trim(), normalisedEmail, passwordHash]
    );
    const newUser = inserted.rows[0];

    // The registration form already collects some education details, so we
    // store them right away and the onboarding wizard pre-fills them.
    await client.query(
      `INSERT INTO student_profiles (user_id, college, degree, branch, year, city)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        newUser.id,
        college?.trim() || null,
        degree?.trim() || null,
        branch?.trim() || null,
        year ? Number(year) : null,
        city?.trim() || null,
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

  res.status(201).json({
    success: true,
    data: {
      token: signToken(user),
      user: publicUser(user),
      onboardingDone: false,
    },
  });
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
    'SELECT id, name, email, password_hash, role, avatar_url, is_active FROM users WHERE email = $1',
    [normalisedEmail]
  );
  const user = rows[0];

  // Note: we return the SAME message whether the email or the password was
  // wrong. Saying "no such email" would let an attacker discover which
  // addresses are registered.
  if (!user) throw ApiError.unauthorized('Incorrect email or password.');

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw ApiError.unauthorized('Incorrect email or password.');

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
  res.json({
    success: true,
    data: {
      message:
        'If an account exists for that email, a reset link will be sent. ' +
        'For this demo build, use the reset form below or contact the administrator.',
    },
  });
});

/**
 * POST /api/auth/reset-password
 *
 * Demo-only direct reset (no emailed token). It is intentionally limited to
 * student accounts so nobody can take over the admin account this way.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;
  const normalisedEmail = String(email).toLowerCase().trim();

  const { rows } = await query('SELECT id, role FROM users WHERE email = $1', [normalisedEmail]);
  const user = rows[0];

  if (!user || user.role !== 'student') {
    // Same generic answer either way, so this cannot be used to probe emails.
    return res.json({
      success: true,
      data: { message: 'If that student account exists, the password has been reset.' },
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

  res.json({
    success: true,
    data: { message: 'If that student account exists, the password has been reset.' },
  });
});

export default {
  register,
  login,
  adminLogin,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
