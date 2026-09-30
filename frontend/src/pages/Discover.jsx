/**
 * Discover: the full opportunity search page.
 *
 * Filters (category, skills, location, work mode, deadline, organisation) and
 * sorting live in the URL query string. That means a filtered view can be
 * bookmarked or shared, and the browser Back button works as expected.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Compass, RotateCcw } from 'lucide-react';
import OpportunityCard from '../components/OpportunityCard';
import { SkeletonGrid, EmptyState, Pagination } from '../components/ui';
import useSaveToggle from '../hooks/useSaveToggle';
import useDebounce from '../hooks/useDebounce';
import { opportunityApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const DEADLINE_PRESETS = [
  { value: '', label: 'Any deadline' },
  { value: '7', label: 'Within 7 days' },
  { value: '30', label: 'Within 30 days' },
  { value: '90', label: 'Within 3 months' },
];

/** Turns "30" (days) into the YYYY-MM-DD the API expects. */
function daysToDate(days) {
  if (!days) return '';
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [opportunities, setOpportunities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filterOptions, setFilterOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // The search box is local state so typing feels instant; the debounced
  // value is what actually goes into the URL and triggers a request.
  const [searchText, setSearchText] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchText, 400);

  const { toggleSave, savingIds } = useSaveToggle(setOpportunities);

  // Read the current filters straight from the URL.
  const filters = useMemo(
    () => ({
      search: searchParams.get('search') || '',
      category: searchParams.get('category') || '',
      skills: searchParams.get('skills') || '',
      location: searchParams.get('location') || '',
      mode: searchParams.get('mode') || '',
      organization: searchParams.get('organization') || '',
      deadlineDays: searchParams.get('deadlineDays') || '',
      sort: searchParams.get('sort') || 'relevant',
      page: Number(searchParams.get('page') || 1),
    }),
    [searchParams]
  );

  /** Writes one filter into the URL and resets to page 1. */
  const setFilter = useCallback(
    (key, value) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  // Push the debounced search text into the URL.
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilter('search', debouncedSearch);
  }, [debouncedSearch, filters.search, setFilter]);

  // Load the dropdown options once.
  useEffect(() => {
    opportunityApi
      .filters()
      .then(setFilterOptions)
      .catch(() => {
        /* filters are optional -- the list still works without them */
      });
  }, []);

  // Load the list whenever any filter changes.
  useEffect(() => {
    let active = true;
    setLoading(true);

    opportunityApi
      .list({
        search: filters.search || undefined,
        category: filters.category || undefined,
        skills: filters.skills || undefined,
        location: filters.location || undefined,
        mode: filters.mode || undefined,
        organization: filters.organization || undefined,
        deadlineBefore: daysToDate(filters.deadlineDays) || undefined,
        sort: filters.sort,
        page: filters.page,
        limit: 12,
      })
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
  }, [filters, toast]);

  /** Skills filter is a comma-separated list in the URL. */
  const selectedSkills = filters.skills ? filters.skills.split(',') : [];

  const toggleSkill = (skill) => {
    const next = selectedSkills.includes(skill)
      ? selectedSkills.filter((item) => item !== skill)
      : [...selectedSkills, skill];
    setFilter('skills', next.join(','));
  };

  const clearAll = () => {
    setSearchText('');
    setSearchParams(new URLSearchParams());
  };

  const activeFilterCount = [
    filters.category,
    filters.skills,
    filters.location,
    filters.mode,
    filters.organization,
    filters.deadlineDays,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Discover opportunities</h1>
        <p className="mt-1 text-slate-500">
          Search across internships, scholarships, hackathons, competitions and courses.
        </p>
      </div>

      {/* -------------------------------------------------- search + sort */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search internships, scholarships, hackathons..."
            className="input h-11 pl-10"
            aria-label="Search opportunities"
          />
        </div>

        <select
          value={filters.sort}
          onChange={(event) => setFilter('sort', event.target.value)}
          className="input h-11 sm:w-48"
          aria-label="Sort results"
        >
          {(filterOptions?.sortOptions || [{ value: 'relevant', label: 'Most Relevant' }]).map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            )
          )}
        </select>

        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className="btn-secondary h-11 lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary-600 px-1.5 text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* ------------------------------------------------------ filters */}
        <aside className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="card sticky top-20 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </div>

            {/* Category */}
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Category
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setFilter('category', '')}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
                    !filters.category
                      ? 'bg-primary-50 font-medium text-primary-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All categories
                </button>
                {filterOptions?.categories?.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setFilter('category', category.slug)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
                      filters.category === category.slug
                        ? 'bg-primary-50 font-medium text-primary-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{category.name}</span>
                    <span className="text-xs text-slate-400">{category.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Work mode */}
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Work mode
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Remote', 'Hybrid', 'On-site'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilter('mode', filters.mode === mode ? '' : mode)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      filters.mode === mode
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Skills
              </p>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {filterOptions?.skills?.slice(0, 20).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      selectedSkills.includes(skill)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="px-4 py-3">
              <label
                htmlFor="filter-location"
                className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Location
              </label>
              <select
                id="filter-location"
                value={filters.location}
                onChange={(event) => setFilter('location', event.target.value)}
                className="input text-sm"
              >
                <option value="">Any location</option>
                {filterOptions?.locations?.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            {/* Organisation */}
            <div className="px-4 py-3">
              <label
                htmlFor="filter-organization"
                className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Organisation
              </label>
              <select
                id="filter-organization"
                value={filters.organization}
                onChange={(event) => setFilter('organization', event.target.value)}
                className="input text-sm"
              >
                <option value="">Any organisation</option>
                {filterOptions?.organizations?.map((organization) => (
                  <option key={organization} value={organization}>
                    {organization}
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline */}
            <div className="px-4 py-3">
              <label
                htmlFor="filter-deadline"
                className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Deadline
              </label>
              <select
                id="filter-deadline"
                value={filters.deadlineDays}
                onChange={(event) => setFilter('deadlineDays', event.target.value)}
                className="input text-sm"
              >
                {DEADLINE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------ results */}
        <section className="lg:col-span-3">
          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {selectedSkills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className="badge bg-primary-50 text-primary-700 hover:bg-primary-100"
                >
                  {skill}
                  <X className="h-3 w-3" />
                </button>
              ))}
              {['category', 'mode', 'location', 'organization'].map((key) =>
                filters[key] ? (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key, '')}
                    className="badge bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    {filters[key]}
                    <X className="h-3 w-3" />
                  </button>
                ) : null
              )}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {loading
              ? 'Searching...'
              : `${pagination.total} opportunit${pagination.total === 1 ? 'y' : 'ies'} found`}
          </p>
          <p className="text-xs font-medium text-emerald-600">
            Balanced across live sources
          </p>
          </div>

          {loading ? (
            <SkeletonGrid count={6} />
          ) : opportunities.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No opportunities match those filters"
              description="Try removing a filter or searching for something broader."
              action={
                <button type="button" onClick={clearAll} className="btn-primary">
                  Clear all filters
                </button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {opportunities.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    onToggleSave={toggleSave}
                    saving={savingIds.has(opportunity.id)}
                  />
                ))}
              </div>

              <div className="mt-8">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onChange={(page) => {
                    setFilter('page', String(page));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
