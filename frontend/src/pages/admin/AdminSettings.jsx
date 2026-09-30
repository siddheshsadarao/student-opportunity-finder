/**
 * Admin settings: change the admin password and see the status of the
 * three services that make up the platform.
 */
import { useEffect, useState } from 'react';
import { Settings, KeyRound, Server, Database, Brain, CheckCircle2, XCircle } from 'lucide-react';
import { PasswordInput, Spinner } from '../../components/ui';
import { adminApi, authApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function ServiceRow({ icon: Icon, name, detail, online }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Icon className="h-4.5 w-4.5 text-slate-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      {online ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Online
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-red-600">
          <XCircle className="h-4 w-4" />
          Offline
        </span>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    adminApi
      .analytics()
      .then((data) => setHealth(data.recommendationService))
      .catch(() => setHealth({ online: false }));
  }, []);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    const found = {};
    if (!form.currentPassword) found.currentPassword = 'Enter your current password.';
    if (form.newPassword.length < 8) found.newPassword = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.newPassword)) found.newPassword = 'Include at least one letter.';
    else if (!/\d/.test(form.newPassword)) found.newPassword = 'Include at least one number.';
    if (form.newPassword !== form.confirmPassword) {
      found.confirmPassword = 'Passwords do not match.';
    }

    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await authApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Admin password changed.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Settings className="h-6 w-6 text-primary-600" />
        Settings
      </h1>

      {/* ------------------------------------------------- service health */}
      <section className="card p-6">
        <h2 className="section-title mb-1">System status</h2>
        <p className="mb-2 text-sm text-slate-500">
          The three services that make up this platform.
        </p>

        <div className="divide-y divide-slate-100">
          <ServiceRow
            icon={Server}
            name="Express API"
            detail="Node.js backend on port 5000"
            online
          />
          <ServiceRow
            icon={Database}
            name="PostgreSQL"
            detail="If the API is answering, the database is connected"
            online
          />
          <ServiceRow
            icon={Brain}
            name="Recommendation service"
            detail={
              health?.online
                ? `FastAPI on port 8000 -- ${health.algorithm}`
                : 'FastAPI on port 8000 -- start it with: uvicorn app.main:app --port 8000'
            }
            online={!!health?.online}
          />
        </div>

        {!health?.online && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
            While the Python service is offline the backend falls back to a simpler JavaScript
            scorer, so students still get recommendations &mdash; just without the TF-IDF model.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------- admin account */}
      <section className="card p-6">
        <h2 className="section-title mb-4">Admin account</h2>
        <dl className="space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Name</dt>
            <dd className="text-sm font-medium text-slate-900">{user?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Email</dt>
            <dd className="truncate text-sm font-medium text-slate-900">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="text-sm font-medium capitalize text-slate-900">{user?.role}</dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------- change password */}
      <section className="card p-6">
        <h2 className="section-title mb-1 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-400" />
          Change password
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Change the default demo password before showing this to anyone outside your team.
        </p>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="admin-current" className="label">
              Current password
            </label>
            <PasswordInput
              id="admin-current"
              name="currentPassword"
              value={form.currentPassword}
              onChange={onChange}
              autoComplete="current-password"
              error={errors.currentPassword}
            />
            {errors.currentPassword && <p className="field-error">{errors.currentPassword}</p>}
          </div>

          <div>
            <label htmlFor="admin-new" className="label">
              New password
            </label>
            <PasswordInput
              id="admin-new"
              name="newPassword"
              value={form.newPassword}
              onChange={onChange}
              autoComplete="new-password"
              error={errors.newPassword}
            />
            {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
          </div>

          <div>
            <label htmlFor="admin-confirm" className="label">
              Confirm new password
            </label>
            <PasswordInput
              id="admin-confirm"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={onChange}
              autoComplete="new-password"
              error={errors.confirmPassword}
            />
            {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </section>
    </div>
  );
}
