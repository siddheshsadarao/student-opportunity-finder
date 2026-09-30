/**
 * Student settings: change password, account information and logout.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, KeyRound, LogOut, ShieldCheck, Info, Sun, Moon, Monitor } from 'lucide-react';
import { PasswordInput, Spinner, ConfirmDialog } from '../components/ui';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (!form.currentPassword) found.currentPassword = 'Enter your current password.';
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

    setSaving(true);
    try {
      await authApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully.');
    } catch (error) {
      const fieldErrors = {};
      error.fieldErrors?.forEach((item) => {
        fieldErrors[item.field] = item.message;
      });
      setErrors(fieldErrors);
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const onLogout = () => {
    logout();
    toast.success('You have been logged out.');
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Settings className="h-6 w-6 text-primary-600" />
        Settings
      </h1>

      {/* ---------------------------------------------------- account info */}
      <section className="card p-6">
        <h2 className="section-title mb-4">Account</h2>
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
            <dt className="text-sm text-slate-500">Account type</dt>
            <dd className="text-sm font-medium capitalize text-slate-900">{user?.role}</dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Your name and education details are edited on the Profile page.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">Appearance</h2>
        <p className="mb-4 text-sm text-slate-500">Choose how the platform looks on this device.</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Colour theme">
          {[
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
            ['system', 'System', Monitor],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              onClick={() => setPreference(value)}
              className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition ${
                preference === value
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- password form */}
      <section className="card p-6">
        <h2 className="section-title mb-1 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-400" />
          Change password
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Choose a password you do not use anywhere else.
        </p>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="current-password" className="label">
              Current password
            </label>
            <PasswordInput
              id="current-password"
              name="currentPassword"
              value={form.currentPassword}
              onChange={onChange}
              autoComplete="current-password"
              error={errors.currentPassword}
            />
            {errors.currentPassword && <p className="field-error">{errors.currentPassword}</p>}
          </div>

          <div>
            <label htmlFor="new-password-setting" className="label">
              New password
            </label>
            <PasswordInput
              id="new-password-setting"
              name="newPassword"
              value={form.newPassword}
              onChange={onChange}
              placeholder="Min. 8 characters, with a letter and a number"
              autoComplete="new-password"
              error={errors.newPassword}
            />
            {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
          </div>

          <div>
            <label htmlFor="confirm-password-setting" className="label">
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-password-setting"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={onChange}
              autoComplete="new-password"
              error={errors.confirmPassword}
            />
            {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {saving ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </section>

      {/* -------------------------------------------------------- logout */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Sign out</h2>
        <p className="mb-4 text-sm text-slate-500">
          You will need to log in again to see your recommendations.
        </p>
        <button type="button" onClick={() => setConfirmLogout(true)} className="btn-secondary">
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </section>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={onLogout}
        title="Log out?"
        message="You will be returned to the home page and will need to log in again."
        confirmLabel="Log out"
        danger={false}
      />
    </div>
  );
}
