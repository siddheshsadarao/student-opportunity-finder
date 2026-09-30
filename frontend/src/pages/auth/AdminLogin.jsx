/**
 * Administrator login.
 *
 * This is a separate screen from the student login, and the backend endpoint
 * (/auth/admin/login) refuses any account whose role is not 'admin'.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ShieldCheck, ArrowLeft } from 'lucide-react';
import { PasswordInput, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AdminLogin() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { adminLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const onChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.email || !form.password) {
      setError('Enter both your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await adminLogin(form);
      toast.success('Signed in to the admin panel.');
      navigate('/admin', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-5 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>

        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Administrator Login</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage opportunities, categories and analytics.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="label">
                Admin email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={onChange}
                  placeholder="Enter admin email"
                  autoComplete="email"
                  className="input pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="label">
                Password
              </label>
              <PasswordInput
                id="admin-password"
                name="password"
                value={form.password}
                onChange={onChange}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Student?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Use the student login
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
