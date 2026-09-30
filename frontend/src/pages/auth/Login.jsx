/**
 * Student login page.
 */
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, ShieldCheck } from 'lucide-react';
import AuthShell from './AuthShell';
import { PasswordInput, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // Clear the error for a field as soon as the user edits it.
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Client-side checks so obvious mistakes never reach the server. */
  const validate = () => {
    const found = {};
    if (!form.email.trim()) found.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address.';
    if (!form.password) found.password = 'Password is required.';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const data = await login(form);
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}!`);

      // Send them where they were heading, or to the right home page.
      const destination =
        location.state?.from || (data.onboardingDone ? '/dashboard' : '/onboarding');
      navigate(destination, { replace: true });
    } catch (error) {
      // Field-level errors from express-validator, if any.
      const fieldErrors = {};
      error.fieldErrors?.forEach((item) => {
        fieldErrors[item.field] = item.message;
      });
      setErrors(fieldErrors);
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to see the opportunities matched to your profile."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={onChange}
              placeholder="you@college.edu"
              className={`input pl-9 ${errors.email ? 'input-error' : ''}`}
            />
          </div>
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="label mb-0">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={onChange}
            placeholder="Enter your password"
            error={errors.password}
          />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? 'Logging in...' : 'Log in'}
        </button>

        <Link
          to="/admin/login"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Administrator login
        </Link>
      </form>

    </AuthShell>
  );
}
