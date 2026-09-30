/**
 * The student dashboard: greeting, four statistic cards, the top
 * recommendations and the deadlines coming up.
 *
 * Everything arrives from one endpoint (/api/dashboard) so the page needs a
 * single request instead of five.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Bookmark,
  CalendarClock,
  ClipboardList,
  ArrowRight,
  Compass,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import OpportunityCard from '../components/OpportunityCard';
import { SkeletonGrid, SkeletonStats, EmptyState } from '../components/ui';
import useSaveToggle from '../hooks/useSaveToggle';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { dashboardApi } from '../services/api';
import { greeting, formatDate, deadlineLabel, deadlineTone } from '../utils/format';
import { getCategoryColor } from '../utils/constants';

/** One of the four statistic cards at the top. */
function StatCard({ icon: Icon, label, value, tone, to }) {
  const content = (
    <div className="card-hover flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The save-toggle hook needs a setter for the recommendation list.
  const setRecommendations = useCallback((updater) => {
    setData((current) => {
      if (!current) return current;
      const next =
        typeof updater === 'function' ? updater(current.recommendations) : updater;
      return { ...current, recommendations: next };
    });
  }, []);

  const { toggleSave, savingIds } = useSaveToggle(setRecommendations);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const result = await dashboardApi.get();
        if (active) setData(result);
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          toast.error(loadError.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <div className="skeleton h-7 w-64" />
          <div className="skeleton mt-2 h-4 w-80" />
        </div>
        <SkeletonStats />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load your dashboard"
        description={error}
        action={
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        }
      />
    );
  }

  const { stats, recommendations = [], upcomingDeadlines = [], engine } = data;
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------ greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {greeting()}, {firstName} <span aria-hidden="true">&#128075;</span>
        </h1>
        <p className="mt-1 text-slate-500">Discover opportunities selected for you.</p>
      </div>

      {/* --------------------------------------------- profile completion */}
      {profile && profile.completion?.percentage < 100 && (
        <div className="card flex flex-col gap-4 border-primary-100 bg-primary-50/50 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary-600" />
              <p className="text-sm font-semibold text-slate-900">
                Profile strength: {profile.completion.percentage}%
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-primary-600 transition-all duration-700"
                style={{ width: `${profile.completion.percentage}%` }}
              />
            </div>
            {profile.completion.suggestions?.[0] && (
              <p className="mt-2 text-xs text-slate-600">
                Next: {profile.completion.suggestions[0]}
              </p>
            )}
          </div>
          <Link to="/profile" className="btn-primary btn-sm shrink-0">
            Improve profile
          </Link>
        </div>
      )}

      {/* --------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="Recommended for you"
          value={stats.recommended}
          tone="bg-primary-50 text-primary-600"
          to="/recommended"
        />
        <StatCard
          icon={Bookmark}
          label="Saved opportunities"
          value={stats.saved}
          tone="bg-emerald-50 text-emerald-600"
          to="/saved"
        />
        <StatCard
          icon={CalendarClock}
          label="Deadlines this week"
          value={stats.upcomingDeadlines}
          tone="bg-amber-50 text-amber-600"
          to="/calendar"
        />
        <StatCard
          icon={ClipboardList}
          label="Applications"
          value={stats.applications}
          tone="bg-blue-50 text-blue-600"
          to="/applications"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------- recommendations */}
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title">Recommended for you</h2>
              <p className="muted mt-0.5">
                Matched to your skills, interests and preferences.
              </p>
            </div>
            <Link
              to="/recommended"
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recommendations.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No recommendations yet"
              description="Add a few more skills and interests to your profile, or browse everything on Discover."
              action={
                <Link to="/discover" className="btn-primary">
                  Explore opportunities
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recommendations.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onToggleSave={toggleSave}
                  saving={savingIds.has(opportunity.id)}
                />
              ))}
            </div>
          )}

          {/* Honest note about which engine produced the scores. */}
          {engine === 'fallback' && recommendations.length > 0 && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The Python recommendation service is offline, so these scores come from the built-in
              backup scorer. Start it with <span className="font-mono">uvicorn app.main:app</span>{' '}
              for full results.
            </p>
          )}
        </section>

        {/* ------------------------------------------ upcoming deadlines */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Upcoming deadlines</h2>
            <Link
              to="/calendar"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Calendar
            </Link>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="card px-5 py-8 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Nothing due soon</p>
              <p className="mt-1 text-xs text-slate-500">
                Save an opportunity and its deadline will appear here.
              </p>
            </div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {upcomingDeadlines.map((item) => {
                const colors = getCategoryColor(item.category?.color);
                return (
                  <Link
                    key={item.id}
                    to={`/opportunities/${item.id}`}
                    className="flex items-start gap-3 p-4 transition hover:bg-slate-50"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-medium text-slate-900">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {item.organization}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400">{formatDate(item.deadline)}</span>
                        <span className={`font-medium ${deadlineTone(item.deadline)}`}>
                          &middot; {deadlineLabel(item.deadline)}
                        </span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
