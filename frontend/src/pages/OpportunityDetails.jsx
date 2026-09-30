/**
 * Full details for one opportunity.
 *
 * Public: anyone can read it. When a student is logged in we also show the
 * "Why this matches you" panel, the save button and the application tracker
 * controls.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Building2,
  MapPin,
  CalendarDays,
  Clock,
  Wallet,
  ExternalLink,
  Sparkles,
  Check,
  GraduationCap,
  Gift,
  Link2,
  ShieldQuestion,
} from 'lucide-react';
import { EmptyState, Spinner, PageLoader } from '../components/ui';
import MatchAnalysis from '../components/MatchAnalysis';
import {
  opportunityApi,
  savedApi,
  applicationApi,
  recommendationApi,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatLongDate, deadlineLabel, deadlineTone, matchTone } from '../utils/format';
import { getCategoryColor, APPLICATION_STATUSES } from '../utils/constants';

/** One labelled fact in the sidebar. */
function Fact({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export default function OpportunityDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isStudent } = useAuth();
  const toast = useToast();

  const [opportunity, setOpportunity] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await opportunityApi.get(id);
      setOpportunity(data);

      // Only students get a personalised explanation.
      if (isStudent) {
        try {
          setMatch(await recommendationApi.explain(id));
        } catch {
          setMatch(null); // not fatal -- just hide the panel
        }
      }
    } catch (error) {
      if (error.status === 404) setNotFound(true);
      else toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id, isStudent, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleSave = async () => {
    if (!isAuthenticated) {
      toast.info('Log in to save opportunities.');
      navigate('/login', { state: { from: `/opportunities/${id}` } });
      return;
    }

    setSaving(true);
    try {
      if (opportunity.isSaved) {
        await savedApi.unsave(opportunity.id);
        setOpportunity((current) => ({ ...current, isSaved: false }));
        toast.success('Removed from your saved list.');
      } else {
        await savedApi.save(opportunity.id);
        setOpportunity((current) => ({ ...current, isSaved: true }));
        toast.success('Saved to your list.');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const onChangeStatus = async (status) => {
    if (!isAuthenticated) {
      toast.info('Log in to track your applications.');
      navigate('/login', { state: { from: `/opportunities/${id}` } });
      return;
    }

    setTracking(true);
    try {
      await applicationApi.track(opportunity.id, { status });
      setOpportunity((current) => ({ ...current, applicationStatus: status }));
      toast.success(`Tracked as "${status}".`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setTracking(false);
    }
  };

  /** Opens the external application link and records the intent to apply. */
  const onApply = () => {
    window.open(opportunity.applicationUrl, '_blank', 'noopener,noreferrer');
    if (isStudent && !opportunity.applicationStatus) onChangeStatus('Applied');
  };

  if (loading) return <PageLoader label="Loading opportunity..." />;

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState
          icon={ShieldQuestion}
          title="Opportunity not found"
          description="This opportunity may have been removed by the administrator."
          action={
            <Link to="/discover" className="btn-primary">
              Browse opportunities
            </Link>
          }
        />
      </div>
    );
  }

  if (!opportunity) return null;

  const colors = getCategoryColor(opportunity.category?.color);
  const closed = deadlineLabel(opportunity.deadline) === 'Closed';

  return (
    <div className={isAuthenticated ? '' : 'min-h-screen bg-slate-50 px-4 py-8'}>
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* ---------------------------------------------------------- header */}
        <div className="card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {opportunity.organizationLogo ? (
              <img
                src={opportunity.organizationLogo}
                alt={opportunity.organization}
                className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 object-cover"
              />
            ) : (
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}
              >
                <Building2 className={`h-7 w-7 ${colors.text}`} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`badge ${colors.bg} ${colors.text}`}>
                  {opportunity.category?.name}
                </span>
                <span className="badge bg-slate-100 text-slate-600">{opportunity.mode}</span>

                {match?.matchScore != null && (
                  <span className={`badge border ${matchTone(match.matchScore)}`}>
                    <Sparkles className="h-3 w-3" />
                    {match.matchScore}% Match
                  </span>
                )}

                {opportunity.isDemo && (
                  <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                    Sample data
                  </span>
                )}

                {opportunity.applicationStatus && (
                  <span className="badge bg-blue-50 text-blue-700">
                    {opportunity.applicationStatus}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-slate-900">{opportunity.title}</h1>
              <p className="mt-1 text-slate-600">{opportunity.organization}</p>

              <p className={`mt-3 text-sm font-medium ${deadlineTone(opportunity.deadline)}`}>
                Application deadline: {formatLongDate(opportunity.deadline)} &middot;{' '}
                {deadlineLabel(opportunity.deadline)}
              </p>
            </div>
          </div>

          {/* ------------------------------------------------------ actions */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={onApply}
              disabled={closed}
              className="btn-primary"
              title={closed ? 'This opportunity has closed' : 'Open the application page'}
            >
              <ExternalLink className="h-4 w-4" />
              {closed ? 'Applications closed' : 'Apply now'}
            </button>

            <button
              type="button"
              onClick={onToggleSave}
              disabled={saving}
              className="btn-secondary"
            >
              {saving ? (
                <Spinner className="h-4 w-4" />
              ) : opportunity.isSaved ? (
                <BookmarkCheck className="h-4 w-4 text-primary-600" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
              {opportunity.isSaved ? 'Saved' : 'Save opportunity'}
            </button>

            {isStudent && (
              <select
                value={opportunity.applicationStatus || ''}
                onChange={(event) => onChangeStatus(event.target.value)}
                disabled={tracking}
                className="input h-auto w-auto py-2.5 text-sm"
                aria-label="Application status"
              >
                <option value="" disabled>
                  Track this application...
                </option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {opportunity.isDemo && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
              <strong>Sample data:</strong> this is a fictional listing created to demonstrate the
              platform. The organisation, deadline and application link are not real.
            </p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ------------------------------------------------------- main */}
          <div className="space-y-6 lg:col-span-2">
            <section className="card p-6">
              <h2 className="section-title mb-3">About this opportunity</h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-600">
                {opportunity.description}
              </p>
            </section>

            {opportunity.eligibility && (
              <section className="card p-6">
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-slate-400" />
                  Eligibility
                </h2>
                <p className="whitespace-pre-line leading-relaxed text-slate-600">
                  {opportunity.eligibility}
                </p>
              </section>
            )}

            {opportunity.benefits && (
              <section className="card p-6">
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <Gift className="h-5 w-5 text-slate-400" />
                  Benefits
                </h2>
                <p className="whitespace-pre-line leading-relaxed text-slate-600">
                  {opportunity.benefits}
                </p>
              </section>
            )}

            {opportunity.skills?.length > 0 && (
              <section className="card p-6">
                <h2 className="section-title mb-3">Required skills</h2>
                <div className="flex flex-wrap gap-2">
                  {opportunity.skills.map((skill) => (
                    <span key={skill} className="badge-skill">
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ------------------------------ why this matches you (AI panel) */}
            {isStudent && match?.analysis && (
              <MatchAnalysis analysis={match.analysis} engine={match.engine} />
            )}

            {/* Fallback: the backup scorer has reasons but no full analysis. */}
            {isStudent && !match?.analysis && match?.reasons?.length > 0 && (
              <section className="card border-primary-200 bg-primary-50/40 p-6">
                <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Sparkles className="h-5 w-5 text-primary-600" />
                  Why this matches you
                </h2>
                <p className="mb-4 text-sm text-slate-600">
                  Scored <strong className="text-primary-700">{match.matchScore}%</strong> for your
                  profile.
                </p>
                <ul className="space-y-2.5">
                  {match.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-3 w-3 text-emerald-700" />
                      </span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ---------------------------------------------------- sidebar */}
          <aside className="space-y-6">
            <div className="card space-y-4 p-6">
              <h2 className="text-sm font-semibold text-slate-900">Details</h2>
              <Fact icon={Building2} label="Organisation" value={opportunity.organization} />
              <Fact icon={MapPin} label="Location" value={opportunity.location} />
              <Fact icon={Building2} label="Work mode" value={opportunity.mode} />
              <Fact icon={Clock} label="Duration" value={opportunity.duration} />
              <Fact icon={Wallet} label="Stipend / Award" value={opportunity.stipend} />
              <Fact
                icon={CalendarDays}
                label="Deadline"
                value={formatLongDate(opportunity.deadline)}
              />
              <Fact icon={Link2} label="Source" value={opportunity.source} />
            </div>

            <div className="card p-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Ready to apply?</h2>
              <p className="mb-4 text-sm text-slate-600">
                The application is handled on the organisation&apos;s own website.
              </p>
              <button
                type="button"
                onClick={onApply}
                disabled={closed}
                className="btn-primary w-full"
              >
                <ExternalLink className="h-4 w-4" />
                {closed ? 'Closed' : 'Apply now'}
              </button>

              {!isAuthenticated && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  <Link to="/register" className="font-medium text-primary-600 hover:underline">
                    Create an account
                  </Link>{' '}
                  to save it and track your deadline.
                </p>
              )}
            </div>

            <p className="px-2 text-xs text-slate-400">
              Viewed {opportunity.viewsCount} times &middot; saved by {opportunity.savesCount}{' '}
              students
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
