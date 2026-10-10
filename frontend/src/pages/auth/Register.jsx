/**
 * Student registration.
 *
 * After a successful registration the user is taken straight to the
 * onboarding wizard, where they add skills, interests and preferences.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, School, MapPin, FileText, Phone } from 'lucide-react';
import AuthShell from './AuthShell';
import { PasswordInput, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { authApi, profileApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { DEGREES, BRANCHES, YEARS, INDIAN_STATES, INDIAN_UNION_TERRITORIES } from '../../utils/constants';

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
  state: '',
  phone: '',
};

export default function Register() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);

  const { register, verifyEmail } = useAuth();
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
    if (form.phone.trim() && !/^\+?[0-9 ()-]{7,24}$/.test(form.phone.trim())) found.phone = 'Enter a valid mobile number.';

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
      const result = await register({
        ...form,
        year: form.year ? Number(form.year) : undefined,
      });
      setVerificationStep(true);
      setVerificationSent(result.verificationSent);
      if (result.verificationSent) toast.success('Verification code sent to your email.');
      else toast.error('Your account is pending verification. We could not send the code. Please try again shortly.');
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

  const onVerify = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(verificationCode)) {
      toast.error('Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmail({ email: form.email, code: verificationCode });
      let resumeError = null;
      if (resumeFile) {
        try {
          await profileApi.uploadResume(resumeFile);
        } catch (error) {
          resumeError = error;
        }
      }
      toast.success('Email verified. Let us set up your profile.');
      if (resumeError) toast.error(`Resume upload failed: ${resumeError.message}. You can upload it later from Profile.`);
      navigate('/onboarding', { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setSubmitting(true);
    try {
      const result = await authApi.resendVerification({ email: form.email });
      setVerificationSent(Boolean(result.sent));
      if (result.sent) toast.success('A fresh code is on its way.');
      else toast.error(result.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={verificationStep ? 'Verify your email' : 'Create your account'}
      subtitle={verificationStep ? 'Confirm your email to continue.' : 'Find opportunities that match your skills and goals.'}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Log in
          </Link>
        </>
      }
    >
      {verificationStep ? (
        <form onSubmit={onVerify} className="space-y-4">
          <div className="rounded-lg bg-primary-50 p-4 text-sm text-primary-800">
            {verificationSent ? <>We sent a 6-digit code to <strong>{form.email}</strong>. It expires in 10 minutes. Check your spam folder too.</> : <>We could not send your verification code. Your account is pending verification. Please try resending shortly.</>}
          </div>
          <div>
            <label htmlFor="verification-code" className="label">Email verification code</label>
            <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" className="input text-center text-lg tracking-widest" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting || verificationCode.length !== 6}>{submitting ? 'Verifying...' : 'Verify email'}</button>
          <button type="button" onClick={onResend} className="btn-secondary w-full" disabled={submitting}>Resend code</button>
          <button type="button" onClick={() => setVerificationStep(false)} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">Back to registration</button>
        </form>
      ) : (
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

        <div>
          <label htmlFor="phone" className="label">Mobile number <span className="text-slate-400">(optional)</span></label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={24} value={form.phone} onChange={onChange} className={`input pl-9 ${errors.phone ? 'input-error' : ''}`} />
          </div>
          {errors.phone && <p className="field-error">{errors.phone}</p>}
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
              <label htmlFor="state" className="label">State / Union territory</label>
              <select id="state" name="state" autoComplete="address-level1" value={form.state} onChange={onChange} className="input">
                <option value="">Select</option>
                <optgroup label="States">{INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</optgroup>
                <optgroup label="Union territories">{INDIAN_UNION_TERRITORIES.map((state) => <option key={state} value={state}>{state}</option>)}</optgroup>
              </select>
              {errors.state && <p className="field-error">{errors.state}</p>}
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

        <div>
          <label htmlFor="registration-resume" className="label">Resume <span className="text-slate-400">(optional, PDF/DOCX/image up to 4 MB)</span></label>
          <div className="relative">
            <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="registration-resume" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" onChange={(event) => {
              const file = event.target.files?.[0] || null;
              if (file && (file.size > 4 * 1024 * 1024 || !/\.(pdf|docx|png|jpe?g|webp)$/i.test(file.name))) {
                toast.error('Choose a PDF, DOCX, PNG, JPG or WebP file up to 4 MB.');
                event.target.value = '';
                setResumeFile(null);
                return;
              }
              setResumeFile(file);
            }} className="input pl-9 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary-700" />
          </div>
          {resumeFile && <p className="mt-1 text-xs text-slate-500">Selected: {resumeFile.name}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      )}
    </AuthShell>
  );
}
