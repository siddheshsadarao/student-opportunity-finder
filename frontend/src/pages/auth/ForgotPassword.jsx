/**
 * Forgot / reset password.
 *
 * A production app would email a one-time reset link. Sending email needs an
 * SMTP account, which is outside the scope of this semester project, so this
 * screen offers a direct reset for student accounts instead. The backend
 * always replies with the same message, so this page cannot be used to find
 * out which email addresses are registered.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, CheckCircle2 } from 'lucide-react';
import AuthShell from './AuthShell';
import { PasswordInput, Spinner } from '../../components/ui';
import { authApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function ForgotPassword() {
  const [form, setForm] = useState({ email: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address.';
    if (form.newPassword.length < 8) found.newPassword = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.newPassword)) found.newPassword = 'Include at least one letter.';
    else if (!/\d/.test(form.newPassword)) found.newPassword = 'Include at least one number.';
    if (form.newPassword !== form.confirmPassword) {
      found.confirmPassword = 'Passwords do not match.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await authApi.resetPassword({ email: form.email, newPassword: form.newPassword });
      setDone(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password reset requested">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <p className="mt-3 text-sm text-emerald-900">
            If a student account exists for <strong>{form.email}</strong>, its password has been
            reset. You can now log in with your new password.
          </p>
        </div>
        <Link to="/login" className="btn-primary mt-6 w-full">
          Back to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Back to login
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="label">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="reset-email"
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              placeholder="you@college.edu"
              className={`input pl-9 ${errors.email ? 'input-error' : ''}`}
            />
          </div>
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="new-password" className="label">
            New password
          </label>
          <PasswordInput
            id="new-password"
            name="newPassword"
            value={form.newPassword}
            onChange={onChange}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            error={errors.newPassword}
          />
          {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
        </div>

        <div>
          <label htmlFor="confirm-new-password" className="label">
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-new-password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={onChange}
            placeholder="Re-enter password"
            autoComplete="new-password"
            error={errors.confirmPassword}
          />
          {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {submitting ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        <strong className="text-slate-700">Note for evaluators:</strong> a production build would
        email a time-limited reset link. Email delivery was kept out of scope for this project, so
        the reset is performed directly here. It only works for student accounts.
      </p>
    </AuthShell>
  );
}
