/**
 * Shared two-column layout for the login / register / forgot-password pages:
 * the form on the left and a branded panel on the right (hidden on mobile).
 */
import { Link } from 'react-router-dom';
import { Sparkles, CalendarCheck, Target } from 'lucide-react';
import Brand from '../../components/Brand';

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: 'Personalised matches',
    text: 'Opportunities ranked for your skills, interests and goals.',
  },
  {
    icon: Target,
    title: 'Everything in one place',
    text: 'Internships, scholarships, hackathons, competitions and courses.',
  },
  {
    icon: CalendarCheck,
    title: 'Never miss a deadline',
    text: 'Track applications and get reminders before they close.',
  },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* ------------------------------------------------------ form side */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
            <Brand />
          </Link>

          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>

      {/* --------------------------------------------------- branded side */}
      <div className="hidden border-l border-slate-200 bg-slate-50 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <img src="/brand-logo.png" alt="Student Opportunity Finder logo" width="256" height="256" className="mb-8 h-64 w-64 rounded-lg bg-white object-contain" />
          <h2 className="text-2xl font-semibold leading-tight text-slate-900">
            Student Opportunity Finder
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Stop searching across a dozen websites. One profile, and the right internships,
            scholarships and competitions come to you.
          </p>

          <div className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title: itemTitle, text }) => (
              <div key={itemTitle} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{itemTitle}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
