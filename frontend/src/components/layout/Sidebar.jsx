/**
 * The student sidebar.
 *
 * On desktop it is always visible. On mobile it slides in over the page and
 * a dark overlay closes it -- this is why it takes `open` / `onClose` props.
 */
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  Briefcase,
  GraduationCap,
  Code2,
  Trophy,
  BookOpen,
  Bookmark,
  ClipboardList,
  CalendarDays,
  User,
  Settings,
  X,
  GraduationCap as Logo,
} from 'lucide-react';

const MAIN_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/recommended', label: 'Recommended', icon: Sparkles },
];

const CATEGORY_LINKS = [
  { to: '/category/internship', label: 'Internships', icon: Briefcase },
  { to: '/category/scholarship', label: 'Scholarships', icon: GraduationCap },
  { to: '/category/hackathon', label: 'Hackathons', icon: Code2 },
  { to: '/category/competition', label: 'Competitions', icon: Trophy },
  { to: '/category/course', label: 'Courses', icon: BookOpen },
];

const PERSONAL_LINKS = [
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/applications', label: 'My Applications', icon: ClipboardList },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
];

const ACCOUNT_LINKS = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavSection({ title, links, onNavigate }) {
  return (
    <div className="space-y-0.5">
      {title && (
        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
      )}
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Icon className="h-4.5 w-4.5 shrink-0" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white
                    transition-transform duration-300 lg:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
          <Link to="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Logo className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900">Opportunity Finder</span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <NavSection links={MAIN_LINKS} onNavigate={onClose} />
          <NavSection title="Categories" links={CATEGORY_LINKS} onNavigate={onClose} />
          <NavSection title="My Space" links={PERSONAL_LINKS} onNavigate={onClose} />
          <NavSection title="Account" links={ACCOUNT_LINKS} onNavigate={onClose} />
        </nav>

        <div className="border-t border-slate-100 p-3">
          <p className="px-3 text-xs text-slate-400">
            Student Opportunity Finder
            <br />
            Semester project &middot; v1.0
          </p>
        </div>
      </aside>
    </>
  );
}
