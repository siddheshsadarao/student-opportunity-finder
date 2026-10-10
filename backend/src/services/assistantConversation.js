import config from '../config/env.js';

export function smallTalk(message) {
  if (/^(hi|hello|hey|hii+|namaste|namaskar|good (morning|evening|afternoon))(\s+(assistant|there|bhai|bro))?[!.?\s]*$/i.test(message)) {
    return 'Hi! How can I help you today? We can discuss your career goals or find opportunities that suit you.';
  }
  if (/^(thanks|thank you|thankyou|thx|ok|okay|bye)[!.\s]*$/i.test(message)) {
    return /^bye/i.test(message) ? 'See you! Come back whenever you need help.' : 'You are welcome. What would you like to explore next?';
  }
  return null;
}

export async function planConversation(message, history = []) {
  const greeting = smallTalk(message);
  if (greeting) return { intent: 'chat', reply: greeting, provider: 'rules' };
  const fallback = /internship|scholarship|hackathon|competition|course|workshop|fellowship|career program|\bjobs?\b|opportunit|find|search|show|looking for/i.test(message)
    ? { intent: 'search', searchQuery: message, provider: 'rules' }
    : { intent: 'chat', reply: 'Tell me a little more about your question or career goal. Which field are you interested in?', provider: 'rules' };
  if (!config.gemini.apiKey) return fallback;
  const turns = Array.isArray(history) ? history.slice(-8)
    .filter((turn) => ['user', 'assistant'].includes(turn?.role) && typeof turn.text === 'string')
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 800) })) : [];
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      signal: AbortSignal.timeout(7000),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'You are the friendly Student Opportunity Finder assistant. Respond naturally in the language the user uses. Handle greetings, career guidance, resume advice and questions conversationally. Use intent search ONLY when the user asks to find/list actual opportunities; otherwise chat. Resolve follow-up search requests using recent conversation. Never invent listings, deadlines, prices, statistics, eligibility or source links. Actual opportunities will be retrieved separately from our database. Never claim to have applied, saved, verified, or accessed the student profile/resume. Those actions are not available to you. For search, searchQuery must express only user-requested criteria, with no default city or skills. Keep replies concise. Return JSON: intent (chat or search), reply, searchQuery.' }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ history: turns, message }) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: {
          type: 'OBJECT', properties: { intent: { type: 'STRING', enum: ['chat', 'search'] }, reply: { type: 'STRING' }, searchQuery: { type: 'STRING' } }, required: ['intent', 'reply', 'searchQuery'],
        } },
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const value = JSON.parse(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || 'null');
    if (value?.intent === 'chat' && typeof value.reply === 'string' && value.reply.trim()) return { intent: 'chat', reply: value.reply.slice(0, 2400), provider: 'gemini' };
    if (value?.intent === 'search' && typeof value.searchQuery === 'string' && value.searchQuery.trim()) return { intent: 'search', searchQuery: value.searchQuery.slice(0, 400), provider: 'gemini' };
    return fallback;
  } catch {
    return fallback;
  }
}
