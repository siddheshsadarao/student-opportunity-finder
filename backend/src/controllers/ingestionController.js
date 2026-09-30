/**
 * Admin view of the automatic ingestion system.
 *
 * The Python ingester writes to the database directly; this controller only
 * reads what it did and lets the admin control which sources are enabled and
 * moderate anything waiting for review.
 *
 * Deliberately, the admin panel cannot trigger a scrape over HTTP. Ingestion
 * is a scheduled background job: letting a web request start it would make a
 * page hang for minutes and would allow the job to be run repeatedly, which
 * would be impolite to the sites we fetch from.
 */
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { mapOpportunity } from './opportunityController.js';

/**
 * GET /api/admin/ingestion
 * Source registry, the last runs, and a per-source count of live listings.
 */
export const getIngestionOverview = asyncHandler(async (req, res) => {
  const [sources, runs, totals, pendingCount] = await Promise.all([
    query(
      `SELECT s.id, s.key, s.name, s.homepage, s.kind, s.is_enabled, s.auto_approve,
              s.rate_limit_secs, s.notes, s.last_run_at,
              COUNT(o.id) FILTER (
                WHERE o.is_active AND o.deadline >= CURRENT_DATE
              )::int AS live_count
         FROM ingestion_sources s
         LEFT JOIN opportunities o ON o.source = s.key
        GROUP BY s.id
        ORDER BY s.id`
    ),
    query(
      `SELECT id, source_key, started_at, finished_at, status,
              fetched_count, created_count, updated_count, skipped_count, error_message
         FROM ingestion_runs
        ORDER BY started_at DESC
        LIMIT 20`
    ),
    query(
      `SELECT
          COUNT(*) FILTER (WHERE is_external)::int                       AS external_total,
          COUNT(*) FILTER (WHERE is_external AND is_active
                             AND deadline >= CURRENT_DATE)::int          AS external_live,
          COUNT(*) FILTER (WHERE NOT is_external)::int                   AS manual_total,
          MAX(ingested_at)                                               AS last_ingested_at
         FROM opportunities`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM opportunities WHERE review_status = 'pending'`
    ),
  ]);

  res.json({
    success: true,
    data: {
      sources: sources.rows,
      runs: runs.rows,
      totals: totals.rows[0],
      pendingCount: pendingCount.rows[0].count,
    },
  });
});

/**
 * PATCH /api/admin/ingestion/sources/:key
 * Enable/disable a source or change whether its listings auto-publish.
 * Useful when a source starts returning poor data — no code change needed.
 */
export const updateSource = asyncHandler(async (req, res) => {
  const { isEnabled, autoApprove } = req.body;

  const { rows } = await query(
    `UPDATE ingestion_sources
        SET is_enabled   = COALESCE($1, is_enabled),
            auto_approve = COALESCE($2, auto_approve)
      WHERE key = $3
      RETURNING id, key, name, is_enabled, auto_approve`,
    [
      typeof isEnabled === 'boolean' ? isEnabled : null,
      typeof autoApprove === 'boolean' ? autoApprove : null,
      req.params.key,
    ]
  );

  if (!rows.length) throw ApiError.notFound('That source does not exist.');
  res.json({ success: true, data: rows[0] });
});

/**
 * GET /api/admin/ingestion/pending
 * The review queue: listings from sources whose auto_approve is off.
 */
export const listPending = asyncHandler(async (req, res) => {
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
      WHERE o.review_status = 'pending'
      ORDER BY o.ingested_at DESC NULLS LAST
      LIMIT 100`
  );

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...mapOpportunity(row),
      source: row.source,
      sourceUrl: row.source_url,
      ingestedAt: row.ingested_at,
    })),
  });
});

/**
 * PATCH /api/admin/ingestion/review/:id
 * Approve or reject one pending listing.
 *
 * A rejected listing is kept with review_status = 'rejected' rather than
 * deleted, so the next ingestion run does not simply re-import it.
 */
export const reviewOpportunity = asyncHandler(async (req, res) => {
  const { decision } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    throw ApiError.badRequest("Decision must be 'approved' or 'rejected'.");
  }

  const { rows } = await query(
    `UPDATE opportunities
        SET review_status = $1,
            is_active     = ($1 = 'approved')
      WHERE id = $2
      RETURNING id, title, review_status`,
    [decision, req.params.id]
  );

  if (!rows.length) throw ApiError.notFound('That opportunity does not exist.');

  res.json({
    success: true,
    data: {
      ...rows[0],
      message: `"${rows[0].title}" was ${decision}.`,
    },
  });
});

export default { getIngestionOverview, updateSource, listPending, reviewOpportunity };
