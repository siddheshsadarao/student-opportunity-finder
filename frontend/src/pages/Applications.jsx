/**
 * The application tracker, shown as a kanban board.
 *
 * Cards can be dragged between columns (HTML5 drag and drop) and there is
 * also a dropdown on every card, so the board still works on touch screens
 * where dragging is awkward.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Trash2, GripVertical, Compass, ExternalLink } from 'lucide-react';
import { EmptyState, ConfirmDialog, SkeletonRows } from '../components/ui';
import { applicationApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { formatDate, deadlineLabel, deadlineTone } from '../utils/format';
import { APPLICATION_STATUSES, STATUS_STYLES, getCategoryColor } from '../utils/constants';

export default function Applications() {
  const [grouped, setGrouped] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await applicationApi.list();
      setGrouped(data.grouped);
      setTotal(data.applications.length);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Moves one card to a new status.
   * The board updates first and rolls back if the request fails.
   */
  const moveTo = async (application, nextStatus) => {
    if (application.status === nextStatus) return;

    const previousStatus = application.status;

    setGrouped((current) => ({
      ...current,
      [previousStatus]: (current[previousStatus] || []).filter(
        (item) => item.applicationId !== application.applicationId
      ),
      [nextStatus]: [
        { ...application, status: nextStatus },
        ...(current[nextStatus] || []),
      ],
    }));

    try {
      await applicationApi.update(application.applicationId, { status: nextStatus });
      toast.success(`Moved to "${nextStatus}".`);
    } catch (error) {
      toast.error(error.message);
      load(); // reload the true state from the server
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await applicationApi.remove(deleting.applicationId);
      setGrouped((current) => ({
        ...current,
        [deleting.status]: (current[deleting.status] || []).filter(
          (item) => item.applicationId !== deleting.applicationId
        ),
      }));
      setTotal((current) => current - 1);
      toast.success('Removed from your tracker.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-7 w-52" />
        <SkeletonRows count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ClipboardList className="h-6 w-6 text-primary-600" />
          My applications
        </h1>
        <p className="mt-1 text-slate-500">
          Drag a card to another column, or use the dropdown to change its status.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Your tracker is empty"
          description='Open any opportunity and choose "Mark as applied" (or "Planning to apply") to start tracking it here.'
          action={
            <Link to="/discover" className="btn-primary">
              <Compass className="h-4 w-4" />
              Find opportunities
            </Link>
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {APPLICATION_STATUSES.map((status) => {
            const cards = grouped[status] || [];
            const styles = STATUS_STYLES[status];

            return (
              <div
                key={status}
                // Drag and drop handlers for the whole column.
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverColumn(status);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={() => {
                  if (dragging) moveTo(dragging, status);
                  setDragging(null);
                  setDragOverColumn(null);
                }}
                className={`flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-slate-100/70 transition ${
                  styles.column
                } ${dragOverColumn === status ? 'ring-2 ring-primary-400' : ''}`}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                    <h2 className="text-sm font-semibold text-slate-800">{status}</h2>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {cards.length}
                  </span>
                </div>

                <div className="flex-1 space-y-2.5 px-2.5 pb-3">
                  {cards.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                      Drop a card here
                    </p>
                  ) : (
                    cards.map((application) => {
                      const { opportunity } = application;
                      const colors = getCategoryColor(opportunity.category?.color);

                      return (
                        <article
                          key={application.applicationId}
                          draggable
                          onDragStart={() => setDragging(application)}
                          onDragEnd={() => setDragging(null)}
                          className="group cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/opportunities/${opportunity.id}`}
                                className="line-clamp-2 text-sm font-medium text-slate-900 transition hover:text-primary-700"
                              >
                                {opportunity.title}
                              </Link>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {opportunity.organization}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className={`badge ${colors.bg} ${colors.text}`}>
                              {opportunity.category?.name}
                            </span>
                          </div>

                          <p className="mt-2 text-xs">
                            <span className="text-slate-400">
                              {formatDate(opportunity.deadline)}
                            </span>{' '}
                            <span className={`font-medium ${deadlineTone(opportunity.deadline)}`}>
                              &middot; {deadlineLabel(opportunity.deadline)}
                            </span>
                          </p>

                          <div className="mt-2.5 flex items-center gap-1.5">
                            <select
                              value={application.status}
                              onChange={(event) => moveTo(application, event.target.value)}
                              className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-600 focus:border-primary-500"
                              aria-label={`Change status of ${opportunity.title}`}
                            >
                              {APPLICATION_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>

                            <a
                              href={opportunity.applicationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                              title="Open application link"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>

                            <button
                              type="button"
                              onClick={() => setDeleting(application)}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Stop tracking"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Stop tracking this?"
        message={`"${deleting?.opportunity?.title}" will be removed from your application tracker. The opportunity itself is not deleted.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
