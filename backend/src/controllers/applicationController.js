/**
 * The application tracker.
 *
 * A student marks an opportunity as "Planning to Apply" and then moves it
 * along the pipeline: Applied -> Shortlisted -> Selected / Rejected.
 * The frontend shows this as a kanban board.
 */
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { mapOpportunity } from './opportunityController.js';

export const APPLICATION_STATUSES = [
  'Planning to Apply',
  'Applied',
  'Shortlisted',
  'Selected',
  'Rejected',
];

const APPLICATION_SELECT = `
  SELECT
    a.id AS application_id, a.status, a.notes, a.applied_on,
    a.created_at AS tracked_at, a.updated_at AS status_updated_at,
    o.id, o.title, o.organization, o.organization_logo, o.description,
    o.eligibility, o.benefits, o.location, o.mode, o.duration, o.stipend,
    o.deadline, o.application_url, o.source, o.is_demo, o.is_active,
    o.views_count, o.saves_count, o.created_at,
    c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
    c.icon AS category_icon, c.color AS category_color,
    COALESCE(
      (SELECT json_agg(s.name ORDER BY s.name)
         FROM opportunity_skills os
         JOIN skills s ON s.id = os.skill_id
        WHERE os.opportunity_id = o.id),
      '[]'
    ) AS skills,
    EXISTS (
      SELECT 1 FROM saved_opportunities sv
       WHERE sv.opportunity_id = o.id AND sv.user_id = a.user_id
    ) AS is_saved,
    a.status AS application_status
  FROM applications a
  JOIN opportunities o ON o.id = a.opportunity_id
  JOIN categories c ON c.id = o.category_id
`;

function mapApplication(row) {
  return {
    applicationId: row.application_id,
    status: row.status,
    notes: row.notes,
    appliedOn: row.applied_on,
    trackedAt: row.tracked_at,
    statusUpdatedAt: row.status_updated_at,
    opportunity: mapOpportunity(row),
  };
}

/** GET /api/applications -- all tracked applications, grouped by status. */
export const listApplications = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${APPLICATION_SELECT} WHERE a.user_id = $1 ORDER BY a.updated_at DESC`,
    [req.user.id]
  );

  const applications = rows.map(mapApplication);

  // Pre-group for the kanban board so the frontend does not have to.
  const grouped = APPLICATION_STATUSES.reduce((acc, status) => {
    acc[status] = applications.filter((a) => a.status === status);
    return acc;
  }, {});

  res.json({
    success: true,
    data: { applications, grouped, statuses: APPLICATION_STATUSES },
  });
});

/**
 * POST /api/applications/:opportunityId
 * Starts tracking an opportunity, or updates it if already tracked
 * (so clicking "Mark Applied" twice is safe).
 */
export const trackApplication = asyncHandler(async (req, res) => {
  const opportunityId = Number(req.params.opportunityId);
  const status = req.body.status || 'Planning to Apply';
  const notes = req.body.notes ?? null;

  if (!APPLICATION_STATUSES.includes(status)) {
    throw ApiError.badRequest('Invalid application status.');
  }

  const exists = await query('SELECT id FROM opportunities WHERE id = $1', [opportunityId]);
  if (!exists.rows.length) throw ApiError.notFound('That opportunity could not be found.');

  // "applied_on" is filled the first time the status becomes Applied or later.
  const setsAppliedDate = status !== 'Planning to Apply';

  const { rows } = await query(
    `INSERT INTO applications (user_id, opportunity_id, status, notes, applied_on)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_DATE ELSE NULL END)
     ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
         status     = EXCLUDED.status,
         notes      = COALESCE(EXCLUDED.notes, applications.notes),
         applied_on = COALESCE(applications.applied_on, EXCLUDED.applied_on)
     RETURNING id`,
    [req.user.id, opportunityId, status, notes, setsAppliedDate]
  );

  const detail = await query(`${APPLICATION_SELECT} WHERE a.id = $1`, [rows[0].id]);

  res.status(201).json({ success: true, data: mapApplication(detail.rows[0]) });
});

/** PATCH /api/applications/:id -- move a card to another column. */
export const updateApplication = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  // $1 is used both as a value and inside a comparison, so it is cast
  // explicitly -- otherwise PostgreSQL cannot decide on one type for it.
  const { rows } = await query(
    `UPDATE applications
        SET status     = $1::text,
            notes      = COALESCE($2, notes),
            applied_on = CASE
                            WHEN applied_on IS NOT NULL THEN applied_on
                            WHEN $1::text <> 'Planning to Apply' THEN CURRENT_DATE
                            ELSE NULL
                         END
      WHERE id = $3 AND user_id = $4
      RETURNING id`,
    [status, notes ?? null, req.params.id, req.user.id]
  );

  if (!rows.length) throw ApiError.notFound('That application was not found in your tracker.');

  const detail = await query(`${APPLICATION_SELECT} WHERE a.id = $1`, [rows[0].id]);
  res.json({ success: true, data: mapApplication(detail.rows[0]) });
});

/** DELETE /api/applications/:id -- stop tracking. */
export const deleteApplication = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM applications WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw ApiError.notFound('That application was not found in your tracker.');

  res.json({ success: true, data: { message: 'Removed from your tracker.' } });
});

export default { listApplications, trackApplication, updateApplication, deleteApplication };
