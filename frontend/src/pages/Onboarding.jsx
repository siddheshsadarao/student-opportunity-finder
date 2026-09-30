/**
 * The multi-step onboarding wizard.
 *
 * Seven steps: basic info, education, skills, interests, opportunity types,
 * work preferences and career goal. Everything is kept in one `form` object
 * and sent to the backend in a single request on the final step, so a student
 * can move back and forth without losing anything.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  GraduationCap,
  Code2,
  Heart,
  LayoutGrid,
  MapPin,
  Target,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from 'lucide-react';
import TagInput from '../components/TagInput';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { metaApi, profileApi } from '../services/api';
import {
  DEGREES,
  BRANCHES,
  YEARS,
  WORK_MODE_PREFERENCES,
  CAREER_GOALS,
  POPULAR_SKILLS,
  POPULAR_INTERESTS,
} from '../utils/constants';

const STEPS = [
  { id: 1, title: 'About you', icon: User },
  { id: 2, title: 'Education', icon: GraduationCap },
  { id: 3, title: 'Skills', icon: Code2 },
  { id: 4, title: 'Interests', icon: Heart },
  { id: 5, title: 'Opportunity types', icon: LayoutGrid },
  { id: 6, title: 'Work preferences', icon: MapPin },
  { id: 7, title: 'Career goal', icon: Target },
];

export default function Onboarding() {
  const { user, updateProfile, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [skillOptions, setSkillOptions] = useState(POPULAR_SKILLS);
  const [interestOptions, setInterestOptions] = useState(POPULAR_INTERESTS);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    name: '',
    college: '',
    degree: '',
    branch: '',
    year: '',
    city: '',
    bio: '',
    skills: [],
    interests: [],
    preferredCategories: [],
    preferredMode: 'Any',
    preferredLocation: '',
    careerGoal: '',
  });

  /**
   * Pre-fill from whatever registration already collected.
   *
   * We fetch the profile here rather than reading it from context, because
   * straight after registering the context only holds the user record --
   * the profile row exists in the database but has not been loaded yet.
   * Fetching makes this work whether the student just registered or came
   * back later to finish the wizard.
   */
  useEffect(() => {
    let active = true;

    (async () => {
      // Whatever happens, the name from the user record is a good default.
      setForm((current) => ({ ...current, name: current.name || user?.name || '' }));

      try {
        const saved = await profileApi.get();
        if (!active || !saved) return;

        setForm((current) => ({
          ...current,
          name: current.name || saved.name || '',
          college: current.college || saved.college || '',
          degree: current.degree || saved.degree || '',
          branch: current.branch || saved.branch || '',
          year: current.year || saved.year || '',
          city: current.city || saved.city || '',
          bio: current.bio || saved.bio || '',
          careerGoal: current.careerGoal || saved.careerGoal || '',
          preferredMode: saved.preferredMode || current.preferredMode,
          preferredLocation: current.preferredLocation || saved.preferredLocation || '',
          skills: current.skills.length ? current.skills : saved.skills.map((item) => item.name),
          interests: current.interests.length
            ? current.interests
            : saved.interests.map((item) => item.name),
          preferredCategories: current.preferredCategories.length
            ? current.preferredCategories
            : saved.preferredCategories.map((item) => item.id),
        }));
      } catch {
        // No profile yet is fine -- the wizard simply starts empty.
      }
    })();

    return () => {
      active = false;
    };
    // Runs once on mount; `user` only supplies the fallback name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the master lists so the tag inputs suggest existing values.
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [skills, interests, categoryList] = await Promise.all([
          metaApi.skills(),
          metaApi.interests(),
          metaApi.categories(),
        ]);
        if (!active) return;
        setSkillOptions(skills.map((item) => item.name));
        setInterestOptions(interests.map((item) => item.name));
        setCategories(categoryList);
      } catch {
        // Fall back to the built-in lists if the API is unreachable.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const toggleCategory = (categoryId) => {
    setForm((current) => ({
      ...current,
      preferredCategories: current.preferredCategories.includes(categoryId)
        ? current.preferredCategories.filter((id) => id !== categoryId)
        : [...current.preferredCategories, categoryId],
    }));
  };

  /** Per-step validation. Only a few fields are genuinely required. */
  const validateStep = () => {
    const found = {};

    if (step === 1 && form.name.trim().length < 2) {
      found.name = 'Please enter your name.';
    }
    if (step === 2) {
      if (!form.degree) found.degree = 'Choose your degree.';
      if (!form.branch) found.branch = 'Choose your branch.';
      if (!form.year) found.year = 'Choose your current year.';
    }
    if (step === 3 && form.skills.length < 1) {
      found.skills = 'Add at least one skill so we can match you.';
    }
    if (step === 4 && form.interests.length < 1) {
      found.interests = 'Pick at least one interest.';
    }
    if (step === 5 && form.preferredCategories.length < 1) {
      found.preferredCategories = 'Choose at least one opportunity type.';
    }

    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < STEPS.length) setStep(step + 1);
  };

  const back = () => {
    setErrors({});
    if (step > 1) setStep(step - 1);
  };

  const onSubmit = async () => {
    if (!validateStep()) return;

    setSubmitting(true);
    try {
      const saved = await profileApi.completeOnboarding({
        name: form.name.trim(),
        college: form.college.trim() || null,
        degree: form.degree || null,
        branch: form.branch || null,
        year: form.year ? Number(form.year) : null,
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        careerGoal: form.careerGoal || null,
        preferredMode: form.preferredMode,
        preferredLocation: form.preferredLocation.trim() || null,
        skills: form.skills,
        interests: form.interests,
        preferredCategories: form.preferredCategories,
      });

      // The profile is saved at this point. Everything below is presentation,
      // so nothing here is allowed to report failure.
      updateProfile(saved);

      // `refresh()` re-reads /auth/me. updateProfile already applied the saved
      // profile and set onboardingDone, so this call adds nothing — it used to
      // sit in the same try block, which meant one hiccup on that request made
      // the whole step report "something went wrong" even though the profile
      // had been stored. The student would retry and it would work, so the
      // failure looked random. Best-effort now: if it fails, carry on.
      try {
        await refresh();
      } catch {
        // Ignored on purpose. The context already has the saved profile.
      }

      toast.success('Profile complete. Here are your matches!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = useMemo(() => Math.round((step / STEPS.length) * 100), [step]);
  const CurrentIcon = STEPS[step - 1].icon;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-3xl">
        {/* ------------------------------------------------------- header */}
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600">
            <Sparkles className="h-5.5 w-5.5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Let us personalise your feed</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Step {step} of {STEPS.length} &middot; {STEPS[step - 1].title}
          </p>
        </div>

        {/* ----------------------------------------------------- progress */}
        <div className="mb-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step dots (hidden on very small screens to avoid crowding) */}
          <div className="mt-3 hidden justify-between sm:flex">
            {STEPS.map((item) => {
              const StepIcon = item.icon;
              const isDone = item.id < step;
              const isCurrent = item.id === step;
              return (
                <button
                  key={item.id}
                  type="button"
                  // Going back is allowed; skipping ahead is not.
                  onClick={() => item.id < step && setStep(item.id)}
                  disabled={item.id > step}
                  title={item.title}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                    isDone
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : isCurrent
                        ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-600'
                        : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* --------------------------------------------------------- card */}
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
              <CurrentIcon className="h-5 w-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{STEPS[step - 1].title}</h2>
          </div>

          {/* ---------------------------------------------- Step 1: basic */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="ob-name" className="label">
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  id="ob-name"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Your full name"
                  className={`input ${errors.name ? 'input-error' : ''}`}
                />
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="ob-city" className="label">
                  Which city are you based in?
                </label>
                <input
                  id="ob-city"
                  value={form.city}
                  onChange={(event) => set('city', event.target.value)}
                  placeholder="Your city"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="ob-bio" className="label">
                  Short bio <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="ob-bio"
                  rows={3}
                  value={form.bio}
                  onChange={(event) => set('bio', event.target.value)}
                  placeholder="A line or two about what you are studying and what interests you."
                  className="input resize-none"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  This text is also used by the recommendation engine.
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------------------ Step 2: education */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="ob-college" className="label">
                  College
                </label>
                <input
                  id="ob-college"
                  value={form.college}
                  onChange={(event) => set('college', event.target.value)}
                  placeholder="Your college name"
                  className="input"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="ob-degree" className="label">
                    Degree <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="ob-degree"
                    value={form.degree}
                    onChange={(event) => set('degree', event.target.value)}
                    className={`input ${errors.degree ? 'input-error' : ''}`}
                  >
                    <option value="">Select</option>
                    {DEGREES.map((degree) => (
                      <option key={degree} value={degree}>
                        {degree}
                      </option>
                    ))}
                  </select>
                  {errors.degree && <p className="field-error">{errors.degree}</p>}
                </div>

                <div>
                  <label htmlFor="ob-branch" className="label">
                    Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="ob-branch"
                    value={form.branch}
                    onChange={(event) => set('branch', event.target.value)}
                    className={`input ${errors.branch ? 'input-error' : ''}`}
                  >
                    <option value="">Select</option>
                    {BRANCHES.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                  {errors.branch && <p className="field-error">{errors.branch}</p>}
                </div>

                <div>
                  <label htmlFor="ob-year" className="label">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="ob-year"
                    value={form.year}
                    onChange={(event) => set('year', event.target.value)}
                    className={`input ${errors.year ? 'input-error' : ''}`}
                  >
                    <option value="">Select</option>
                    {YEARS.map((year) => (
                      <option key={year.value} value={year.value}>
                        {year.label}
                      </option>
                    ))}
                  </select>
                  {errors.year && <p className="field-error">{errors.year}</p>}
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------- Step 3: skills */}
          {step === 3 && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                Add the skills you already have. These carry the most weight in your
                recommendations, so add at least three if you can.
              </p>
              <TagInput
                value={form.skills}
                onChange={(value) => set('skills', value)}
                suggestions={skillOptions}
                placeholder="Search skills, e.g. Python"
              />
              {errors.skills && <p className="field-error">{errors.skills}</p>}
              <p className="mt-3 text-xs text-slate-400">{form.skills.length} skill(s) added</p>
            </div>
          )}

          {/* ------------------------------------------ Step 4: interests */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                What areas do you want to work in? This helps us match opportunities even when the
                exact skill words differ.
              </p>
              <TagInput
                value={form.interests}
                onChange={(value) => set('interests', value)}
                suggestions={interestOptions}
                placeholder="Search interests, e.g. Data Science"
              />
              {errors.interests && <p className="field-error">{errors.interests}</p>}
            </div>
          )}

          {/* ------------------------------- Step 5: opportunity types */}
          {step === 5 && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                Which kinds of opportunities should we show you? Pick as many as you like.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {categories.map((category) => {
                  const selected = form.preferredCategories.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      aria-pressed={selected}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                          selected ? 'border-primary-600 bg-primary-600' : 'border-slate-300'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">
                          {category.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {category.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.preferredCategories && (
                <p className="field-error">{errors.preferredCategories}</p>
              )}
            </div>
          )}

          {/* ------------------------------------- Step 6: work / location */}
          {step === 6 && (
            <div className="space-y-5">
              <div>
                <p className="label">How do you want to work?</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {WORK_MODE_PREFERENCES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set('preferredMode', mode)}
                      aria-pressed={form.preferredMode === mode}
                      className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                        form.preferredMode === mode
                          ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="ob-location" className="label">
                  Preferred location <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="ob-location"
                  value={form.preferredLocation}
                  onChange={(event) => set('preferredLocation', event.target.value)}
                  placeholder="City, or Remote"
                  className="input"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Leave this blank and we will use your city ({form.city || 'not set'}).
                </p>
              </div>
            </div>
          )}

          {/* ---------------------------------------- Step 7: career goal */}
          {step === 7 && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                What role are you aiming for? We use this to prioritise opportunities that move you
                towards it.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CAREER_GOALS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => set('careerGoal', goal)}
                    aria-pressed={form.careerGoal === goal}
                    className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                      form.careerGoal === goal
                        ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3">
                <p className="text-sm text-primary-800">
                  <strong>You are all set.</strong> Finish to generate your personalised feed.
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------------------------- navigation */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={back}
              disabled={step === 1}
              className="btn-secondary disabled:invisible"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step < STEPS.length ? (
              <button type="button" onClick={next} className="btn-primary">
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Saving...' : 'Finish setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
