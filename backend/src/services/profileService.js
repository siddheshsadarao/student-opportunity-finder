/**
 * All database work related to a student's profile lives here.
 *
 * Keeping it in a service (instead of inside the controller) means the
 * recommendation controller, the auth controller and the profile controller
 * can all reuse the exact same queries.
 */
import { query, withTransaction } from '../config/db.js';
import { resolveSkillIds, resolveInterestIds, resolveCategoryIds } from './taxonomyService.js';

/**
 * Loads a complete student profile: the profile row plus their skills,
 * interests and preferred categories.
 * Returns null if the user has no profile row yet.
 */
export async function getFullProfile(userId) {
  const { rows } = await query(
    `SELECT p.*, u.name, u.email, u.avatar_url, u.created_at AS joined_at
       FROM student_profiles p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1`,
    [userId]
  );

  const profile = rows[0];
  if (!profile) return null;

  const [skills, interests, categories] = await Promise.all([
    query(
      `SELECT s.id, s.name, ss.proficiency
         FROM student_skills ss
         JOIN skills s ON s.id = ss.skill_id
        WHERE ss.profile_id = $1
        ORDER BY s.name`,
      [profile.id]
    ),
    query(
      `SELECT i.id, i.name
         FROM student_interests si
         JOIN interests i ON i.id = si.interest_id
        WHERE si.profile_id = $1
        ORDER BY i.name`,
      [profile.id]
    ),
    query(
      `SELECT c.id, c.name, c.slug
         FROM student_preferred_categories spc
         JOIN categories c ON c.id = spc.category_id
        WHERE spc.profile_id = $1
        ORDER BY c.name`,
      [profile.id]
    ),
  ]);

  return {
    id: profile.id,
    userId: profile.user_id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    joinedAt: profile.joined_at,
    college: profile.college,
    degree: profile.degree,
    branch: profile.branch,
    year: profile.year,
    city: profile.city,
    careerGoal: profile.career_goal,
    preferredMode: profile.preferred_mode,
    preferredLocation: profile.preferred_location,
    bio: profile.bio,
    onboardingDone: profile.onboarding_done,
    skills: skills.rows,
    interests: interests.rows,
    preferredCategories: categories.rows,
    completion: calculateCompletion({
      ...profile,
      skills: skills.rows,
      interests: interests.rows,
      preferredCategories: categories.rows,
    }),
  };
}

/**
 * Profile strength, shown on the Profile page as "Profile Strength: 85%".
 *
 * Each field is worth a fixed number of points. The list of missing items is
 * returned too, so the UI can suggest exactly what to add next.
 */
export function calculateCompletion(profile) {
  const checks = [
    { key: 'college', label: 'Add your college', points: 10, done: !!profile.college },
    { key: 'degree', label: 'Add your degree', points: 10, done: !!profile.degree },
    { key: 'branch', label: 'Add your branch', points: 10, done: !!profile.branch },
    { key: 'year', label: 'Add your current year', points: 10, done: !!profile.year },
    { key: 'city', label: 'Add your city', points: 5, done: !!profile.city },
    { key: 'careerGoal', label: 'Choose a career goal', points: 10, done: !!profile.career_goal },
    {
      key: 'skills',
      label: 'Add at least 3 skills to improve your recommendations',
      points: 20,
      done: (profile.skills || []).length >= 3,
    },
    {
      key: 'interests',
      label: 'Add at least 2 interests',
      points: 15,
      done: (profile.interests || []).length >= 2,
    },
    {
      key: 'preferredCategories',
      label: 'Pick the opportunity types you care about',
      points: 5,
      done: (profile.preferredCategories || []).length >= 1,
    },
    { key: 'bio', label: 'Write a short bio', points: 5, done: !!profile.bio },
  ];

  const earned = checks.filter((c) => c.done).reduce((sum, c) => sum + c.points, 0);
  const total = checks.reduce((sum, c) => sum + c.points, 0);

  return {
    percentage: Math.round((earned / total) * 100),
    suggestions: checks.filter((c) => !c.done).map((c) => c.label),
  };
}

/**
 * Creates or updates a student profile together with their skills, interests
 * and preferred categories.
 *
 * Everything happens inside one transaction: if adding the skills fails, the
 * profile update is rolled back too, so we never store half the data.
 */
export async function upsertProfile(userId, data) {
  return withTransaction(async (client) => {
    // 1. Create the profile row if it does not exist, otherwise update it.
    //    COALESCE keeps the existing value whenever the caller sends null,
    //    so a partial update (e.g. only "city") does not wipe other fields.
    const { rows } = await client.query(
      `INSERT INTO student_profiles
              (user_id, college, degree, year, branch, city, career_goal,
               preferred_mode, preferred_location, bio, onboarding_done)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Any'), $9, $10, COALESCE($11, FALSE))
       ON CONFLICT (user_id) DO UPDATE SET
              college            = COALESCE(EXCLUDED.college,            student_profiles.college),
              degree             = COALESCE(EXCLUDED.degree,             student_profiles.degree),
              year               = COALESCE(EXCLUDED.year,               student_profiles.year),
              branch             = COALESCE(EXCLUDED.branch,             student_profiles.branch),
              city               = COALESCE(EXCLUDED.city,               student_profiles.city),
              career_goal        = COALESCE(EXCLUDED.career_goal,        student_profiles.career_goal),
              preferred_mode     = COALESCE(EXCLUDED.preferred_mode,     student_profiles.preferred_mode),
              preferred_location = COALESCE(EXCLUDED.preferred_location, student_profiles.preferred_location),
              bio                = COALESCE(EXCLUDED.bio,                student_profiles.bio),
              onboarding_done    = student_profiles.onboarding_done OR EXCLUDED.onboarding_done
       RETURNING id`,
      [
        userId,
        data.college ?? null,
        data.degree ?? null,
        data.year ?? null,
        data.branch ?? null,
        data.city ?? null,
        data.careerGoal ?? null,
        data.preferredMode ?? null,
        data.preferredLocation ?? null,
        data.bio ?? null,
        data.onboardingDone ?? null,
      ]
    );

    const profileId = rows[0].id;

    // 2. Replace the skill list only when the caller actually sent one.
    if (Array.isArray(data.skills)) {
      const skillIds = await resolveSkillIds(client, data.skills);
      await client.query('DELETE FROM student_skills WHERE profile_id = $1', [profileId]);
      for (const skillId of skillIds) {
        await client.query(
          'INSERT INTO student_skills (profile_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [profileId, skillId]
        );
      }
    }

    // 3. Same for interests.
    if (Array.isArray(data.interests)) {
      const interestIds = await resolveInterestIds(client, data.interests);
      await client.query('DELETE FROM student_interests WHERE profile_id = $1', [profileId]);
      for (const interestId of interestIds) {
        await client.query(
          'INSERT INTO student_interests (profile_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [profileId, interestId]
        );
      }
    }

    // 4. And for preferred opportunity categories.
    if (Array.isArray(data.preferredCategories)) {
      const categoryIds = await resolveCategoryIds(client, data.preferredCategories);
      await client.query('DELETE FROM student_preferred_categories WHERE profile_id = $1', [profileId]);
      for (const categoryId of categoryIds) {
        await client.query(
          'INSERT INTO student_preferred_categories (profile_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [profileId, categoryId]
        );
      }
    }

    return profileId;
  });
}

export default { getFullProfile, upsertProfile, calculateCompletion };
