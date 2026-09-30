/**
 * Small formatting helpers shared by many components.
 */

/** "2026-10-15" -> "15 Oct 2026" */
export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2026-10-15" -> "15 October 2026" */
export function formatLongDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Whole days from today until a deadline.
 * Both dates are reduced to midnight so "tomorrow" is always 1, never 0.9.
 */
export function daysUntil(value) {
  if (!value) return null;
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  return Math.round((deadline - today) / (1000 * 60 * 60 * 24));
}

/**
 * "Closes today" / "2 days left" / "Closed".
 *
 * Always returns a relative phrase, never the date itself -- the date is
 * shown next to this label, and returning it here would print it twice.
 */
export function deadlineLabel(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return '1 day left';
  if (days <= 60) return `${days} days left`;

  const months = Math.round(days / 30);
  return `about ${months} months left`;
}

/** Colour for the deadline chip: red when urgent, amber soon, slate otherwise. */
export function deadlineTone(value) {
  const days = daysUntil(value);
  if (days === null) return 'text-slate-500';
  if (days < 0) return 'text-slate-400';
  if (days <= 3) return 'text-red-600';
  if (days <= 7) return 'text-amber-600';
  return 'text-slate-500';
}

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Aarav Mehta" -> "AM" (used for the avatar circle) */
export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

/** "2 hours ago" for notification timestamps. */
export function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

/** Colour for a match percentage badge. */
export function matchTone(score) {
  if (score >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 70) return 'bg-primary-50 text-primary-700 border-primary-200';
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}
