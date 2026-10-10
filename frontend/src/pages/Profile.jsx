/**
 * Profile page: view and edit everything the recommendation engine uses,
 * plus the profile strength meter with suggestions.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  User,
  Pencil,
  Check,
  X,
  School,
  MapPin,
  Target,
  Briefcase,
  TrendingUp,
  Lightbulb,
  FileText,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';
import TagInput from '../components/TagInput';
import { Avatar, Spinner, PageLoader } from '../components/ui';
import { metaApi, profileApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  DEGREES,
  BRANCHES,
  YEARS,
  INDIAN_STATES,
  INDIAN_UNION_TERRITORIES,
  WORK_MODE_PREFERENCES,
  CAREER_GOALS,
  POPULAR_SKILLS,
  POPULAR_INTERESTS,
} from '../utils/constants';
import { formatDate } from '../utils/format';

export default function Profile() {
  const { updateProfile } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [form, setForm] = useState(null);

  const [skillOptions, setSkillOptions] = useState(POPULAR_SKILLS);
  const [interestOptions, setInterestOptions] = useState(POPULAR_INTERESTS);
  const [categories, setCategories] = useState([]);

  /** Copies the loaded profile into the editable form shape. */
  const toForm = (data) => ({
    name: data.name || '',
    college: data.college || '',
    degree: data.degree || '',
    branch: data.branch || '',
    year: data.year || '',
    city: data.city || '',
    state: data.state || '',
    phone: data.phone || '',
    bio: data.bio || '',
    careerGoal: data.careerGoal || '',
    preferredMode: data.preferredMode || 'Any',
    preferredLocation: data.preferredLocation || '',
    skills: data.skills.map((item) => item.name),
    interests: data.interests.map((item) => item.name),
    preferredCategories: data.preferredCategories.map((item) => item.id),
  });

  const load = useCallback(async () => {
    try {
      const data = await profileApi.get();
      setProfile(data);
      setForm(toForm(data));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([metaApi.skills(), metaApi.interests(), metaApi.categories()])
      .then(([skills, interests, categoryList]) => {
        setSkillOptions(skills.map((item) => item.name));
        setInterestOptions(interests.map((item) => item.name));
        setCategories(categoryList);
      })
      .catch(() => {
        /* built-in fallback lists are fine */
      });
  }, []);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleCategory = (categoryId) =>
    setForm((current) => ({
      ...current,
      preferredCategories: current.preferredCategories.includes(categoryId)
        ? current.preferredCategories.filter((id) => id !== categoryId)
        : [...current.preferredCategories, categoryId],
    }));

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await profileApi.update({
        ...form,
        year: form.year ? Number(form.year) : null,
        college: form.college.trim() || null,
        city: form.city.trim() || null,
        state: form.state,
        phone: form.phone.trim(),
        bio: form.bio.trim() || null,
        preferredLocation: form.preferredLocation.trim() || null,
        careerGoal: form.careerGoal || null,
      });
      setProfile(saved);
      setForm(toForm(saved));
      updateProfile(saved);
      setEditing(false);
      toast.success('Profile updated. Your recommendations will refresh.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setForm(toForm(profile));
    setEditing(false);
  };

  const onResumeSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'].includes(extension) || file.size > 4 * 1024 * 1024) {
      toast.error('Choose a PDF, DOCX, PNG, JPG or WebP file up to 4 MB.');
      return;
    }
    setResumeBusy(true);
    try {
      const result = await profileApi.uploadResume(file);
      setProfile((current) => ({ ...current, hasResume: true, resumeOriginalName: result.resumeOriginalName }));
      toast.success('Resume uploaded privately.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResumeBusy(false);
    }
  };

  const onResumeDownload = async () => {
    setResumeBusy(true);
    try {
      const blob = await profileApi.downloadResume();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = profile.resumeOriginalName || 'resume';
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResumeBusy(false);
    }
  };

  const onResumeDelete = async () => {
    setResumeBusy(true);
    try {
      await profileApi.deleteResume();
      setProfile((current) => ({ ...current, hasResume: false, resumeOriginalName: null }));
      toast.success('Resume removed from your profile.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResumeBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading your profile..." />;
  if (!profile) return null;

  const completion = profile.completion?.percentage ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <User className="h-6 w-6 text-primary-600" />
          My profile
        </h1>

        {editing ? (
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary" disabled={saving}>
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button type="button" onClick={onSave} className="btn-primary" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="btn-primary">
            <Pencil className="h-4 w-4" />
            Edit profile
          </button>
        )}
      </div>

      {/* ---------------------------------------------- identity + strength */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <Avatar name={profile.name} src={profile.avatarUrl} size="lg" />

            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  className="input text-lg font-semibold"
                  aria-label="Full name"
                />
              ) : (
                <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              )}
              <p className="mt-1 text-sm text-slate-500">{profile.email}</p>
              {editing ? (
                <label className="mt-3 block max-w-sm text-xs font-medium text-slate-500" htmlFor="profile-phone">
                  Phone number (optional; not verified)
                  <input id="profile-phone" type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+91 98765 43210" className="input mt-1 text-sm" />
                </label>
              ) : profile.phone ? (
                <p className="mt-1 text-sm text-slate-500">{profile.phone} <span className="text-xs text-amber-600">· Not verified</span></p>
              ) : null}
              <p className="mt-0.5 text-xs text-slate-400">
                Member since {formatDate(profile.joinedAt)}
              </p>
            </div>
          </div>

          {editing ? (
            <textarea
              rows={3}
              value={form.bio}
              onChange={(event) => set('bio', event.target.value)}
              placeholder="A short bio helps the recommendation engine understand you."
              className="input mt-4 resize-none"
            />
          ) : (
            profile.bio && <p className="mt-4 text-sm leading-relaxed text-slate-600">{profile.bio}</p>
          )}
        </div>

        {/* profile strength */}
        <div className="card p-6">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4.5 w-4.5 text-primary-600" />
            <h2 className="text-sm font-semibold text-slate-900">Profile strength</h2>
          </div>

          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{completion}%</p>
            <p className="mb-1 text-xs text-slate-500">
              {completion === 100 ? 'Complete' : 'Keep going'}
            </p>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                completion >= 80 ? 'bg-emerald-500' : completion >= 50 ? 'bg-primary-600' : 'bg-amber-500'
              }`}
              style={{ width: `${completion}%` }}
            />
          </div>

          {profile.completion?.suggestions?.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                To improve your matches
              </p>
              <ul className="space-y-1.5">
                {profile.completion.suggestions.slice(0, 3).map((suggestion) => (
                  <li key={suggestion} className="text-xs leading-relaxed text-slate-500">
                    &bull; {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><FileText className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Resume</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{profile.hasResume ? profile.resumeOriginalName : 'No resume uploaded'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`btn-secondary btn-sm cursor-pointer ${resumeBusy ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload className="h-4 w-4" />{resumeBusy ? 'Working...' : profile.hasResume ? 'Replace' : 'Upload'}
            <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={onResumeSelect} disabled={resumeBusy} />
          </label>
          {profile.hasResume && <>
            <button type="button" onClick={onResumeDownload} disabled={resumeBusy} className="btn-secondary btn-sm" aria-label="Download resume"><Download className="h-4 w-4" />Download</button>
            <button type="button" onClick={onResumeDelete} disabled={resumeBusy} className="btn-secondary btn-sm text-red-600" aria-label="Remove resume"><Trash2 className="h-4 w-4" />Remove</button>
          </>}
        </div>
      </section>

      {/* ------------------------------------------------------- education */}
      <section className="card p-6">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <School className="h-5 w-5 text-slate-400" />
          Education
        </h2>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="p-college" className="label">
                College
              </label>
              <input
                id="p-college"
                value={form.college}
                onChange={(event) => set('college', event.target.value)}
                className="input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="p-degree" className="label">
                  Degree
                </label>
                <select
                  id="p-degree"
                  value={form.degree}
                  onChange={(event) => set('degree', event.target.value)}
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
                <label htmlFor="p-branch" className="label">
                  Branch
                </label>
                <select
                  id="p-branch"
                  value={form.branch}
                  onChange={(event) => set('branch', event.target.value)}
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
                <label htmlFor="p-year" className="label">
                  Year
                </label>
                <select
                  id="p-year"
                  value={form.year}
                  onChange={(event) => set('year', event.target.value)}
                  className="input"
                >
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
              <label htmlFor="p-state" className="label">State / Union territory</label>
              <select id="p-state" autoComplete="address-level1" value={form.state} onChange={(event) => set('state', event.target.value)} className="input">
                <option value="">Select</option>
                <optgroup label="States">{INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</optgroup>
                <optgroup label="Union territories">{INDIAN_UNION_TERRITORIES.map((state) => <option key={state} value={state}>{state}</option>)}</optgroup>
              </select>
            </div>

            <div>
              <label htmlFor="p-city" className="label">
                City
              </label>
              <input
                id="p-city"
                value={form.city}
                onChange={(event) => set('city', event.target.value)}
                className="input"
              />
            </div>
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['College', profile.college],
              ['Degree', profile.degree],
              ['Branch', profile.branch],
              ['Year', profile.year ? `Year ${profile.year}` : null],
              ['City', profile.city],
              ['State / Union territory', profile.state],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">
                  {value || <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ---------------------------------------------- skills & interests */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-4">Skills</h2>
          {editing ? (
            <TagInput
              value={form.skills}
              onChange={(value) => set('skills', value)}
              suggestions={skillOptions}
              placeholder="Add a skill"
            />
          ) : profile.skills.length === 0 ? (
            <p className="text-sm text-slate-500">No skills added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span key={skill.id} className="badge bg-primary-50 text-primary-700">
                  {skill.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card p-6">
          <h2 className="section-title mb-4">Interests</h2>
          {editing ? (
            <TagInput
              value={form.interests}
              onChange={(value) => set('interests', value)}
              suggestions={interestOptions}
              placeholder="Add an interest"
            />
          ) : profile.interests.length === 0 ? (
            <p className="text-sm text-slate-500">No interests added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span key={interest.id} className="badge bg-emerald-50 text-emerald-700">
                  {interest.name}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------ preferences */}
      <section className="card p-6">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-slate-400" />
          Career goal and preferences
        </h2>

        {editing ? (
          <div className="space-y-5">
            <div>
              <p className="label">Career goal</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {CAREER_GOALS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => set('careerGoal', goal)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      form.careerGoal === goal
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label">Work mode</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WORK_MODE_PREFERENCES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set('preferredMode', mode)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      form.preferredMode === mode
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="p-location" className="label">
                Preferred location
              </label>
              <input
                id="p-location"
                value={form.preferredLocation}
                onChange={(event) => set('preferredLocation', event.target.value)}
                placeholder="City, or Remote"
                className="input"
              />
            </div>

            <div>
              <p className="label">Opportunity types you care about</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                      form.preferredCategories.includes(category.id)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Target className="h-3.5 w-3.5" /> Career goal
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">
                  {profile.careerGoal || <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Briefcase className="h-3.5 w-3.5" /> Work mode
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">
                  {profile.preferredMode}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Preferred location
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">
                  {profile.preferredLocation || profile.city || (
                    <span className="text-slate-400">Not set</span>
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-xs text-slate-500">Preferred opportunity types</p>
              {profile.preferredCategories.length === 0 ? (
                <p className="text-sm text-slate-400">None selected</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.preferredCategories.map((category) => (
                    <span key={category.id} className="badge bg-slate-100 text-slate-700">
                      {category.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
