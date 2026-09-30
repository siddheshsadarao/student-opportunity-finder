/**
 * Client for the Python (FastAPI) recommendation microservice.
 *
 * Architecture:
 *   React  ->  Node/Express  ->  FastAPI (scikit-learn)  ->  PostgreSQL
 *
 * The Python service does the machine-learning part (TF-IDF + cosine
 * similarity) and returns a list of { opportunity_id, recommendation_score,
 * reasons }. Node then loads the full opportunity rows and sends them to the
 * browser. Keeping the ML in its own service means we can swap in a better
 * model later without touching the Express code.
 *
 * If the Python service is not running, `getRecommendations` falls back to a
 * simple rule-based score implemented in JavaScript, so the app keeps working
 * during a demo. The response always says which engine produced the scores.
 */
import axios from 'axios';
import config from '../config/env.js';
import { query } from '../config/db.js';

const client = axios.create({
  baseURL: config.recommendationServiceUrl,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

/** Calls POST /recommend on the FastAPI service. */
async function callPythonService(userId, limit) {
  const { data } = await client.post('/recommend', {
    student_id: userId,
    limit,
  });
  return data;
}

/**
 * JavaScript fallback scorer.
 *
 * This mirrors the ideas of the Python engine but with plain set overlap
 * instead of TF-IDF, so it is fast and needs no extra service:
 *   skills match      -> up to 45 points
 *   interest match    -> up to 20 points
 *   preferred category-> up to 15 points
 *   work mode match   -> up to 10 points
 *   location match    -> up to 10 points
 */
async function fallbackScores(userId, limit) {
  const profileResult = await query(
    `SELECT p.id, p.preferred_mode, p.preferred_location, p.city, p.career_goal, p.branch
       FROM student_profiles p WHERE p.user_id = $1`,
    [userId]
  );
  const profile = profileResult.rows[0];
  if (!profile) return [];

  const [skills, interests, categories] = await Promise.all([
    query(
      `SELECT s.name FROM student_skills ss JOIN skills s ON s.id = ss.skill_id
        WHERE ss.profile_id = $1`,
      [profile.id]
    ),
    query(
      `SELECT i.name FROM student_interests si JOIN interests i ON i.id = si.interest_id
        WHERE si.profile_id = $1`,
      [profile.id]
    ),
    query(`SELECT category_id FROM student_preferred_categories WHERE profile_id = $1`, [profile.id]),
  ]);

  // Matching is done in lower case, but the display names keep their original
  // capitalisation so the reasons read "You know Python", not "you know python".
  const studentSkills = new Set(skills.rows.map((r) => r.name.toLowerCase()));
  const studentInterests = interests.rows.map((r) => r.name);
  const preferredCategoryIds = new Set(categories.rows.map((r) => r.category_id));

  const opportunities = await query(
    `SELECT o.id, o.title, o.description, o.location, o.mode, o.category_id,
            COALESCE(
              (SELECT json_agg(s.name) FROM opportunity_skills os
                 JOIN skills s ON s.id = os.skill_id
                WHERE os.opportunity_id = o.id),
              '[]'
            ) AS skills
       FROM opportunities o
      WHERE o.is_active = TRUE AND o.deadline >= CURRENT_DATE`
  );

  const scored = opportunities.rows.map((opp) => {
    const oppSkills = opp.skills || [];
    const reasons = [];
    let score = 0;

    // --- skills (45 points) ---
    const matchedSkills = oppSkills.filter((s) => studentSkills.has(s.toLowerCase()));
    if (oppSkills.length) {
      score += (matchedSkills.length / oppSkills.length) * 45;
    }
    if (matchedSkills.length) {
      reasons.push(`You know ${matchedSkills.slice(0, 3).join(', ')}`);
    }

    // --- interests (20 points) ---
    const haystack = `${opp.title} ${opp.description}`.toLowerCase();
    const matchedInterests = studentInterests.filter((i) => haystack.includes(i.toLowerCase()));
    if (matchedInterests.length) {
      score += Math.min(20, matchedInterests.length * 10);
      reasons.push(`Matches your interest in ${matchedInterests[0]}`);
    }

    // --- preferred category (15 points) ---
    if (preferredCategoryIds.has(opp.category_id)) {
      score += 15;
      reasons.push('One of your preferred opportunity types');
    }

    // --- work mode (10 points) ---
    if (profile.preferred_mode && profile.preferred_mode !== 'Any' && opp.mode === profile.preferred_mode) {
      score += 10;
      reasons.push(`${opp.mode} matches your work preference`);
    } else if (profile.preferred_mode === 'Any') {
      score += 5;
    }

    // --- location (10 points) ---
    const wantedLocation = (profile.preferred_location || profile.city || '').toLowerCase();
    const oppLocation = (opp.location || '').toLowerCase();
    if (wantedLocation && oppLocation.includes(wantedLocation)) {
      score += 10;
      reasons.push(`Located in ${opp.location}`);
    } else if (opp.mode === 'Remote') {
      score += 6;
    }

    return {
      opportunity_id: opp.id,
      recommendation_score: Math.min(99, Math.round(score)),
      reasons: reasons.length ? reasons : ['Recently added opportunity you may like'],
    };
  });

  return scored
    .sort((a, b) => b.recommendation_score - a.recommendation_score)
    .slice(0, limit);
}

/**
 * Returns scored recommendations for a student.
 * @returns {{engine: 'ml'|'fallback', results: Array}}
 */
export async function getRecommendations(userId, limit = 20) {
  try {
    const data = await callPythonService(userId, limit);
    return { engine: 'ml', results: data.recommendations || [] };
  } catch (error) {
    console.warn(
      `[recommendations] Python service unavailable (${error.code || error.message}). ` +
        'Using the built-in JavaScript scorer instead.'
    );
    const results = await fallbackScores(userId, limit);
    return { engine: 'fallback', results };
  }
}

/**
 * Full score breakdown for ONE opportunity, used by the "Why this matches
 * you" panel.
 *
 * This calls the Python service's own /explain endpoint rather than asking
 * for the whole ranked list and searching it, which is both faster and
 * avoids running into the service's maximum page size.
 *
 * @returns {{engine: 'ml'|'fallback', match: object|null}}
 */
export async function explainRecommendation(userId, opportunityId) {
  try {
    const { data } = await client.get(`/explain/${userId}/${opportunityId}`);
    return {
      engine: 'ml',
      match: {
        recommendation_score: data.recommendation_score,
        reasons: data.reasons,
        breakdown: data.breakdown,
        weights: data.weights,
        analysis: data.analysis,
      },
    };
  } catch (error) {
    // 404 means the opportunity is closed or missing -- not a service failure.
    if (error.response?.status === 404) return { engine: 'ml', match: null };

    console.warn(
      `[recommendations] Python service unavailable for explain (${error.code || error.message}). ` +
        'Using the built-in JavaScript scorer instead.'
    );
    const results = await fallbackScores(userId, 500);
    const match = results.find((item) => item.opportunity_id === Number(opportunityId));
    return { engine: 'fallback', match: match || null };
  }
}

/** Simple health probe shown on the admin dashboard. */
export async function checkServiceHealth() {
  try {
    const { data } = await client.get('/health', { timeout: 3000 });
    return { online: true, ...data };
  } catch {
    return { online: false };
  }
}

export default { getRecommendations, explainRecommendation, checkServiceHealth };
