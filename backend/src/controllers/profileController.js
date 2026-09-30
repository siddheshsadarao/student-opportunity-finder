/**
 * Student profile + onboarding endpoints.
 */
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getFullProfile, upsertProfile } from '../services/profileService.js';

/** GET /api/profile -- the logged-in student's full profile. */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await getFullProfile(req.user.id);
  if (!profile) throw ApiError.notFound('Profile not found.');
  res.json({ success: true, data: profile });
});

/** PUT /api/profile -- edit profile (used by the Profile page). */
export const updateProfile = asyncHandler(async (req, res) => {
  await upsertProfile(req.user.id, req.body);

  // The name and avatar live on the users table, not the profile table.
  if (req.body.name || req.body.avatarUrl !== undefined) {
    await query(
      `UPDATE users
          SET name       = COALESCE($1, name),
              avatar_url = COALESCE($2, avatar_url)
        WHERE id = $3`,
      [req.body.name?.trim() || null, req.body.avatarUrl ?? null, req.user.id]
    );
  }

  const profile = await getFullProfile(req.user.id);
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile/onboarding
 * Saves the whole multi-step wizard at once and marks onboarding complete.
 */
export const completeOnboarding = asyncHandler(async (req, res) => {
  await upsertProfile(req.user.id, { ...req.body, onboardingDone: true });

  if (req.body.name) {
    await query('UPDATE users SET name = $1 WHERE id = $2', [req.body.name.trim(), req.user.id]);
  }

  // Let the student know their feed is ready.
  await query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, $2, $3, 'match')`,
    [
      req.user.id,
      'Your recommendations are ready',
      'We used your skills and interests to find opportunities made for you.',
    ]
  );

  const profile = await getFullProfile(req.user.id);
  res.json({ success: true, data: profile });
});

export default { getProfile, updateProfile, completeOnboarding };
