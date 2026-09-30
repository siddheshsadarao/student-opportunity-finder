/**
 * The full "Recommended for you" feed.
 *
 * Every card carries a match percentage produced by the Python engine and the
 * reasons behind it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Compass, RefreshCw, Info } from 'lucide-react';
import OpportunityCard from '../components/OpportunityCard';
import { SkeletonGrid, EmptyState, Spinner } from '../components/ui';
import useSaveToggle from '../hooks/useSaveToggle';
import { recommendationApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function Recommended() {
  const [opportunities, setOpportunities] = useState([]);
  const [engine, setEngine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const toast = useToast();
  const { profile } = useAuth();
  const { toggleSave, savingIds } = useSaveToggle(setOpportunities);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const data = await recommendationApi.list({ limit: 30 });
        setOpportunities(data.opportunities);
        setEngine(data.engine);
        if (isRefresh) toast.success('Recommendations refreshed.');
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Sparkles className="h-6 w-6 text-primary-600" />
            Recommended for you
          </h1>
          <p className="mt-1 text-slate-500">
            Ranked by how well each opportunity matches your skills, interests and preferences.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="btn-secondary shrink-0"
        >
          {refreshing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* How the score is calculated -- useful during a demo. */}
      <div className="card flex gap-3 border-primary-100 bg-primary-50/50 p-4">
        <Info className="h-5 w-5 shrink-0 text-primary-600" />
        <div className="text-sm text-slate-700">
          <p className="font-medium text-slate-900">How your match score is calculated</p>
          <p className="mt-1 leading-relaxed text-slate-600">
            Your profile is turned into a text profile and compared against every open opportunity
            using <strong>TF-IDF</strong> and <strong>cosine similarity</strong>. That similarity is
            then blended with your skill overlap, preferred opportunity types, work mode and
            location to produce the percentage on each card.
          </p>
          {engine === 'fallback' && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              The Python service is currently offline, so these scores come from the built-in
              backup scorer.
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : opportunities.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No recommendations yet"
          description={
            profile?.skills?.length
              ? 'Nothing is open right now that matches your profile. Try browsing everything on Discover.'
              : 'Add skills and interests to your profile and we will start matching opportunities to you.'
          }
          action={
            <div className="flex gap-2">
              <Link to="/profile" className="btn-secondary">
                Edit profile
              </Link>
              <Link to="/discover" className="btn-primary">
                Browse all
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {opportunities.length} opportunities matched to your profile
          </p>
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
        </>
      )}
    </div>
  );
}
