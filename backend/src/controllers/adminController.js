/**
 * Admin-only endpoints: opportunity CRUD, category management, student list
 * and the analytics used by the charts on the admin dashboard.
 *
 * Every route in this file sits behind `protect` + `restrictTo('admin')`,
 * so a student token can never reach them.
 */
import { query, withTransaction } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import slugify from '../utils/slugify.js';
import { resolveSkillIds } from '../services/taxonomyService.js';
import { mapOpportunity } from './opportunityController.js';
import { checkServiceHealth } from '../services/recommendationService.js';

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/opportunities
 * Like the public list but includes inactive and expired rows so the admin
 * can manage everything.
 */
export const listAllOpportunities = asyncHandler(async (req, res) => {
  const { search, category, status, page = 1, limit = 20 } = req.query;

  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(o.title ILIKE $${params.length} OR o.organization ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    where.push(`(c.slug = $${params.length} OR c.id::text = $${params.length})`);
  }
  if (status === 'active') where.push('o.is_active = TRUE AND o.deadline >= CURRENT_DATE');
  if (status === 'expired') where.push('o.deadline < CURRENT_DATE');
  if (status === 'inactive') where.push('o.is_active = FALSE');

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(limit) || 20));
  const offset = (pageNumber - 1) * pageSize;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM opportunities o
       JOIN categories c ON c.id = o.category_id ${whereClause}`,
    params
  );

  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT o.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
            c.icon AS category_icon, c.color AS category_color,
            COALESCE(
              (SELECT json_agg(s.name ORDER BY s.name)
                 FROM opportunity_skills os
                 JOIN skills s ON s.id = os.skill_id
                WHERE os.opportunity_id = o.id),
              '[]'
            ) AS skills,
            FALSE AS is_saved,
            NULL::text AS application_status
       FROM opportunities o
       JOIN categories c ON c.id = o.category_id
       ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: {
      opportunities: rows.map(mapOpportunity),
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: countResult.rows[0].total,
        totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / pageSize)),
      },
    },
  });
});

/** Inserts / updates the opportunity_skills rows for an opportunity. */
async function syncOpportunitySkills(client, opportunityId, skills) {
  const skillIds = await resolveSkillIds(client, skills);
  await client.query('DELETE FROM opportunity_skills WHERE opportunity_id = $1', [opportunityId]);
  for (const skillId of skillIds) {
    await client.query(
      'INSERT INTO opportunity_skills (opportunity_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [opportunityId, skillId]
    );
  }
}

/** POST /api/admin/opportunities -- create. */
export const createOpportunity = asyncHandler(async (req, res) => {
  const body = req.body;

  const opportunityId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO opportunities
          (title, organization, organization_logo, category_id, description,
           eligibility, benefits, location, mode, duration, stipend, deadline,
           application_url, source, is_demo, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        body.title.trim(),
        body.organization.trim(),
        body.organizationLogo || null,
        Number(body.categoryId),
        body.description.trim(),
        body.eligibility || null,
        body.benefits || null,
        body.location?.trim() || 'India',
        body.mode,
        body.duration || null,
        body.stipend || null,
        body.deadline,
        body.applicationUrl.trim(),
        body.source || null,
        body.isDemo ?? false,
        body.isActive ?? true,
        req.user.id,
      ]
    );

    const newId = rows[0].id;
    if (Array.isArray(body.skills)) await syncOpportunitySkills(client, newId, body.skills);
    return newId;
  });

  // Tell students whose preferred categories include this one.
  await query(
    `INSERT INTO notifications (user_id, title, message, type, opportunity_id)
     SELECT p.user_id,
            'New opportunity for you',
            $2 || ' at ' || $3 || ' was just added.',
            'match',
            $1
       FROM student_preferred_categories spc
       JOIN student_profiles p ON p.id = spc.profile_id
      WHERE spc.category_id = $4`,
    [opportunityId, req.body.title.trim(), req.body.organization.trim(), Number(req.body.categoryId)]
  );

  const created = await query(
    `SELECT o.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
            c.icon AS category_icon, c.color AS category_color,
            COALESCE((SELECT json_agg(s.name) FROM opportunity_skills os
                        JOIN skills s ON s.id = os.skill_id
                       WHERE os.opportunity_id = o.id), '[]') AS skills
       FROM opportunities o JOIN categories c ON c.id = o.category_id
      WHERE o.id = $1`,
    [opportunityId]
  );

  res.status(201).json({ success: true, data: mapOpportunity(created.rows[0]) });
});

/** PUT /api/admin/opportunities/:id -- update. */
export const updateOpportunity = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body;

  const exists = await query('SELECT id FROM opportunities WHERE id = $1', [id]);
  if (!exists.rows.length) throw ApiError.notFound('That opportunity could not be found.');

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE opportunities SET
          title = $1, organization = $2, organization_logo = $3, category_id = $4,
          description = $5, eligibility = $6, benefits = $7, location = $8,
          mode = $9, duration = $10, stipend = $11, deadline = $12,
          application_url = $13, source = $14, is_demo = $15, is_active = $16
        WHERE id = $17`,
      [
        body.title.trim(),
        body.organization.trim(),
        body.organizationLogo || null,
        Number(body.categoryId),
        body.description.trim(),
        body.eligibility || null,
        body.benefits || null,
        body.location?.trim() || 'India',
        body.mode,
        body.duration || null,
        body.stipend || null,
        body.deadline,
        body.applicationUrl.trim(),
        body.source || null,
        body.isDemo ?? false,
        body.isActive ?? true,
        id,
      ]
    );

    if (Array.isArray(body.skills)) await syncOpportunitySkills(client, id, body.skills);
  });

  const updated = await query(
    `SELECT o.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
            c.icon AS category_icon, c.color AS category_color,
            COALESCE((SELECT json_agg(s.name) FROM opportunity_skills os
                        JOIN skills s ON s.id = os.skill_id
                       WHERE os.opportunity_id = o.id), '[]') AS skills
       FROM opportunities o JOIN categories c ON c.id = o.category_id
      WHERE o.id = $1`,
    [id]
  );

  res.json({ success: true, data: mapOpportunity(updated.rows[0]) });
});

/** DELETE /api/admin/opportunities/:id */
export const deleteOpportunity = asyncHandler(async (req, res) => {
  const { rows } = await query('DELETE FROM opportunities WHERE id = $1 RETURNING id, title', [
    req.params.id,
  ]);
  if (!rows.length) throw ApiError.notFound('That opportunity could not be found.');

  res.json({ success: true, data: { message: `"${rows[0].title}" was deleted.` } });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** POST /api/admin/categories */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, icon, color, description } = req.body;
  const slug = slugify(name);

  const existing = await query('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (existing.rows.length) throw ApiError.conflict('A category with that name already exists.');

  const { rows } = await query(
    `INSERT INTO categories (name, slug, icon, color, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name.trim(), slug, icon || 'Sparkles', color || 'indigo', description || null]
  );

  res.status(201).json({ success: true, data: rows[0] });
});

/** PUT /api/admin/categories/:id */
export const updateCategory = asyncHandler(async (req, res) => {
  const { name, icon, color, description } = req.body;

  const { rows } = await query(
    `UPDATE categories
        SET name = $1, slug = $2, icon = COALESCE($3, icon),
            color = COALESCE($4, color), description = $5
      WHERE id = $6
      RETURNING *`,
    [name.trim(), slugify(name), icon || null, color || null, description || null, req.params.id]
  );
  if (!rows.length) throw ApiError.notFound('Category not found.');

  res.json({ success: true, data: rows[0] });
});

/**
 * DELETE /api/admin/categories/:id
 * Refused while opportunities still use the category (the foreign key is
 * ON DELETE RESTRICT), so we give a clear message instead of a 500.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = await query(
    'SELECT COUNT(*)::int AS count FROM opportunities WHERE category_id = $1',
    [req.params.id]
  );
  if (inUse.rows[0].count > 0) {
    throw ApiError.badRequest(
      `This category is used by ${inUse.rows[0].count} opportunities. Move or delete them first.`
    );
  }

  const { rows } = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) throw ApiError.notFound('Category not found.');

  res.json({ success: true, data: { message: 'Category deleted.' } });
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

/** GET /api/admin/students */
export const listStudents = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;

  const params = [];
  let where = "WHERE u.role = 'student'";
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length}
                    OR p.college ILIKE $${params.length})`;
  }

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM users u
       LEFT JOIN student_profiles p ON p.user_id = u.id ${where}`,
    params
  );

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(limit) || 20));
  params.push(pageSize, (pageNumber - 1) * pageSize);

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.created_at, u.is_active,
            p.college, p.degree, p.branch, p.year, p.city, p.career_goal,
            p.onboarding_done,
            (SELECT COUNT(*)::int FROM saved_opportunities sv WHERE sv.user_id = u.id) AS saved_count,
            (SELECT COUNT(*)::int FROM applications a WHERE a.user_id = u.id) AS application_count,
            COALESCE((SELECT json_agg(s.name) FROM student_skills ss
                        JOIN skills s ON s.id = ss.skill_id
                       WHERE ss.profile_id = p.id), '[]') AS skills
       FROM users u
       LEFT JOIN student_profiles p ON p.user_id = u.id
       ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: {
      students: rows,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: countResult.rows[0].total,
        totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / pageSize)),
      },
    },
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/analytics
 * Feeds the four statistic cards and the four Recharts charts.
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const [totals, byCategory, userGrowth, mostViewed, mostSaved, applicationStatuses] =
    await Promise.all([
      query(
        `SELECT
            (SELECT COUNT(*)::int FROM opportunities) AS total_opportunities,
            (SELECT COUNT(*)::int FROM opportunities
              WHERE is_active = TRUE AND deadline >= CURRENT_DATE) AS active_opportunities,
            (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS total_students,
            (SELECT COUNT(*)::int FROM applications) AS total_applications,
            (SELECT COUNT(*)::int FROM saved_opportunities) AS total_saves,
            (SELECT COUNT(*)::int FROM opportunity_views) AS total_views`
      ),
      query(
        `SELECT c.name, c.color, COUNT(o.id)::int AS count
           FROM categories c
           LEFT JOIN opportunities o ON o.category_id = c.id
          GROUP BY c.id
          ORDER BY count DESC`
      ),
      query(
        `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                date_trunc('month', created_at) AS sort_key,
                COUNT(*)::int AS students
           FROM users
          WHERE role = 'student' AND created_at >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY 1, 2
          ORDER BY 2`
      ),
      query(
        `SELECT o.id, o.title, o.organization, o.views_count AS value
           FROM opportunities o
          ORDER BY o.views_count DESC
          LIMIT 6`
      ),
      query(
        `SELECT o.id, o.title, o.organization, o.saves_count AS value
           FROM opportunities o
          ORDER BY o.saves_count DESC
          LIMIT 6`
      ),
      query(`SELECT status, COUNT(*)::int AS count FROM applications GROUP BY status`),
    ]);

  const recommendationService = await checkServiceHealth();

  res.json({
    success: true,
    data: {
      totals: totals.rows[0],
      opportunitiesByCategory: byCategory.rows,
      userGrowth: userGrowth.rows.map((r) => ({ month: r.month, students: r.students })),
      mostViewed: mostViewed.rows,
      mostSaved: mostSaved.rows,
      applicationStatuses: applicationStatuses.rows,
      recommendationService,
    },
  });
});

export default {
  listAllOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  createCategory,
  updateCategory,
  deleteCategory,
  listStudents,
  getAnalytics,
};
