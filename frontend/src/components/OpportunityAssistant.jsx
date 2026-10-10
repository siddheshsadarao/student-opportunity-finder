import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, BriefcaseBusiness, ExternalLink, LoaderCircle, MessageCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assistantApi } from '../services/api';

const STARTER = {
  role: 'assistant',
  text: 'Hi! What would you like to explore today?',
};

export default function OpportunityAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([STARTER]);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  const send = async (text = draft) => {
    const message = text.trim();
    if (!message || loading) return;
    setDraft('');
    setMessages((items) => [...items, { role: 'user', text: message }]);
    if (/^(hi|hello|hey|hii+|namaste|namaskar)(\s+(assistant|there|bhai|bro))?[!.?\s]*$/i.test(message)) {
      setMessages((items) => [...items, { role: 'assistant', text: 'Hi! How can I help you today? We can discuss your career goals or find opportunities that suit you.' }]);
      return;
    }
    setLoading(true);
    try {
      const result = await assistantApi.search(message, messages.filter((item) => item !== STARTER).slice(-8).map(({ role, text }) => ({ role, text })));
      setMessages((items) => [...items, { role: 'assistant', text: result.reply, opportunities: result.opportunities }]);
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', text: error.message || 'Could not search right now. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <section className="fixed bottom-24 right-4 z-[70] flex h-[min(620px,calc(100dvh-7rem))] w-[min(410px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" aria-label="Opportunity assistant">
          <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-white"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">Opportunity assistant</h2><p className="text-xs text-slate-500">Searches our live catalogue</p></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close assistant"><X className="h-4 w-4" /></button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
            {messages.map((item, index) => (
              <div key={`${index}-${item.role}`} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-xl px-3 py-2.5 ${item.role === 'user' ? 'bg-primary-600 text-white' : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                  <p className="text-sm leading-relaxed">{item.text}</p>
                  {item.opportunities?.length > 0 && <div className="mt-3 space-y-2">
                    {item.opportunities.map((opportunity) => (
                      <article key={opportunity.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-start gap-2"><BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{opportunity.title}</h3><p className="mt-0.5 text-xs text-slate-500">{opportunity.organization} · {opportunity.category}</p><p className="mt-1 text-xs text-slate-500">{opportunity.location} · {opportunity.mode} · Deadline {new Date(opportunity.deadline).toLocaleDateString()}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><Link to={`/opportunities/${opportunity.id}`} onClick={() => setOpen(false)} className="text-xs font-semibold text-primary-600 hover:underline">View details</Link><a href={opportunity.application_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">Official apply link <ExternalLink className="h-3 w-3" /></a></div></div></div>
                      </article>
                    ))}
                  </div>}
                </div>
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Thinking...</div>}
            {messages.length === 1 && <div className="flex flex-wrap gap-2">{['Remote internships', 'Upcoming hackathons', 'Scholarships closing this month'].map((prompt) => <button key={prompt} type="button" onClick={() => send(prompt)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{prompt}</button>)}</div>}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={400} placeholder="Search opportunities..." className="input min-w-0 flex-1 text-sm" aria-label="Describe the opportunity you want" />
            <button type="submit" disabled={!draft.trim() || loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message"><ArrowUp className="h-5 w-5" /></button>
          </form>
        </section>
      )}

      <button type="button" onClick={() => setOpen((value) => !value)} className="fixed bottom-5 right-5 z-[71] flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition hover:scale-105 hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-300" aria-label={open ? 'Close opportunity assistant' : 'Open opportunity assistant'} title="Ask the opportunity assistant">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
