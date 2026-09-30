/**
 * Personalised recommendations and the student dashboard summary.
 */
import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';
import { mapOpportunity } from './opportunityController.js';
import { getRecommendations, explainRecommendation } from '../services/recommendationService.js';
import { balanceBySource } from '../utils/sourceDiversity.js';

/**
 * Takes the scores returned by the recommendation engine and loads the full
 * opportunity rows for them, keeping the engine's ordering.
 */
async function hydrate(userId, results) {
  if (!results.length) return [];

  const ids = results.map((r) => r.opportunity_id);

  const { rows } = await query(
    `SELECT
        o.id, o.title, o.organization, o.organization_logo, o.description,
        o.eligibility, o.benefits, o.location, o.mode, o.duration, o.stipend,
        o.deadline, o.application_url, o.source, o.is_demo, o.is_external, o.is_active,
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
           WHERE sv.opportunity_id = o.id AND sv.user_id = $1
        ) AS is_saved,
        (SELECT a.status FROM applications a
          WHERE a.opportunity_id = o.id AND a.user_id = $1) AS application_status
     FROM opportunities o
     JOIN categories c ON c.id = o.category_id
    WHERE o.id = ANY($2::int[]) AND o.is_active = TRUE`,
    [userId, ids]
  );

  const byId = new Map(rows.map((row) => [row.id, row]));

  return results
    .filter((r) => byId.has(r.opportunity_id))
    .map((r) => ({
      ...mapOpportunity(byId.get(r.opportunity_id)),
      matchScore: r.recommendation_score,
      matchReasons: r.reasons || [],
      // The full signal-by-signal analysis, when the ML engine supplied one.
      matchAnalysis: r.analysis || null,
    }));
}

/**
 * GET /api/recommendations?limit=20
 * The "Recommended for you" feed.
 */
export const getMyRecommendations = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const candidateLimit = Math.min(200, Math.max(limit, limit * 6));
  const { engine, results } = await getRecommendations(req.user.id, candidateLimit);
  const opportunities = balanceBySource(await hydrate(req.user.id, results), limit);

  res.json({
    success: true,
    data: {
      opportunities,
      engine, // 'ml' when FastAPI answered, 'fallback' when it was offline
      count: opportunities.length,
    },
  });
});

/**
 * GET /api/recommendations/:id/explain
 * "Why this matches you" on the opportunity details page.
 *
 * Returns the score, the human-readable reasons and the component breakdown
 * (text similarity, skill overlap, category, mode, location) so the UI can
 * show exactly how the percentage was produced.
 */
export const explainMatch = asyncHandler(async (req, res) => {
  const opportunityId = Number(req.params.id);
  const { engine, match } = await explainRecommendation(req.user.id, opportunityId);

  res.json({
    success: true,
    data: {
      opportunityId,
      matchScore: match?.recommendation_score ?? null,
      reasons: match?.reasons ?? [],
      breakdown: match?.breakdown ?? null,
      weights: match?.weights ?? null,
      analysis: match?.analysis ?? null,
      engine,
    },
  });
});

/**
 * GET /api/dashboard
 * Everything the student dashboard shows in one request: the four statistic
 * cards, the top recommendations and the deadlines coming up.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [savedCount, applicationCount, upcomingCount, statusBreakdown] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM saved_opportunities WHERE user_id = $1', [userId]),
    query('SELECT COUNT(*)::int AS count FROM applications WHERE user_id = $1', [userId]),
    query(
      `SELECT COUNT(*)::int AS count
         FROM saved_opportunities sv
         JOIN opportunities o ON o.id = sv.opportunity_id
        WHERE sv.user_id = $1
          AND o.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [userId]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM applications
        WHERE user_id = $1 GROUP BY status`,
      [userId]
    ),
  ]);

  // Top 6 recommendations for the dashboard feed.
  const { engine, results } = await getRecommendations(userId, 36);
  const recommendations = balanceBySource(await hydrate(userId, results), 6);

  // Deadlines in the next 30 days from saved or tracked opportunities.
  const deadlines = await query(
    `SELECT DISTINCT o.id, o.title, o.organization, o.deadline,
            c.name AS category_name, c.slug AS category_slug, c.color AS category_color
       FROM opportunities o
       JOIN categories c ON c.id = o.category_id
      WHERE o.is_active = TRUE
        AND o.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND (
              EXISTS (SELECT 1 FROM saved_opportunities sv
                       WHERE sv.opportunity_id = o.id AND sv.user_id = $1)
           OR EXISTS (SELECT 1 FROM applications a
                       WHERE a.opportunity_id = o.id AND a.user_id = $1)
        )
      ORDER BY o.deadline ASC
      LIMIT 8`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      stats: {
        recommended: recommendations.length,
        saved: savedCount.rows[0].count,
        upcomingDeadlines: upcomingCount.rows[0].count,
        applications: applicationCount.rows[0].count,
      },
      recommendations,
      engine,
      upcomingDeadlines: deadlines.rows.map((row) => ({
        id: row.id,
        title: row.title,
        organization: row.organization,
        deadline: row.deadline,
        category: { name: row.category_name, slug: row.category_slug, color: row.category_color },
      })),
      applicationBreakdown: statusBreakdown.rows,
    },
  });
});

export default { getMyRecommendations, explainMatch, getDashboard };
