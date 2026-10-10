/**
 * Forgot / reset password.
 *
 * A short-lived email OTP proves ownership before a password can be changed.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, CheckCircle2, Send } from 'lucide-react';
import AuthShell from './AuthShell';
import { PasswordInput, Spinner } from '../../components/ui';
import { authApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function ForgotPassword() {
  const [form, setForm] = useState({ email: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const toast = useToast();

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address.';
    if (codeRequested) {
      if (!/^\d{6}$/.test(form.code || '')) found.code = 'Enter the 6-digit code from your email.';
      if (form.newPassword.length < 8) found.newPassword = 'Use at least 8 characters.';
      else if (!/[A-Za-z]/.test(form.newPassword)) found.newPassword = 'Include at least one letter.';
      else if (!/\d/.test(form.newPassword)) found.newPassword = 'Include at least one number.';
      if (form.newPassword !== form.confirmPassword) found.confirmPassword = 'Passwords do not match.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (!codeRequested) {
        await authApi.forgotPassword({ email: form.email });
        setCodeRequested(true);
        toast.success('If the account is eligible, a reset code has been sent.');
      } else {
        await authApi.resetPassword({ email: form.email, code: form.code, newPassword: form.newPassword });
        setDone(true);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password reset complete">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <p className="mt-3 text-sm text-emerald-900">
            Your password has been reset for <strong>{form.email}</strong>. You can now log in with your new password.
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
      subtitle={codeRequested ? 'Enter the code from your email and choose a new password.' : 'We will send a one-time code to your email.'}
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

        {codeRequested && <div>
          <label htmlFor="reset-code" className="label">6-digit email code</label>
          <input id="reset-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code || ''} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} className={`input text-center tracking-widest ${errors.code ? 'input-error' : ''}`} placeholder="000000" />
          {errors.code && <p className="field-error">{errors.code}</p>}
        </div>}

        {codeRequested && <>
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
        </>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : codeRequested ? <KeyRound className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Please wait...' : codeRequested ? 'Reset password' : 'Send reset code'}
        </button>
        {codeRequested && <button type="button" onClick={async () => { try { await authApi.forgotPassword({ email: form.email }); toast.success('If the account is eligible, a fresh reset code has been sent.'); } catch (error) { toast.error(error.message); } }} className="w-full py-2 text-sm font-medium text-primary-600 hover:underline">Resend code</button>}
      </form>
    </AuthShell>
  );
}
