/**
 * Public reference data: categories, skills and interests.
 * Used by the onboarding wizard, the Discover filters and the landing page.
 */
import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/categories -- with a live count of open opportunities. */
export const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.icon, c.color, c.description,
            COUNT(o.id) FILTER (
              WHERE o.is_active = TRUE AND o.deadline >= CURRENT_DATE
            )::int AS opportunity_count
       FROM categories c
       LEFT JOIN opportunities o ON o.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id`
  );
  res.json({ success: true, data: rows });
});

/** GET /api/skills?search=py -- searchable list for the skills tag input. */
export const listSkills = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const params = [];
  let where = '';

  if (search) {
    params.push(`%${search}%`);
    where = 'WHERE s.name ILIKE $1';
  }

  const { rows } = await query(
    `SELECT s.id, s.name, s.category,
            COUNT(os.opportunity_id)::int AS usage_count
       FROM skills s
       LEFT JOIN opportunity_skills os ON os.skill_id = s.id
       ${where}
      GROUP BY s.id
      ORDER BY usage_count DESC, s.name
      LIMIT 100`,
    params
  );
  res.json({ success: true, data: rows });
});

/** GET /api/interests */
export const listInterests = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id, name FROM interests ORDER BY name');
  res.json({ success: true, data: rows });
});

/**
 * GET /api/stats
 * The counters shown on the public landing page.
 */
export const getPublicStats = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT
        (SELECT COUNT(*)::int FROM opportunities
          WHERE is_active = TRUE AND deadline >= CURRENT_DATE) AS active_opportunities,
        (SELECT COUNT(*)::int FROM users WHERE role = 'student')     AS students,
        (SELECT COUNT(*)::int FROM categories)                       AS categories,
        (SELECT COUNT(DISTINCT organization)::int FROM opportunities) AS organizations`
  );
  res.json({ success: true, data: rows[0] });
});

export default { listCategories, listSkills, listInterests, getPublicStats };
