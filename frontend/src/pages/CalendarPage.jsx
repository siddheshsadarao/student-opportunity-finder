/**
 * Deadline calendar.
 *
 * A real month grid built with plain JavaScript dates (no calendar library).
 * Deadlines are colour-coded by category and clicking one opens the
 * opportunity. Lists of "this week" and "this month" sit beside the grid.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import { EmptyState, SkeletonRows } from '../components/ui';
import { opportunityApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { formatDate, deadlineLabel, deadlineTone, daysUntil } from '../utils/format';
import { getCategoryColor } from '../utils/constants';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09-17" for a Date, in local time (not UTC, which can shift a day). */
function toKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CalendarPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlySaved, setOnlySaved] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await opportunityApi.calendar({
        onlySaved: onlySaved ? 'true' : undefined,
      });
      setOpportunities(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [onlySaved, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Group opportunities by their deadline date, for quick lookup per cell. */
  const byDate = useMemo(() => {
    const map = new Map();
    opportunities.forEach((item) => {
      const key = String(item.deadline).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [opportunities]);

  /**
   * Builds the 6x7 grid of days for the visible month, including the trailing
   * days of the previous month and leading days of the next, so the grid is
   * always rectangular.
   */
  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    // getDay() is 0 for Sunday; we start weeks on Monday.
    const offset = (firstOfMonth.getDay() + 6) % 7;

    const start = new Date(year, month, 1 - offset);
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      cells.push({
        date,
        key: toKey(date),
        inMonth: date.getMonth() === month,
      });
    }
    return cells;
  }, [cursor]);

  const todayKey = toKey(new Date());

  const thisWeek = useMemo(
    () =>
      opportunities.filter((item) => {
        const days_ = daysUntil(item.deadline);
        return days_ !== null && days_ >= 0 && days_ <= 7;
      }),
    [opportunities]
  );

  const thisMonth = useMemo(
    () =>
      opportunities.filter((item) => {
        const days_ = daysUntil(item.deadline);
        return days_ !== null && days_ > 7 && days_ <= 30;
      }),
    [opportunities]
  );

  const changeMonth = (delta) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CalendarDays className="h-6 w-6 text-primary-600" />
            Deadline calendar
          </h1>
          <p className="mt-1 text-slate-500">
            Every open deadline, colour-coded by opportunity type.
          </p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={onlySaved}
            onChange={(event) => setOnlySaved(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          Only my saved
        </label>
      </div>

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* -------------------------------------------------- month grid */}
          <div className="card p-4 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="pb-2 text-center text-xs font-semibold uppercase text-slate-400"
                >
                  {weekday}
                </div>
              ))}

              {days.map(({ date, key, inMonth }) => {
                const items = byDate.get(key) || [];
                const isToday = key === todayKey;

                return (
                  <div
                    key={key}
                    className={`min-h-[76px] rounded-lg border p-1.5 transition ${
                      inMonth ? 'border-slate-100 bg-white' : 'border-transparent bg-slate-50/60'
                    } ${isToday ? 'border-primary-400 ring-1 ring-primary-400' : ''}`}
                  >
                    <p
                      className={`mb-1 text-xs font-medium ${
                        isToday
                          ? 'text-primary-700'
                          : inMonth
                            ? 'text-slate-600'
                            : 'text-slate-300'
                      }`}
                    >
                      {date.getDate()}
                    </p>

                    <div className="space-y-1">
                      {items.slice(0, 2).map((item) => {
                        const colors = getCategoryColor(item.category?.color);
                        return (
                          <Link
                            key={item.id}
                            to={`/opportunities/${item.id}`}
                            title={`${item.title} - ${item.organization}`}
                            className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight transition hover:opacity-80 ${colors.bg} ${colors.text}`}
                          >
                            {item.title}
                          </Link>
                        );
                      })}
                      {items.length > 2 && (
                        <p className="px-1.5 text-[10px] text-slate-400">
                          +{items.length - 2} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* colour legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
              {[...new Map(opportunities.map((item) => [item.category?.slug, item.category])).values()]
                .filter(Boolean)
                .map((category) => {
                  const colors = getCategoryColor(category.color);
                  return (
                    <span key={category.slug} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                      {category.name}
                    </span>
                  );
                })}
            </div>
          </div>

          {/* ------------------------------------------------ side lists */}
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Upcoming this week
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {thisWeek.length}
                </span>
              </h2>

              {thisWeek.length === 0 ? (
                <p className="card px-4 py-6 text-center text-sm text-slate-500">
                  Nothing closing in the next 7 days.
                </p>
              ) : (
                <div className="card divide-y divide-slate-100">
                  {thisWeek.map((item) => (
                    <Link
                      key={item.id}
                      to={`/opportunities/${item.id}`}
                      className="block p-3.5 transition hover:bg-slate-50"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.organization}</p>
                      <p className={`mt-1 text-xs font-medium ${deadlineTone(item.deadline)}`}>
                        {deadlineLabel(item.deadline)} &middot; {formatDate(item.deadline)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Later this month
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {thisMonth.length}
                </span>
              </h2>

              {thisMonth.length === 0 ? (
                <p className="card px-4 py-6 text-center text-sm text-slate-500">
                  Nothing else in the next 30 days.
                </p>
              ) : (
                <div className="card divide-y divide-slate-100">
                  {thisMonth.slice(0, 6).map((item) => (
                    <Link
                      key={item.id}
                      to={`/opportunities/${item.id}`}
                      className="block p-3.5 transition hover:bg-slate-50"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(item.deadline)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {!loading && opportunities.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={onlySaved ? 'No saved deadlines' : 'No deadlines to show'}
          description={
            onlySaved
              ? 'Save a few opportunities and their deadlines will appear on this calendar.'
              : 'There are no open opportunities at the moment.'
          }
          action={
            <Link to="/discover" className="btn-primary">
              <Compass className="h-4 w-4" />
              Browse opportunities
            </Link>
          }
        />
      )}
    </div>
  );
}
