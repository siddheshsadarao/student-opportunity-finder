/**
 * Platform analytics with Recharts:
 *   - opportunities per category (bar)
 *   - student growth over the last 6 months (line)
 *   - application pipeline (pie)
 *   - most viewed / most saved (bar)
 */
import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { SkeletonStats, EmptyState } from '../../components/ui';
import { adminApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

// A fixed palette so the same status always gets the same colour.
const PIE_COLORS = {
  'Planning to Apply': '#94a3b8',
  Applied: '#3b82f6',
  Shortlisted: '#f59e0b',
  Selected: '#10b981',
  Rejected: '#ef4444',
};

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 13,
};

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    adminApi
      .analytics()
      .then(setData)
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-7 w-40" />
        <SkeletonStats />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={BarChart3} title="No analytics available" />;
  }

  const {
    totals,
    opportunitiesByCategory,
    userGrowth,
    mostViewed,
    mostSaved,
    applicationStatuses,
  } = data;

  // Turn the running monthly counts into a cumulative total for the line chart.
  let running = 0;
  const growthData = userGrowth.map((point) => {
    running += point.students;
    return { month: point.month, newStudents: point.students, total: running };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <BarChart3 className="h-6 w-6 text-primary-600" />
          Analytics
        </h1>
        <p className="mt-1 text-slate-500">How the platform is being used.</p>
      </div>

      {/* --------------------------------------------------- headline row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total opportunities', totals.total_opportunities],
          ['Total views', totals.total_views],
          ['Total saves', totals.total_saves],
          ['Total applications', totals.total_applications],
        ].map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------ user growth (line) */}
        <section className="card p-6">
          <h2 className="section-title mb-1 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-slate-400" />
            Student growth
          </h2>
          <p className="mb-4 text-sm text-slate-500">Registrations over the last 6 months.</p>

          {growthData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Not enough data yet. Register a few students to see the trend.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total students"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="newStudents"
                  name="New that month"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* ------------------------------------- application pipeline (pie) */}
        <section className="card p-6">
          <h2 className="section-title mb-1">Application pipeline</h2>
          <p className="mb-4 text-sm text-slate-500">Where student applications stand.</p>

          {applicationStatuses.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              No applications tracked yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={applicationStatuses}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ status, count }) => `${status}: ${count}`}
                  labelLine={false}
                >
                  {applicationStatuses.map((entry) => (
                    <Cell key={entry.status} fill={PIE_COLORS[entry.status] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* ------------------------------------ opportunities by category */}
        <section className="card p-6">
          <h2 className="section-title mb-1">Opportunities by category</h2>
          <p className="mb-4 text-sm text-slate-500">How the catalogue is distributed.</p>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={opportunitiesByCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Opportunities" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* ---------------------------------------------- engagement bars */}
        <section className="card p-6">
          <h2 className="section-title mb-1">Most viewed opportunities</h2>
          <p className="mb-4 text-sm text-slate-500">The listings students open most.</p>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mostViewed} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="title"
                width={130}
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(value) =>
                  value.length > 22 ? `${value.slice(0, 22)}...` : value
                }
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Views" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* ------------------------------------------------- most saved list */}
      <section className="card p-6">
        <h2 className="section-title mb-4">Most saved opportunities</h2>
        <div className="space-y-3">
          {mostSaved.map((item, index) => {
            const max = mostSaved[0]?.value || 1;
            const width = Math.round((item.value / max) * 100);

            return (
              <div key={item.id} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="truncate text-xs text-slate-500">{item.organization}</p>
                </div>
                <div className="hidden w-40 sm:block">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-sm font-semibold text-slate-700">
                  {item.value}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
