/**
 * Admin -> Data Sources.
 *
 * Shows where the live opportunities come from, what the last ingestion run
 * did, and lets the admin enable/disable a source or moderate listings that
 * are waiting for review.
 *
 * Note there is no "Run now" button. Ingestion is a scheduled background job
 * (cron, every 6 hours). Triggering a multi-minute scrape from a web request
 * would hang the page and would let the job be fired repeatedly, which is
 * impolite to the sites we fetch from.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Rss,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Database,
  Info,
} from 'lucide-react';
import { SkeletonRows, SkeletonStats, EmptyState, Spinner } from '../../components/ui';
import { adminApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, timeAgo } from '../../utils/format';

const RUN_STATUS = {
  success: { icon: CheckCircle2, className: 'text-emerald-600' },
  failed: { icon: XCircle, className: 'text-red-600' },
  running: { icon: Clock, className: 'text-amber-600' },
};

export default function AdminSources() {
  const [data, setData] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const overview = await adminApi.ingestion();
      setData(overview);
      if (overview.pendingCount > 0) {
        setPending(await adminApi.pendingReview());
      } else {
        setPending([]);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSource = async (source, field) => {
    setBusyKey(source.key);
    try {
      const payload =
        field === 'enabled'
          ? { isEnabled: !source.is_enabled }
          : { autoApprove: !source.auto_approve };

      await adminApi.updateSource(source.key, payload);
      toast.success(`${source.name} updated.`);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyKey(null);
    }
  };

  const review = async (opportunity, decision) => {
    setBusyKey(`review-${opportunity.id}`);
    try {
      const result = await adminApi.review(opportunity.id, decision);
      toast.success(result.message);
      setPending((current) => current.filter((item) => item.id !== opportunity.id));
      setData((current) =>
        current ? { ...current, pendingCount: Math.max(0, current.pendingCount - 1) } : current
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-7 w-48" />
        <SkeletonStats count={3} />
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (!data) return <EmptyState icon={Database} title="Could not load ingestion data" />;

  const { sources = [], runs = [], totals = {}, pendingCount = 0 } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Rss className="h-6 w-6 text-primary-600" />
          Data sources
        </h1>
        <p className="mt-1 text-slate-500">
          Where the live opportunities come from, and how the last import went.
        </p>
      </div>

      {/* --------------------------------------------------------- totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Imported automatically', totals.external_total],
          ['Currently open', totals.external_live],
          ['Added by hand', totals.manual_total],
        ].map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{value ?? 0}</p>
          </div>
        ))}
      </div>

      {totals.last_ingested_at && (
        <p className="text-sm text-slate-500">
          Last import: {timeAgo(totals.last_ingested_at)} ({formatDate(totals.last_ingested_at)})
        </p>
      )}

      {/* ---------------------------------------------------- review queue */}
      {pendingCount > 0 && (
        <section className="card border-amber-200 bg-amber-50/50 p-6">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Waiting for review ({pendingCount})
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            These came from a source with auto-publish turned off. Students cannot see them yet.
          </p>

          <div className="space-y-3">
            {pending.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {item.organization} &middot; {item.category?.name} &middot; closes{' '}
                      {formatDate(item.deadline)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      from <span className="font-medium">{item.source}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary btn-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => review(item, 'rejected')}
                      disabled={busyKey === `review-${item.id}`}
                      className="btn-secondary btn-sm"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => review(item, 'approved')}
                      disabled={busyKey === `review-${item.id}`}
                      className="btn-primary btn-sm"
                    >
                      {busyKey === `review-${item.id}` ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- sources */}
      <section>
        <h2 className="section-title mb-3">Configured sources</h2>

        <div className="card divide-y divide-slate-100">
          {sources.map((source) => (
            <div key={source.key} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{source.name}</h3>
                    <span className="badge bg-slate-100 text-slate-600">{source.kind}</span>
                    {source.is_enabled ? (
                      <span className="badge bg-emerald-50 text-emerald-700">Enabled</span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-600">Disabled</span>
                    )}
                    {!source.auto_approve && (
                      <span className="badge bg-amber-50 text-amber-700">Needs review</span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{source.notes}</p>

                  <p className="mt-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-600">{source.live_count}</span> open
                    listings
                    {source.last_run_at && <> &middot; last run {timeAgo(source.last_run_at)}</>}
                    {source.homepage && (
                      <>
                        {' '}
                        &middot;{' '}
                        <a
                          href={source.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          {source.homepage.replace(/^https?:\/\//, '')}
                        </a>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSource(source, 'enabled')}
                    disabled={busyKey === source.key}
                    className="btn-secondary btn-sm"
                  >
                    {source.is_enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSource(source, 'approve')}
                    disabled={busyKey === source.key}
                    className="btn-secondary btn-sm"
                    title="Whether new listings publish immediately or wait for review"
                  >
                    {source.auto_approve ? 'Require review' : 'Auto-publish'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- runs */}
      <section>
        <h2 className="section-title mb-3">Recent import runs</h2>

        {runs.length === 0 ? (
          <div className="card p-6">
            <p className="text-sm text-slate-500">
              No imports have run yet. Run one from the project folder:
            </p>
            <code className="mt-2 block rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">
              python -m ingestion.run
            </code>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-12 lg:gap-4">
              <div className="col-span-3">Source</div>
              <div className="col-span-3">When</div>
              <div className="col-span-5">Result</div>
              <div className="col-span-1">Status</div>
            </div>

            <div className="divide-y divide-slate-100">
              {runs.map((run) => {
                const style = RUN_STATUS[run.status] || RUN_STATUS.running;
                const StatusIcon = style.icon;

                return (
                  <div
                    key={run.id}
                    className="px-5 py-3.5 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4"
                  >
                    <div className="lg:col-span-3">
                      <p className="font-medium text-slate-800">{run.source_key}</p>
                    </div>
                    <div className="mt-1 lg:col-span-3 lg:mt-0">
                      <p className="text-sm text-slate-500">{timeAgo(run.started_at)}</p>
                    </div>
                    <div className="mt-1 lg:col-span-5 lg:mt-0">
                      {run.error_message ? (
                        <p className="text-sm text-red-600">{run.error_message}</p>
                      ) : (
                        <p className="text-sm text-slate-600">
                          fetched {run.fetched_count} &middot;{' '}
                          <span className="font-medium text-emerald-700">
                            +{run.created_count} new
                          </span>{' '}
                          &middot; {run.updated_count} updated &middot; {run.skipped_count} skipped
                        </p>
                      )}
                    </div>
                    <div className="mt-1 lg:col-span-1 lg:mt-0">
                      <StatusIcon className={`h-4.5 w-4.5 ${style.className}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- notes */}
      <section className="card flex gap-3 p-5">
        <Info className="h-5 w-5 shrink-0 text-slate-400" />
        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-900">How importing works</p>
          <p className="mt-1 leading-relaxed">
            A scheduled job fetches from each source&apos;s public API, converts every format into
            one common shape, removes duplicates and writes the results here. It runs in the
            background &mdash; never while a student is browsing &mdash; so a slow or failing
            source can never make a page slow.
          </p>
          <p className="mt-2 leading-relaxed">
            Only sources whose <span className="font-mono text-xs">robots.txt</span> permits
            automated access are included. Sites that forbid it (LinkedIn, Indeed, Internshala and
            similar) are deliberately left out. See{' '}
            <span className="font-mono text-xs">docs/DATA_INGESTION.md</span> for the evidence.
          </p>
          <Link
            to="/admin/opportunities"
            className="mt-3 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Manage all opportunities &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
