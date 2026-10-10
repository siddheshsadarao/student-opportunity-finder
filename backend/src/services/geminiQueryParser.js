import { parseAssistantRequest } from './assistantParser.js';
import config from '../config/env.js';

const CATEGORIES = [
  'internship', 'scholarship', 'hackathon', 'competition', 'course',
  'workshop', 'fellowship', 'career-program', 'job',
];
const MODES = ['Remote', 'Hybrid', 'On-site'];

function safeParsedResult(value, text, knownLocations, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const category = CATEGORIES.includes(value.category) ? value.category : null;
  const mode = MODES.includes(value.mode) ? value.mode : null;
  const candidateLocation = typeof value.location === 'string' ? value.location.trim() : '';
  const location = candidateLocation && text.toLowerCase().includes(candidateLocation.toLowerCase())
    ? candidateLocation
    : fallback.location;
  const deadlineDays = [7, 31].includes(Number(value.deadlineDays))
    ? Number(value.deadlineDays)
    : fallback.deadlineDays;

  // Keep search terms grounded in the student's own query, even if the model
  // returns unexpected text or tries to introduce extra filters.
  const terms = fallback.terms;
  return {
    category: category || fallback.category,
    mode: mode || fallback.mode,
    location: location || [...knownLocations]
      .map((place) => String(place).split(',')[0].trim())
      .sort((a, b) => b.length - a.length)
      .find((place) => text.toLowerCase().includes(place.toLowerCase())) || null,
    deadlineDays: deadlineDays || null,
    terms,
  };
}

/**
 * Gemini only extracts search filters. Results always come from our SQL
 * catalogue, and the user's message is never combined with profile/resume data.
 */
export async function parseAssistantRequestWithGemini(text, knownLocations = []) {
  const fallback = parseAssistantRequest(text, knownLocations);
  const apiKey = config.gemini.apiKey;
  if (!apiKey) return { parsed: fallback, provider: 'rules' };

  const model = config.gemini.model;
  const schema = {
    type: 'OBJECT',
    properties: {
      category: { type: 'STRING', enum: ['', ...CATEGORIES] },
      mode: { type: 'STRING', enum: ['', ...MODES] },
      location: { type: 'STRING' },
      deadlineDays: { type: 'INTEGER', enum: [0, 7, 31] },
    },
    required: ['category', 'mode', 'location', 'deadlineDays'],
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: 'Extract only filters explicitly requested by the user for searching student opportunities. Never answer the user or invent details. Use empty strings and 0 when unspecified. A deadline window is 7 days for this week/within a week and 31 days for this month/within a month. Location must be copied from the query.' }],
          },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { temperature: 0, response_mime_type: 'application/json', response_schema: schema },
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
    const payload = await response.json();
    const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
    const parsed = safeParsedResult(JSON.parse(output || 'null'), text, knownLocations, fallback);
    return { parsed, provider: 'gemini' };
  } catch (error) {
    console.warn(`[assistant] Gemini parsing unavailable; using local parser (${error.name === 'AbortError' ? 'timeout' : 'request failed'}).`);
    return { parsed: fallback, provider: 'rules' };
  } finally {
    clearTimeout(timeout);
  }
}

export default { parseAssistantRequestWithGemini };
