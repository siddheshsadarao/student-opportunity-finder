/**
 * Saved (bookmarked) opportunities.
 *
 * saves_count on the opportunities table is kept in sync here so the admin
 * analytics page can show "most saved opportunities" without an expensive
 * COUNT over the whole saved_opportunities table.
 */
import { query, withTransaction } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { mapOpportunity } from './opportunityController.js';

/** GET /api/saved -- everything this student bookmarked. */
export const listSaved = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT
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
        TRUE AS is_saved,
        (SELECT a.status FROM applications a
          WHERE a.opportunity_id = o.id AND a.user_id = $1) AS application_status,
        sv.saved_at
     FROM saved_opportunities sv
     JOIN opportunities o ON o.id = sv.opportunity_id
     JOIN categories c ON c.id = o.category_id
    WHERE sv.user_id = $1
    ORDER BY sv.saved_at DESC`,
    [req.user.id]
  );

  res.json({
    success: true,
    data: rows.map((row) => ({ ...mapOpportunity(row), savedAt: row.saved_at })),
  });
});

/** POST /api/saved/:id -- bookmark an opportunity. */
export const saveOpportunity = asyncHandler(async (req, res) => {
  const opportunityId = Number(req.params.id);

  const exists = await query('SELECT id FROM opportunities WHERE id = $1', [opportunityId]);
  if (!exists.rows.length) throw ApiError.notFound('That opportunity could not be found.');

  const inserted = await withTransaction(async (client) => {
    // ON CONFLICT DO NOTHING means saving twice is harmless (returns 0 rows).
    const result = await client.query(
      `INSERT INTO saved_opportunities (user_id, opportunity_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, opportunity_id) DO NOTHING
       RETURNING id`,
      [req.user.id, opportunityId]
    );

    if (result.rows.length) {
      await client.query(
        'UPDATE opportunities SET saves_count = saves_count + 1 WHERE id = $1',
        [opportunityId]
      );
    }
    return result.rows.length > 0;
  });

  res.status(inserted ? 201 : 200).json({
    success: true,
    data: { saved: true, message: inserted ? 'Saved to your list.' : 'Already in your saved list.' },
  });
});

/** DELETE /api/saved/:id -- remove a bookmark. */
export const unsaveOpportunity = asyncHandler(async (req, res) => {
  const opportunityId = Number(req.params.id);

  const removed = await withTransaction(async (client) => {
    const result = await client.query(
      'DELETE FROM saved_opportunities WHERE user_id = $1 AND opportunity_id = $2 RETURNING id',
      [req.user.id, opportunityId]
    );

    if (result.rows.length) {
      // GREATEST keeps the counter from going negative if data ever drifts.
      await client.query(
        'UPDATE opportunities SET saves_count = GREATEST(0, saves_count - 1) WHERE id = $1',
        [opportunityId]
      );
    }
    return result.rows.length > 0;
  });

  if (!removed) throw ApiError.notFound('That opportunity was not in your saved list.');

  res.json({ success: true, data: { saved: false, message: 'Removed from your saved list.' } });
});

export default { listSaved, saveOpportunity, unsaveOpportunity };
