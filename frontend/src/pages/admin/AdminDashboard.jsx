/**
 * Admin dashboard: the four headline numbers, a category chart and the
 * most-viewed / most-saved lists.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle2,
  Users,
  ClipboardList,
  PlusCircle,
  Eye,
  Bookmark,
  Activity,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { SkeletonStats, SkeletonRows } from '../../components/ui';
import { adminApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value ?? 0}</p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
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
        <div className="skeleton h-7 w-48" />
        <SkeletonStats />
        <SkeletonRows count={3} />
      </div>
    );
  }

  if (!data) return null;

  const { totals, opportunitiesByCategory, mostViewed, mostSaved, recommendationService } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-slate-500">An overview of the platform.</p>
        </div>
        <Link to="/admin/opportunities/new" className="btn-primary shrink-0">
          <PlusCircle className="h-4 w-4" />
          Add opportunity
        </Link>
      </div>

      {/* ---------------------------------------------------- stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Briefcase}
          label="Total opportunities"
          value={totals.total_opportunities}
          tone="bg-primary-50 text-primary-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Active opportunities"
          value={totals.active_opportunities}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={Users}
          label="Registered students"
          value={totals.total_students}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={ClipboardList}
          label="Total applications"
          value={totals.total_applications}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {/* --------------------------------------- service health indicator */}
      <div className="card flex items-center gap-3 p-4">
        <Activity
          className={`h-5 w-5 ${recommendationService?.online ? 'text-emerald-600' : 'text-red-500'}`}
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Recommendation service</p>
          <p className="text-xs text-slate-500">
            {recommendationService?.online
              ? `Online -- ${recommendationService.algorithm}`
              : 'Offline. The backend is using its built-in backup scorer.'}
          </p>
        </div>
        <span
          className={`badge ${
            recommendationService?.online
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {recommendationService?.online ? 'Healthy' : 'Down'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------- opportunities by category */}
        <section className="card p-6">
          <h2 className="section-title mb-4">Opportunities by category</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={opportunitiesByCategory} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 12, fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                }}
              />
              <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Opportunities" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* -------------------------------------------- engagement lists */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="section-title mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-slate-400" />
              Most viewed
            </h2>
            <ol className="space-y-3">
              {mostViewed.slice(0, 5).map((item, index) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <Link
                    to={`/opportunities/${item.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-primary-700"
                  >
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {item.value} views
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-6">
            <h2 className="section-title mb-4 flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-slate-400" />
              Most saved
            </h2>
            <ol className="space-y-3">
              {mostSaved.slice(0, 5).map((item, index) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <Link
                    to={`/opportunities/${item.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-primary-700"
                  >
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {item.value} saves
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Link
        to="/admin/analytics"
        className="card flex items-center justify-between p-5 transition hover:border-primary-300"
      >
        <div>
          <p className="font-medium text-slate-900">Full analytics</p>
          <p className="text-sm text-slate-500">
            User growth, application pipeline and engagement charts.
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </Link>
    </div>
  );
}
