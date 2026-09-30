/**
 * The public landing page.
 *
 * Sections: navbar, hero with search, categories, featured opportunities,
 * how it works, why students use it, statistics, call to action and footer.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Search,
  ArrowRight,
  Menu,
  X,
  Sparkles,
  Bell,
  LayoutGrid,
  ShieldCheck,
  UserPlus,
  ListChecks,
  Send,
  Compass,
  Moon,
  Sun,
} from 'lucide-react';
import { metaApi, opportunityApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate, deadlineLabel, deadlineTone } from '../utils/format';
import { getCategoryColor } from '../utils/constants';
import { useTheme } from '../context/ThemeContext';
import { getCategoryIcon } from '../utils/iconMap';

const HOW_IT_WORKS = [
  {
    icon: UserPlus,
    step: '01',
    title: 'Create your profile',
    text: 'Sign up with your college, degree, branch and year. It takes under a minute.',
  },
  {
    icon: ListChecks,
    step: '02',
    title: 'Add skills & interests',
    text: 'Tell us what you know and what you want to work on. This drives your matches.',
  },
  {
    icon: Sparkles,
    step: '03',
    title: 'Get personalised matches',
    text: 'Our engine ranks every opportunity for you and explains why each one fits.',
  },
  {
    icon: Send,
    step: '04',
    title: 'Apply before deadlines',
    text: 'Save what you like, track your applications and never miss a closing date.',
  },
];

const BENEFITS = [
  {
    icon: LayoutGrid,
    title: 'Everything in one place',
    text: 'Internships, scholarships, hackathons, competitions, courses, workshops and fellowships in a single searchable catalogue.',
  },
  {
    icon: Sparkles,
    title: 'Matched, not just listed',
    text: 'Every opportunity carries a match score based on your skills, interests, branch and preferences, with the reasoning shown.',
  },
  {
    icon: Bell,
    title: 'Deadline reminders',
    text: 'Save an opportunity and get a reminder before it closes, plus a calendar view of everything coming up.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for students',
    text: 'Filter by eligibility, year and work mode so you only see what you can actually apply to.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // All three are optional -- the page renders fine if any fails.
    metaApi.categories().then(setCategories).catch(() => {});
    opportunityApi.featured().then(setFeatured).catch(() => {});
    metaApi.stats().then(setStats).catch(() => {});
  }, []);

  const onSearch = (event) => {
    event.preventDefault();
    const destination = search.trim()
      ? `/discover?search=${encodeURIComponent(search.trim())}`
      : '/discover';
    // Browsing requires an account, so send guests to register first.
    navigate(isAuthenticated ? destination : '/register');
  };

  const homeLink = !isAuthenticated ? '/login' : user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <div className="min-h-screen bg-white">
      {/* ============================================================ navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">Opportunity Finder</span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            <a href="#categories" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Categories
            </a>
            <a href="#featured" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Opportunities
            </a>
            <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              How it works
            </a>
            <a href="#about" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              About
            </a>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            {isAuthenticated ? (
              <Link to={homeLink} className="btn-primary btn-sm">
                Go to dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm">
                  Login
                </Link>
                <Link to="/register" className="btn-primary btn-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {/* mobile menu */}
        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
            <div className="space-y-1">
              {[
                ['#categories', 'Categories'],
                ['#featured', 'Opportunities'],
                ['#how', 'How it works'],
                ['#about', 'About'],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
              {isAuthenticated ? (
                <Link to={homeLink} className="btn-primary flex-1">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary flex-1">
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary flex-1">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ============================================================== hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50/60 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge mb-5 border border-primary-200 bg-primary-50 text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Personalised for every student
            </span>

            <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Find Opportunities
              <br />
              <span className="text-primary-600">Made For You.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
              Discover internships, scholarships, hackathons, competitions and courses personalised
              to your skills and interests.
            </p>

            {/* search box */}
            <form onSubmit={onSearch} className="mx-auto mt-8 max-w-xl">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search internships, scholarships, hackathons..."
                    className="input h-12 pl-11 shadow-sm"
                    aria-label="Search opportunities"
                  />
                </div>
                <button type="submit" className="btn-primary h-12 px-6">
                  Search
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={isAuthenticated ? homeLink : '/register'} className="btn-primary px-7 py-3">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#featured" className="btn-secondary px-7 py-3">
                <Compass className="h-4 w-4" />
                Explore Opportunities
              </a>
            </div>
          </div>

          {/* statistics */}
          {stats && (
            <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                ['Open opportunities', stats.active_opportunities],
                ['Organisations', stats.organizations],
                ['Categories', stats.categories],
                ['Students registered', stats.students],
              ].map(([label, value]) => (
                <div key={label} className="card p-5 text-center">
                  <p className="text-3xl font-bold text-primary-600">{value}</p>
                  <p className="mt-1 text-sm text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ======================================================== categories */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-slate-900">Browse by category</h2>
          <p className="mt-2 text-slate-600">
            Every kind of student opportunity, organised in one place.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => {
            const CategoryIcon = getCategoryIcon(category.icon);
            const colors = getCategoryColor(category.color);

            return (
              <Link
                key={category.id}
                to={isAuthenticated ? `/category/${category.slug}` : '/register'}
                className="card-hover group p-5"
              >
                <div
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg ${colors.bg}`}
                >
                  <CategoryIcon className={`h-5.5 w-5.5 ${colors.text}`} />
                </div>
                <h3 className="font-semibold text-slate-900 group-hover:text-primary-700">
                  {category.name}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">
                  {category.description}
                </p>
                <p className="mt-3 text-xs font-medium text-primary-600">
                  {category.opportunity_count} open now
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ========================================================== featured */}
      <section id="featured" className="bg-slate-50 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Featured opportunities</h2>
              <p className="mt-2 text-slate-600">Closing soon and popular with students.</p>
            </div>
            <Link
              to={isAuthenticated ? '/discover' : '/register'}
              className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              View all opportunities
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((opportunity) => {
              const colors = getCategoryColor(opportunity.category?.color);
              return (
                <Link
                  key={opportunity.id}
                  to={`/opportunities/${opportunity.id}`}
                  className="card-hover flex flex-col p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${colors.bg} ${colors.text}`}>
                      {opportunity.category?.name}
                    </span>
                    <span className="badge bg-slate-100 text-slate-600">{opportunity.mode}</span>
                    {opportunity.isDemo && (
                      <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                        Sample
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 line-clamp-2 font-semibold text-slate-900">
                    {opportunity.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{opportunity.organization}</p>

                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-500">
                    {opportunity.description}
                  </p>

                  <div className="mt-auto flex items-center justify-between pt-4 text-xs">
                    <span className="text-slate-400">{formatDate(opportunity.deadline)}</span>
                    <span className={`font-semibold ${deadlineTone(opportunity.deadline)}`}>
                      {deadlineLabel(opportunity.deadline)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===================================================== how it works */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
          <p className="mt-2 text-slate-600">Four steps from sign-up to your first application.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(({ icon: Icon, step, title, text }) => (
            <div key={step} className="relative">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
                <Icon className="h-6 w-6 text-white" />
              </div>
              <span className="absolute right-0 top-0 text-4xl font-bold text-slate-100">
                {step}
              </span>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================== about */}
      <section id="about" className="bg-slate-50 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">Why students use it</h2>
            <p className="mx-auto mt-2 max-w-2xl text-slate-600">
              Opportunities are scattered across LinkedIn, company sites, scholarship portals,
              hackathon pages and college groups. This platform brings them together and ranks them
              for you.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card flex gap-4 p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                  <Icon className="h-5.5 w-5.5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================= CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-blue-700 px-6 py-14 text-center sm:px-12">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Stop searching. Start applying.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-100">
            Create your profile in a minute and see the opportunities that actually fit your skills,
            your branch and your goals.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to={isAuthenticated ? homeLink : '/register'}
              className="btn inline-flex bg-white px-7 py-3 text-primary-700 shadow-sm hover:bg-primary-50"
            >
              {isAuthenticated ? 'Go to dashboard' : 'Create free account'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!isAuthenticated && (
              <Link
                to="/login"
                className="btn inline-flex border border-white/30 px-7 py-3 text-white hover:bg-white/10"
              >
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================== footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-slate-900">Student Opportunity Finder</span>
              </Link>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
                A semester project that centralises student opportunities and recommends the most
                relevant ones using a content-based recommendation engine.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">Platform</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>
                  <a href="#categories" className="hover:text-slate-900">
                    Categories
                  </a>
                </li>
                <li>
                  <a href="#featured" className="hover:text-slate-900">
                    Opportunities
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-slate-900">
                    How it works
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">Account</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>
                  <Link to="/login" className="hover:text-slate-900">
                    Student login
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="hover:text-slate-900">
                    Create account
                  </Link>
                </li>
                <li>
                  <Link to="/admin/login" className="hover:text-slate-900">
                    Administrator
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Student Opportunity Finder &mdash; B.Tech Data Science semester project.
            </p>
            <p className="text-xs text-slate-400">
              Demo listings are fictional and marked &ldquo;Sample&rdquo;.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
