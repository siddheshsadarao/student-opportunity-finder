/**
 * Student profile + onboarding endpoints.
 */
import { query } from '../config/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getFullProfile, upsertProfile } from '../services/profileService.js';
import { resumeDirectory, resumeMimeTypes, validResumeSignature } from '../middleware/resumeUpload.js';

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

/** Store a private resume after basic file-signature validation. */
export const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a PDF, DOCX, PNG, JPG or WebP resume to upload.');
  const handle = await fs.open(req.file.path, 'r');
  const signature = Buffer.alloc(12);
  await handle.read(signature, 0, 12, 0);
  await handle.close();
  const extension = path.extname(req.file.originalname).toLowerCase();
  const valid = validResumeSignature(extension, signature);
  if (!valid) {
    await fs.unlink(req.file.path).catch(() => {});
    throw ApiError.badRequest('The file content does not match its resume file type.');
  }

  const previous = await query('SELECT resume_storage_name FROM student_profiles WHERE user_id = $1', [req.user.id]);
  const { rows } = await query(
    `UPDATE student_profiles
        SET resume_storage_name = $1, resume_original_name = $2, resume_mime_type = $3
      WHERE user_id = $4
      RETURNING resume_storage_name`,
    [req.file.filename, path.basename(req.file.originalname).slice(0, 180), resumeMimeTypes[extension], req.user.id]
  );
  if (!rows.length) {
    await fs.unlink(req.file.path).catch(() => {});
    throw ApiError.notFound('Student profile not found.');
  }
  if (previous.rows[0]?.resume_storage_name) {
    await fs.unlink(path.join(resumeDirectory, path.basename(previous.rows[0].resume_storage_name))).catch(() => {});
  }
  res.status(201).json({ success: true, data: { hasResume: true, resumeOriginalName: path.basename(req.file.originalname).slice(0, 180) } });
});

export const downloadResume = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT resume_storage_name, resume_original_name FROM student_profiles WHERE user_id = $1',
    [req.user.id]
  );
  const profile = rows[0];
  if (!profile?.resume_storage_name) throw ApiError.notFound('No resume is saved on this profile.');
  const filePath = path.join(resumeDirectory, path.basename(profile.resume_storage_name));
  res.download(filePath, profile.resume_original_name || 'resume');
});

export const deleteResume = asyncHandler(async (req, res) => {
  const current = await query('SELECT resume_storage_name FROM student_profiles WHERE user_id = $1', [req.user.id]);
  await query(
    `UPDATE student_profiles
        SET resume_storage_name = NULL, resume_original_name = NULL, resume_mime_type = NULL
      WHERE user_id = $1`,
    [req.user.id]
  );
  if (current.rows[0]?.resume_storage_name) {
    await fs.unlink(path.join(resumeDirectory, path.basename(current.rows[0].resume_storage_name))).catch(() => {});
  }
  res.json({ success: true, data: { hasResume: false } });
});

export default { getProfile, updateProfile, completeOnboarding, uploadResume, downloadResume, deleteResume };
