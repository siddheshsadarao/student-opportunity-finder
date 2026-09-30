/**
 * Fixed option lists used by the forms.
 *
 * These match the CHECK constraints in database/schema.sql, so the dropdown
 * can never offer a value the database would reject.
 */

export const DEGREES = ['B.Tech', 'B.E.', 'B.Sc', 'BCA', 'MCA', 'MBA', 'Other'];

export const BRANCHES = [
  'Computer Science',
  'Data Science',
  'AI/ML',
  'IT',
  'Mechanical',
  'Civil',
  'Electronics',
  'Electrical',
  'Other',
];

export const YEARS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
  { value: 5, label: '5th Year' },
];

export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];

export const WORK_MODE_PREFERENCES = ['Remote', 'Hybrid', 'On-site', 'Any'];

export const CAREER_GOALS = [
  'Software Developer',
  'Data Scientist',
  'ML Engineer',
  'Data Analyst',
  'Cybersecurity Engineer',
  'Product Manager',
  'Entrepreneur',
  'Researcher',
];

export const APPLICATION_STATUSES = [
  'Planning to Apply',
  'Applied',
  'Shortlisted',
  'Selected',
  'Rejected',
];

/** Colour classes for each application status (kanban columns and badges). */
export const STATUS_STYLES = {
  'Planning to Apply': {
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    column: 'border-slate-300',
  },
  Applied: {
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500',
    column: 'border-blue-400',
  },
  Shortlisted: {
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    column: 'border-amber-400',
  },
  Selected: {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    column: 'border-emerald-400',
  },
  Rejected: {
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    column: 'border-red-400',
  },
};

/**
 * Tailwind classes for each category colour stored in the database.
 *
 * Tailwind removes class names it cannot find in the source at build time,
 * so we cannot build them dynamically as `bg-${color}-100`. Listing them
 * here keeps them in the final CSS.
 */
export const CATEGORY_COLORS = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
  },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
};

export const getCategoryColor = (color) => CATEGORY_COLORS[color] || CATEGORY_COLORS.indigo;

/** Suggested skills shown in the onboarding tag input before the user types. */
export const POPULAR_SKILLS = [
  'Python',
  'Java',
  'C++',
  'JavaScript',
  'React',
  'Node.js',
  'SQL',
  'Machine Learning',
  'Data Science',
  'Cloud Computing',
  'Cybersecurity',
  'UI/UX',
  'Communication',
  'Marketing',
  'Finance',
];

export const POPULAR_INTERESTS = [
  'Artificial Intelligence',
  'Data Science',
  'Web Development',
  'Cybersecurity',
  'Cloud Computing',
  'Mobile Development',
  'Research',
  'Entrepreneurship',
  'Finance',
  'Design',
];
