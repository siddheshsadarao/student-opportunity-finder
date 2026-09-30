/**
 * Shared two-column layout for the login / register / forgot-password pages:
 * the form on the left and a branded panel on the right (hidden on mobile).
 */
import { Link } from 'react-router-dom';
import { GraduationCap, Sparkles, CalendarCheck, Target } from 'lucide-react';

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
    <div className="flex min-h-screen">
      {/* ------------------------------------------------------ form side */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">Opportunity Finder</span>
          </Link>

          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>

      {/* --------------------------------------------------- branded side */}
      <div className="hidden bg-gradient-to-br from-primary-600 via-primary-700 to-blue-800 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Find opportunities made for you.
          </h2>
          <p className="mt-4 text-primary-100">
            Stop searching across a dozen websites. One profile, and the right internships,
            scholarships and competitions come to you.
          </p>

          <div className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title: itemTitle, text }) => (
              <div key={itemTitle} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{itemTitle}</h3>
                  <p className="mt-0.5 text-sm text-primary-100">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
