/**
 * Saved (bookmarked) opportunities, shown as a table on desktop and stacked
 * cards on mobile. Each row can be opened, marked as applied or removed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Trash2, ExternalLink, CheckCircle2, Compass } from 'lucide-react';
import { SkeletonRows, EmptyState, ConfirmDialog, Spinner } from '../components/ui';
import { savedApi, applicationApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { formatDate, deadlineLabel, deadlineTone } from '../utils/format';
import { getCategoryColor } from '../utils/constants';

export default function Saved() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null); // the item awaiting confirmation
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setItems(await savedApi.list());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmRemove = async () => {
    if (!removing) return;
    setBusyId(removing.id);
    try {
      await savedApi.unsave(removing.id);
      setItems((current) => current.filter((item) => item.id !== removing.id));
      toast.success('Removed from your saved list.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
      setRemoving(null);
    }
  };

  const markApplied = async (opportunity) => {
    setBusyId(opportunity.id);
    try {
      await applicationApi.track(opportunity.id, { status: 'Applied' });
      setItems((current) =>
        current.map((item) =>
          item.id === opportunity.id ? { ...item, applicationStatus: 'Applied' } : item
        )
      );
      toast.success('Marked as applied. Track it on My Applications.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-7 w-48" />
        <SkeletonRows count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Bookmark className="h-6 w-6 text-primary-600" />
          Saved opportunities
        </h1>
        <p className="mt-1 text-slate-500">
          {items.length} {items.length === 1 ? 'opportunity' : 'opportunities'} bookmarked.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="You have not saved anything yet"
          description="Tap the bookmark icon on any opportunity to keep it here and get deadline reminders."
          action={
            <Link to="/discover" className="btn-primary">
              <Compass className="h-4 w-4" />
              Explore opportunities
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          {/* ------------------------------------------ desktop table head */}
          <div className="hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-12 lg:gap-4">
            <div className="col-span-5">Opportunity</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Deadline</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const colors = getCategoryColor(item.category?.color);
              const isBusy = busyId === item.id;

              return (
                <div
                  key={item.id}
                  className="px-5 py-4 transition hover:bg-slate-50 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4"
                >
                  {/* title */}
                  <div className="lg:col-span-5">
                    <Link
                      to={`/opportunities/${item.id}`}
                      className="line-clamp-2 font-medium text-slate-900 transition hover:text-primary-700"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-500">{item.organization}</p>
                  </div>

                  {/* category */}
                  <div className="mt-2 lg:col-span-2 lg:mt-0">
                    <span className={`badge ${colors.bg} ${colors.text}`}>
                      {item.category?.name}
                    </span>
                  </div>

                  {/* deadline */}
                  <div className="mt-2 lg:col-span-2 lg:mt-0">
                    <p className="text-sm text-slate-600">{formatDate(item.deadline)}</p>
                    <p className={`text-xs font-medium ${deadlineTone(item.deadline)}`}>
                      {deadlineLabel(item.deadline)}
                    </p>
                  </div>

                  {/* status */}
                  <div className="mt-2 lg:col-span-1 lg:mt-0">
                    {item.applicationStatus ? (
                      <span className="badge bg-blue-50 text-blue-700">
                        {item.applicationStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not applied</span>
                    )}
                  </div>

                  {/* actions */}
                  <div className="mt-3 flex items-center gap-2 lg:col-span-2 lg:mt-0 lg:justify-end">
                    <Link to={`/opportunities/${item.id}`} className="btn-secondary btn-sm">
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Link>

                    {!item.applicationStatus && (
                      <button
                        type="button"
                        onClick={() => markApplied(item)}
                        disabled={isBusy}
                        className="btn-secondary btn-sm"
                        title="Mark as applied"
                      >
                        {isBusy ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        <span className="lg:hidden xl:inline">Applied</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setRemoving(item)}
                      disabled={isBusy}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${item.title} from saved`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={busyId === removing?.id}
        title="Remove from saved?"
        message={`"${removing?.title}" will be removed from your saved list. You can always save it again from Discover.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
