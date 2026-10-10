const CATEGORY_HINTS = {
  internship: ['internship', 'intern', 'internships'],
  scholarship: ['scholarship', 'scholarships', 'grant', 'financial aid'],
  hackathon: ['hackathon', 'hackathons', 'hack'],
  competition: ['competition', 'competitions', 'contest', 'contests'],
  course: ['course', 'courses', 'learning', 'certification'],
  workshop: ['workshop', 'workshops', 'webinar'],
  fellowship: ['fellowship', 'fellowships'],
  'career-program': ['career program', 'career programme', 'graduate program'],
  job: ['job', 'jobs', 'trainee', 'entry-level'],
};

const STOP_WORDS = new Set([
  'find', 'show', 'me', 'some', 'any', 'opportunities', 'opportunity', 'internships',
  'internship', 'intern', 'jobs', 'job', 'in', 'near', 'at', 'with', 'for', 'the',
  'and', 'remote', 'online', 'hybrid', 'onsite', 'on-site', 'this', 'week', 'month',
  'deadline', 'before', 'within', 'next', 'days', 'day', 'please', 'student', 'students', 'scholarships', 'hackathons',
  'competitions', 'contests', 'courses', 'workshops', 'fellowships', 'hack',
]);

export function parseAssistantRequest(text, knownLocations = []) {
  const normalized = text.toLowerCase();
  const category = Object.entries(CATEGORY_HINTS)
    .find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] || null;
  const mode = /\b(remote|online|work from home|wfh)\b/.test(normalized)
    ? 'Remote'
    : /\bhybrid\b/.test(normalized)
      ? 'Hybrid'
      : /\b(on[- ]?site|in[- ]person|onsite)\b/.test(normalized)
        ? 'On-site'
        : null;
  const locationMatch = normalized.match(/\b(?:in|near|at)\s+([a-z][a-z .'-]{1,35}?)(?=\s+(?:with|for|under|before|this|next|remote|hybrid|onsite|online|within)\b|[,?.!]|$)/i);
  const location = locationMatch?.[1]?.trim() || [...knownLocations]
    .map((place) => String(place).split(',')[0].trim())
    .sort((a, b) => b.length - a.length)
    .find((place) => normalized.includes(place.toLowerCase())) || null;
  const deadlineDays = /\b(this week|within a week)\b/.test(normalized)
    ? 7
    : /\b(this month|within a month)\b/.test(normalized)
      ? 31
      : null;
  const locationWords = new Set((location || '').toLowerCase().split(/\s+/));
  const terms = normalized.match(/[a-z0-9+#.-]+/g)?.filter((word) =>
    word.length > 1
    && !STOP_WORDS.has(word)
    && !locationWords.has(word)
    && !Object.values(CATEGORY_HINTS).flat().includes(word)
  ) || [];
  return { category, mode, location, deadlineDays, terms: [...new Set(terms)].slice(0, 8) };
}

export default { parseAssistantRequest };
