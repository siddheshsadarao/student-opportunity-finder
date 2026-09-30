/**
 * Student registration.
 *
 * After a successful registration the user is taken straight to the
 * onboarding wizard, where they add skills, interests and preferences.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, School, MapPin } from 'lucide-react';
import AuthShell from './AuthShell';
import { PasswordInput, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DEGREES, BRANCHES, YEARS } from '../../utils/constants';

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  college: '',
  degree: '',
  branch: '',
  year: '',
  city: '',
};

export default function Register() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /**
   * The same rules the backend enforces (middleware/validate.js). Checking
   * here too gives instant feedback; the server check is the one that counts.
   */
  const validate = () => {
    const found = {};

    if (form.name.trim().length < 2) found.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address.';

    if (form.password.length < 8) found.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password)) found.password = 'Include at least one letter.';
    else if (!/\d/.test(form.password)) found.password = 'Include at least one number.';

    if (form.password !== form.confirmPassword) {
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
      await register({
        ...form,
        year: form.year ? Number(form.year) : undefined,
      });
      toast.success('Account created. Let us set up your profile.');
      navigate('/onboarding', { replace: true });
    } catch (error) {
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
      title="Create your account"
      subtitle="It takes a minute. Then we will match you with opportunities."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="label">
            Full name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="name"
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Your full name"
              autoComplete="name"
              className={`input pl-9 ${errors.name ? 'input-error' : ''}`}
            />
          </div>
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="email" className="label">
            Email address <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              placeholder="you@college.edu"
              autoComplete="email"
              className={`input pl-9 ${errors.email ? 'input-error' : ''}`}
            />
          </div>
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className="label">
              Password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={onChange}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              error={errors.password}
            />
            {errors.password ? (
              <p className="field-error">{errors.password}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">
                At least 8 characters, with a letter and a number.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={onChange}
              placeholder="Re-enter password"
              autoComplete="new-password"
              error={errors.confirmPassword}
            />
            {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Education (optional &mdash; you can add this later)
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="college" className="label">
                College
              </label>
              <div className="relative">
                <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="college"
                  name="college"
                  value={form.college}
                  onChange={onChange}
                  placeholder="Your college name"
                  className="input pl-9"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="degree" className="label">
                  Degree
                </label>
                <select
                  id="degree"
                  name="degree"
                  value={form.degree}
                  onChange={onChange}
                  className="input"
                >
                  <option value="">Select</option>
                  {DEGREES.map((degree) => (
                    <option key={degree} value={degree}>
                      {degree}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="branch" className="label">
                  Branch
                </label>
                <select
                  id="branch"
                  name="branch"
                  value={form.branch}
                  onChange={onChange}
                  className="input"
                >
                  <option value="">Select</option>
                  {BRANCHES.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="year" className="label">
                  Year
                </label>
                <select id="year" name="year" value={form.year} onChange={onChange} className="input">
                  <option value="">Select</option>
                  {YEARS.map((year) => (
                    <option key={year.value} value={year.value}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="city" className="label">
                City
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="city"
                  name="city"
                  value={form.city}
                  onChange={onChange}
                  placeholder="Your city"
                  className="input pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
