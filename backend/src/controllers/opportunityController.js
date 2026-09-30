/**
 * Browsing opportunities: list with filters, single opportunity, featured
 * items for the landing page, and the filter option lists.
 *
 * These endpoints use `optionalAuth`. A logged-out visitor can still browse,
 * but when a token is present we also return "isSaved" / "applicationStatus"
 * so the cards show the right button state.
 */
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { balanceBySource } from '../utils/sourceDiversity.js';

/**
 * The SELECT used by every listing endpoint.
 *
 * $1 is the viewer's user id (or NULL when logged out). It is used by the two
 * EXISTS sub-queries that tell the UI whether this student already saved or
 * applied to the opportunity.
 */
const BASE_SELECT = `
  SELECT
    o.id, o.title, o.organization, o.organization_logo, o.description,
    o.eligibility, o.benefits, o.location, o.mode, o.duration, o.stipend,
    o.deadline, o.application_url, o.source, o.is_demo, o.is_external, o.is_active,
    o.views_count, o.saves_count, o.created_at,
    c.id   AS category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    c.icon AS category_icon,
    c.color AS category_color,
    COALESCE(
      (SELECT json_agg(s.name ORDER BY s.name)
         FROM opportunity_skills os
         JOIN skills s ON s.id = os.skill_id
        WHERE os.opportunity_id = o.id),
      '[]'
    ) AS skills,
    EXISTS (
      SELECT 1 FROM saved_opportunities sv
       WHERE sv.opportunity_id = o.id AND sv.user_id = $1
    ) AS is_saved,
    (SELECT a.status FROM applications a
      WHERE a.opportunity_id = o.id AND a.user_id = $1) AS application_status
  FROM opportunities o
  JOIN categories c ON c.id = o.category_id
`;

/** Converts a database row into the shape the React app expects. */
export function mapOpportunity(row) {
  return {
    id: row.id,
    title: row.title,
    organization: row.organization,
    organizationLogo: row.organization_logo,
    description: row.description,
    eligibility: row.eligibility,
    benefits: row.benefits,
    location: row.location,
    mode: row.mode,
    duration: row.duration,
    stipend: row.stipend,
    deadline: row.deadline,
    applicationUrl: row.application_url,
    source: row.source,
    isDemo: row.is_demo,
    isExternal: row.is_external,
    isActive: row.is_active,
    viewsCount: row.views_count,
    savesCount: row.saves_count,
    createdAt: row.created_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      icon: row.category_icon,
      color: row.category_color,
    },
    skills: row.skills || [],
    isSaved: row.is_saved ?? false,
    applicationStatus: row.application_status ?? null,
    // Filled in later by the recommendation controller when relevant.
    matchScore: row.match_score ?? null,
  };
}

/**
 * Replaces every "?" in a WHERE clause with $1, $2, ... starting at `start`.
 *
 * Why this helper exists: the listing endpoint runs two queries with the same
 * filters -- a COUNT (no viewer parameter) and the main SELECT (where $1 is
 * the viewer id). Building the clause once with "?" and numbering it twice
 * keeps the two queries guaranteed identical.
 */
function numberPlaceholders(clause, start) {
  let index = start;
  return clause.replace(/\?/g, () => `$${index++}`);
}

/**
 * GET /api/opportunities
 *
 * Supported query parameters:
 *   search, category, skills, location, mode, deadlineBefore,
 *   organization, includeExpired, sort, page, limit
 *
 * Every user value goes into the params array as $n -- never into the SQL
 * string -- which is what makes these queries injection-safe.
 */
export const listOpportunities = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    skills,
    location,
    mode,
    deadlineBefore,
    organization,
    includeExpired,
    sort = 'relevant',
    page = 1,
    limit = 12,
  } = req.query;

  const viewerId = req.user?.id ?? null;

  // Filter values only -- the viewer id is added separately below, because
  // the COUNT query does not need it.
  const filterParams = [];
  const where = ['o.is_active = TRUE'];

  // Hide opportunities whose deadline has passed unless explicitly asked for.
  if (includeExpired !== 'true') where.push('o.deadline >= CURRENT_DATE');

  if (search) {
    // The same text is compared against three columns, so it is pushed
    // three times -- one value per "?" placeholder.
    filterParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    where.push('(o.title ILIKE ? OR o.organization ILIKE ? OR o.description ILIKE ?)');
  }

  if (category) {
    // Accept either a slug ("internship") or a numeric id.
    filterParams.push(category, category);
    where.push('(c.slug = ? OR c.id::text = ?)');
  }

  if (mode) {
    filterParams.push(mode);
    where.push('o.mode = ?');
  }

  if (location) {
    filterParams.push(`%${location}%`);
    where.push('o.location ILIKE ?');
  }

  if (organization) {
    filterParams.push(`%${organization}%`);
    where.push('o.organization ILIKE ?');
  }

  if (deadlineBefore) {
    filterParams.push(deadlineBefore);
    where.push('o.deadline <= ?::date');
  }

  // skills=Python,SQL -> keep opportunities that require ANY of those skills.
  const skillList = String(skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (skillList.length) {
    filterParams.push(skillList);
    where.push(`EXISTS (
      SELECT 1 FROM opportunity_skills os
        JOIN skills s ON s.id = os.skill_id
       WHERE os.opportunity_id = o.id AND s.name = ANY(?::text[])
    )`);
  }

  const rawWhere = `WHERE ${where.join(' AND ')}`;

  // Sorting is chosen from a fixed map so a user cannot inject SQL here.
  //
  // "relevant" is the default, and it deliberately interleaves sources.
  //
  // Why: one source (Unstop) legitimately lists far more than the others, so
  // ordering purely by date filled whole pages with it and the site looked
  // like a copy of that one website. ROW_NUMBER partitioned by source takes
  // each site's soonest deadline first, then each site's second, and so on —
  // so every page shows a spread of sources no matter how lopsided the
  // underlying counts are. Nothing is hidden; only the order changes.
  const sortOptions = {
    newest: 'o.created_at DESC',
    deadline: 'o.deadline ASC',
    popular: 'o.views_count DESC, o.saves_count DESC',
    // Externally imported rows partition by their source. Everything added by
    // hand shares one bucket: each demo row carries its own descriptive
    // `source` string, so partitioning on that raw column gave all 28 of them
    // a slot in the first round and diluted the very balance this is for.
    relevant:
      "ROW_NUMBER() OVER (" +
      "PARTITION BY CASE WHEN o.is_external THEN o.source ELSE '__manual__' END " +
      'ORDER BY o.deadline ASC), o.deadline ASC',
  };
  const orderBy = sortOptions[sort] || sortOptions.relevant;

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(limit) || 12));
  const offset = (pageNumber - 1) * pageSize;

  // COUNT query: filters are numbered from $1 (no viewer parameter).
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
       FROM opportunities o
       JOIN categories c ON c.id = o.category_id
       ${numberPlaceholders(rawWhere, 1)}`,
    filterParams
  );
  const total = countResult.rows[0].total;

  // Main query: $1 is the viewer, so the filters start at $2.
  const selectParams = [viewerId, ...filterParams, pageSize, offset];
  const { rows } = await query(
    `${BASE_SELECT}
     ${numberPlaceholders(rawWhere, 2)}
     ORDER BY ${orderBy}
     LIMIT $${selectParams.length - 1} OFFSET $${selectParams.length}`,
    selectParams
  );

  res.json({
    success: true,
    data: {
      opportunities: rows.map(mapOpportunity),
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    },
  });
});

/**
 * GET /api/opportunities/:id
 * Also records a view (used for analytics and for "Most viewed" charts).
 */
export const getOpportunity = asyncHandler(async (req, res) => {
  const viewerId = req.user?.id ?? null;

  const { rows } = await query(`${BASE_SELECT} WHERE o.id = $2`, [viewerId, req.params.id]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('That opportunity could not be found.');

  // Record the view. Anonymous visitors are logged with a NULL user_id.
  await query('INSERT INTO opportunity_views (user_id, opportunity_id) VALUES ($1, $2)', [
    viewerId,
    row.id,
  ]);
  await query('UPDATE opportunities SET views_count = views_count + 1 WHERE id = $1', [row.id]);

  res.json({ success: true, data: mapOpportunity(row) });
});

/**
 * GET /api/opportunities/featured
 * A short list for the public landing page: soonest deadlines first.
 */
export const getFeatured = asyncHandler(async (req, res) => {
  const viewerId = req.user?.id ?? null;
  const { rows } = await query(
    `${BASE_SELECT}
      WHERE o.is_active = TRUE AND o.deadline >= CURRENT_DATE
      ORDER BY ROW_NUMBER() OVER (
        PARTITION BY CASE WHEN o.is_external THEN o.source ELSE '__manual__' END
        ORDER BY o.saves_count DESC, o.deadline ASC
      ), o.saves_count DESC, o.deadline ASC
      LIMIT 60`,
    [viewerId]
  );
  res.json({ success: true, data: balanceBySource(rows.map(mapOpportunity), 6) });
});

/**
 * GET /api/opportunities/filters
 * Everything the Discover page needs to build its filter dropdowns.
 */
export const getFilterOptions = asyncHandler(async (req, res) => {
  const [categories, skills, locations, organizations] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.slug, c.icon, c.color,
              COUNT(o.id) FILTER (WHERE o.is_active AND o.deadline >= CURRENT_DATE)::int AS count
         FROM categories c
         LEFT JOIN opportunities o ON o.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name`
    ),
    query(
      `SELECT s.name, COUNT(os.opportunity_id)::int AS count
         FROM skills s
         JOIN opportunity_skills os ON os.skill_id = s.id
        GROUP BY s.name
        ORDER BY count DESC, s.name
        LIMIT 40`
    ),
    query(
      `SELECT DISTINCT location FROM opportunities
        WHERE is_active = TRUE ORDER BY location`
    ),
    query(
      `SELECT DISTINCT organization FROM opportunities
        WHERE is_active = TRUE ORDER BY organization`
    ),
  ]);

  res.json({
    success: true,
    data: {
      categories: categories.rows,
      skills: skills.rows.map((r) => r.name),
      locations: locations.rows.map((r) => r.location),
      organizations: organizations.rows.map((r) => r.organization),
      modes: ['Remote', 'Hybrid', 'On-site'],
      sortOptions: [
        { value: 'relevant', label: 'Best Mix' },
        { value: 'newest', label: 'Newest' },
        { value: 'deadline', label: 'Deadline Soon' },
        { value: 'popular', label: 'Popular' },
      ],
    },
  });
});

/**
 * GET /api/opportunities/calendar
 * Deadlines grouped for the calendar page.
 */
export const getCalendar = asyncHandler(async (req, res) => {
  const viewerId = req.user?.id ?? null;
  const { from, to, onlySaved } = req.query;

  const params = [viewerId];
  const where = ['o.is_active = TRUE'];

  if (from) {
    params.push(from);
    where.push(`o.deadline >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`o.deadline <= $${params.length}::date`);
  }
  if (onlySaved === 'true' && viewerId) {
    where.push(`EXISTS (
      SELECT 1 FROM saved_opportunities sv
       WHERE sv.opportunity_id = o.id AND sv.user_id = $1
    )`);
  }

  const { rows } = await query(
    `${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.deadline ASC`,
    params
  );

  res.json({ success: true, data: rows.map(mapOpportunity) });
});

export default {
  listOpportunities,
  getOpportunity,
  getFeatured,
  getFilterOptions,
  getCalendar,
};
