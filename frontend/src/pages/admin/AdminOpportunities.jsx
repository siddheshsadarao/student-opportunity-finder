/**
 * Admin list of every opportunity, with search, filters, edit and delete.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle, Pencil, Trash2, Briefcase, ExternalLink } from 'lucide-react';
import { SkeletonRows, EmptyState, ConfirmDialog, Pagination } from '../../components/ui';
import useDebounce from '../../hooks/useDebounce';
import { adminApi, metaApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, deadlineLabel, deadlineTone } from '../../utils/format';
import { getCategoryColor } from '../../utils/constants';

export default function AdminOpportunities() {
  const [opportunities, setOpportunities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);
  const toast = useToast();

  useEffect(() => {
    metaApi.categories().then(setCategories).catch(() => {});
  }, []);

  // Any filter change goes back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.opportunities({
        search: debouncedSearch || undefined,
        category: category || undefined,
        status: status || undefined,
        page,
        limit: 15,
      });
      setOpportunities(data.opportunities);
      setPagination(data.pagination);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, status, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const result = await adminApi.deleteOpportunity(deleting.id);
      toast.success(result.message);
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunities</h1>
          <p className="mt-1 text-slate-500">{pagination.total} total in the catalogue.</p>
        </div>
        <Link to="/admin/opportunities/new" className="btn-primary shrink-0">
          <PlusCircle className="h-4 w-4" />
          Add opportunity
        </Link>
      </div>

      {/* ------------------------------------------------------- filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or organisation..."
            className="input pl-9"
            aria-label="Search opportunities"
          />
        </div>

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="input sm:w-48"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="input sm:w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="inactive">Hidden</option>
        </select>
      </div>

      {/* -------------------------------------------------------- results */}
      {loading ? (
        <SkeletonRows count={6} />
      ) : opportunities.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No opportunities found"
          description="Try a different search, or add the first opportunity."
          action={
            <Link to="/admin/opportunities/new" className="btn-primary">
              <PlusCircle className="h-4 w-4" />
              Add opportunity
            </Link>
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-12 lg:gap-4">
              <div className="col-span-5">Opportunity</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Deadline</div>
              <div className="col-span-1">Stats</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-slate-100">
              {opportunities.map((item) => {
                const colors = getCategoryColor(item.category?.color);
                const expired = deadlineLabel(item.deadline) === 'Closed';

                return (
                  <div
                    key={item.id}
                    className="px-5 py-4 transition hover:bg-slate-50 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4"
                  >
                    <div className="lg:col-span-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/opportunities/${item.id}`}
                          className="font-medium text-slate-900 hover:text-primary-700"
                        >
                          {item.title}
                        </Link>
                        {item.isDemo && (
                          <span className="badge border border-amber-200 bg-amber-50 text-amber-700">
                            Sample
                          </span>
                        )}
                        {!item.isActive && (
                          <span className="badge bg-slate-200 text-slate-600">Hidden</span>
                        )}
                        {expired && <span className="badge bg-red-50 text-red-700">Expired</span>}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {item.organization} &middot; {item.location} &middot; {item.mode}
                      </p>
                    </div>

                    <div className="mt-2 lg:col-span-2 lg:mt-0">
                      <span className={`badge ${colors.bg} ${colors.text}`}>
                        {item.category?.name}
                      </span>
                    </div>

                    <div className="mt-2 lg:col-span-2 lg:mt-0">
                      <p className="text-sm text-slate-600">{formatDate(item.deadline)}</p>
                      <p className={`text-xs font-medium ${deadlineTone(item.deadline)}`}>
                        {deadlineLabel(item.deadline)}
                      </p>
                    </div>

                    <div className="mt-2 lg:col-span-1 lg:mt-0">
                      <p className="text-xs text-slate-500">{item.viewsCount} views</p>
                      <p className="text-xs text-slate-500">{item.savesCount} saves</p>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 lg:col-span-2 lg:mt-0 lg:justify-end">
                      <a
                        href={item.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        title="Open application link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Link
                        to={`/admin/opportunities/${item.id}/edit`}
                        className="btn-secondary btn-sm"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleting(item)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onChange={(nextPage) => {
              setPage(nextPage);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete this opportunity?"
        message={`"${deleting?.title}" will be permanently deleted, along with every student's saved item and application for it. This cannot be undone.`}
        confirmLabel="Delete permanently"
      />
    </div>
  );
}
