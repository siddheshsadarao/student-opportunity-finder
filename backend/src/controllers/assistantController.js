import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';
import { parseAssistantRequestWithGemini } from '../services/geminiQueryParser.js';
import { planConversation } from '../services/assistantConversation.js';

/** Search only verified rows already present in our catalogue; no generated listings. */
export const searchWithAssistant = asyncHandler(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (message.length < 2 || message.length > 400) {
    return res.status(400).json({ success: false, message: 'Write a search request between 2 and 400 characters.' });
  }

  const plan = await planConversation(message, req.body.history);
  if (plan.intent === 'chat') {
    return res.json({ success: true, data: { reply: plan.reply, provider: plan.provider, opportunities: [] } });
  }
  const locationResult = await query(`SELECT DISTINCT location FROM opportunities
    WHERE is_active = TRUE AND is_demo = FALSE AND location IS NOT NULL`);
  const { parsed, provider } = await parseAssistantRequestWithGemini(plan.searchQuery, locationResult.rows.map((row) => row.location));
  const params = [];
  const filters = ['sof_is_open(o)'];
  if (parsed.category) {
    params.push(parsed.category);
    filters.push(`c.slug = $${params.length}`);
  }
  if (parsed.mode) {
    params.push(parsed.mode);
    filters.push(`o.mode = $${params.length}`);
  }
  if (parsed.location) {
    params.push(`%${parsed.location}%`);
    filters.push(`o.location ILIKE $${params.length}`);
  }
  if (parsed.deadlineDays) {
    filters.push(`o.deadline <= CURRENT_DATE + INTERVAL '${parsed.deadlineDays} days'`);
  }

  const termConditions = parsed.terms.map((term) => {
    params.push(`%${term}%`);
    return `(o.title ILIKE $${params.length} OR o.organization ILIKE $${params.length} OR o.description ILIKE $${params.length} OR EXISTS (SELECT 1 FROM opportunity_skills os JOIN skills s ON s.id = os.skill_id WHERE os.opportunity_id = o.id AND s.name ILIKE $${params.length}))`;
  });
  if (termConditions.length) filters.push(`(${termConditions.join(' OR ')})`);

  const { rows } = await query(
    `SELECT o.id, o.title, o.organization, o.location, o.mode, o.deadline,
            o.application_url, o.source, o.is_demo, c.name AS category,
            c.slug AS category_slug
       FROM opportunities o JOIN categories c ON c.id = o.category_id
      WHERE o.is_demo = FALSE AND ${filters.join(' AND ')}
      ORDER BY ROW_NUMBER() OVER (PARTITION BY COALESCE(o.source, '__manual__')
        ORDER BY o.deadline ASC NULLS LAST, o.id), o.deadline ASC NULLS LAST, o.id LIMIT 6`,
    params
  );

  let reply;
  if (rows.length) {
    const parts = [];
    if (parsed.category) parts.push(parsed.category.replace('-', ' '));
    if (parsed.location) parts.push(`around ${parsed.location}`);
    if (parsed.mode) parts.push(parsed.mode);
    reply = `I searched our live catalogue${parts.length ? ` for ${parts.join(', ')}` : ''}. Here ${rows.length === 1 ? 'is one opportunity' : `are ${rows.length} opportunities`} you can review. Open the source link to apply; viewing does not mark you as applied.`;
  } else {
    reply = 'I could not find an open listing matching all those details. Try removing the city or work-mode constraint, or browse all opportunities.';
  }

  res.json({ success: true, data: { reply, parsed, provider, opportunities: rows } });
});

export default { searchWithAssistant };
