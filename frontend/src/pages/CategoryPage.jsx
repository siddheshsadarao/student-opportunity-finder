/**
 * A dedicated page per category: /category/internship, /category/hackathon ...
 *
 * The category slug comes from the URL, so one component serves all eight
 * categories instead of writing the same page eight times.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import OpportunityCard from '../components/OpportunityCard';
import { SkeletonGrid, EmptyState, Pagination } from '../components/ui';
import useSaveToggle from '../hooks/useSaveToggle';
import { metaApi, opportunityApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { getCategoryColor } from '../utils/constants';
import { getCategoryIcon } from '../utils/iconMap';

export default function CategoryPage() {
  const { slug } = useParams();
  const toast = useToast();

  const [opportunities, setOpportunities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [category, setCategory] = useState(null);
  // 'relevant' interleaves sources, so a category page shows a spread of
  // sites rather than whichever one happens to list the most.
  const [sort, setSort] = useState('relevant');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const { toggleSave, savingIds } = useSaveToggle(setOpportunities);

  // Reset paging when the visitor switches category.
  useEffect(() => {
    setPage(1);
  }, [slug]);

  useEffect(() => {
    metaApi
      .categories()
      .then((list) => setCategory(list.find((item) => item.slug === slug) || null))
      .catch(() => setCategory(null));
  }, [slug]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    opportunityApi
      .list({ category: slug, sort, page, limit: 12 })
      .then((data) => {
        if (!active) return;
        setOpportunities(data.opportunities);
        setPagination(data.pagination);
      })
      .catch((error) => {
        if (active) toast.error(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, sort, page, toast]);

  // The database stores an icon name; look it up in the lucide-react export.
  const CategoryIcon = useMemo(() => {
    if (!category?.icon) return Compass;
    return getCategoryIcon(category.icon);
  }, [category]);

  const colors = getCategoryColor(category?.color);

  return (
    <div className="space-y-6">
      <Link
        to="/discover"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        All opportunities
      </Link>

      {/* --------------------------------------------------- category header */}
      <div className={`card flex items-start gap-4 border ${colors.border} ${colors.bg} p-6`}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <CategoryIcon className={`h-6 w-6 ${colors.text}`} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            {category?.name || 'Opportunities'}
          </h1>
          {category?.description && (
            <p className="mt-1 text-sm text-slate-600">{category.description}</p>
          )}
          <p className="mt-2 text-sm font-medium text-slate-700">
            {pagination.total} open {pagination.total === 1 ? 'opportunity' : 'opportunities'}
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------- sorting */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {loading ? 'Loading...' : `Showing ${opportunities.length} of ${pagination.total}`}
        </p>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
          className="input h-10 w-44"
          aria-label="Sort results"
        >
          <option value="relevant">Best Mix</option>
          <option value="deadline">Deadline Soon</option>
          <option value="newest">Newest</option>
          <option value="popular">Popular</option>
        </select>
      </div>

      {/* --------------------------------------------------------- results */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : opportunities.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={`No open ${category?.name?.toLowerCase() || 'opportunities'} right now`}
          description="Check back soon, or explore the other categories."
          action={
            <Link to="/discover" className="btn-primary">
              Browse all opportunities
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {opportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                onToggleSave={toggleSave}
                saving={savingIds.has(opportunity.id)}
              />
            ))}
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
    </div>
  );
}
