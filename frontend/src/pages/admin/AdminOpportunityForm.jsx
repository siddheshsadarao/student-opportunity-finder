/**
 * Add / edit opportunity form.
 *
 * One component serves both: when the URL contains an :id we load that
 * opportunity and PUT the changes, otherwise we POST a new one.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Info } from 'lucide-react';
import TagInput from '../../components/TagInput';
import { Spinner, PageLoader } from '../../components/ui';
import { adminApi, metaApi, opportunityApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { WORK_MODES, POPULAR_SKILLS } from '../../utils/constants';

const EMPTY = {
  title: '',
  organization: '',
  organizationLogo: '',
  categoryId: '',
  description: '',
  eligibility: '',
  benefits: '',
  location: '',
  mode: 'Remote',
  duration: '',
  stipend: '',
  deadline: '',
  applicationUrl: '',
  source: '',
  skills: [],
  isDemo: false,
  isActive: true,
};

export default function AdminOpportunityForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [skillOptions, setSkillOptions] = useState(POPULAR_SKILLS);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    metaApi.categories().then(setCategories).catch(() => {});
    metaApi
      .skills()
      .then((list) => setSkillOptions(list.map((item) => item.name)))
      .catch(() => {});
  }, []);

  // Load the existing opportunity when editing.
  useEffect(() => {
    if (!isEdit) return;

    opportunityApi
      .get(id)
      .then((data) =>
        setForm({
          title: data.title || '',
          organization: data.organization || '',
          organizationLogo: data.organizationLogo || '',
          categoryId: data.category?.id || '',
          description: data.description || '',
          eligibility: data.eligibility || '',
          benefits: data.benefits || '',
          location: data.location || '',
          mode: data.mode || 'Remote',
          duration: data.duration || '',
          stipend: data.stipend || '',
          // <input type="date"> needs exactly YYYY-MM-DD.
          deadline: String(data.deadline || '').slice(0, 10),
          applicationUrl: data.applicationUrl || '',
          source: data.source || '',
          skills: data.skills || [],
          isDemo: data.isDemo ?? false,
          isActive: data.isActive ?? true,
        })
      )
      .catch((error) => {
        toast.error(error.message);
        navigate('/admin/opportunities');
      })
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate, toast]);

  const set = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  const validate = () => {
    const found = {};
    if (form.title.trim().length < 3) found.title = 'Enter a title of at least 3 characters.';
    if (form.organization.trim().length < 2) found.organization = 'Enter the organisation name.';
    if (!form.categoryId) found.categoryId = 'Choose a category.';
    if (form.description.trim().length < 20) {
      found.description = 'Write at least 20 characters so students know what this is.';
    }
    if (!form.deadline) found.deadline = 'Pick an application deadline.';
    if (!/^https?:\/\/.+/.test(form.applicationUrl.trim())) {
      found.applicationUrl = 'Enter a full link starting with https://';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, categoryId: Number(form.categoryId) };

      if (isEdit) {
        await adminApi.updateOpportunity(id, payload);
        toast.success('Opportunity updated.');
      } else {
        await adminApi.createOpportunity(payload);
        toast.success('Opportunity published. Matching students were notified.');
      }
      navigate('/admin/opportunities');
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

  if (loading) return <PageLoader label="Loading opportunity..." />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/admin/opportunities"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to opportunities
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isEdit ? 'Edit opportunity' : 'Add opportunity'}
        </h1>
        <p className="mt-1 text-slate-500">
          Students see this immediately, and anyone who follows this category is notified.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {/* -------------------------------------------------- basic info */}
        <section className="card space-y-4 p-6">
          <h2 className="section-title">Basic information</h2>

          <div>
            <label htmlFor="title" className="label">
              Opportunity title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="Machine Learning Engineering Internship"
              className={`input ${errors.title ? 'input-error' : ''}`}
            />
            {errors.title && <p className="field-error">{errors.title}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="organization" className="label">
                Organisation <span className="text-red-500">*</span>
              </label>
              <input
                id="organization"
                value={form.organization}
                onChange={(event) => set('organization', event.target.value)}
                placeholder="Nimbus AI Labs"
                className={`input ${errors.organization ? 'input-error' : ''}`}
              />
              {errors.organization && <p className="field-error">{errors.organization}</p>}
            </div>

            <div>
              <label htmlFor="categoryId" className="label">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="categoryId"
                value={form.categoryId}
                onChange={(event) => set('categoryId', event.target.value)}
                className={`input ${errors.categoryId ? 'input-error' : ''}`}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && <p className="field-error">{errors.categoryId}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="organizationLogo" className="label">
              Organisation logo URL <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="organizationLogo"
              value={form.organizationLogo}
              onChange={(event) => set('organizationLogo', event.target.value)}
              placeholder="https://example.com/logo.png"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="description" className="label">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="What the opportunity involves, what students will do and learn..."
              className={`input resize-y ${errors.description ? 'input-error' : ''}`}
            />
            {errors.description ? (
              <p className="field-error">{errors.description}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">
                This text is used by the recommendation engine, so include the important keywords.
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ requirements */}
        <section className="card space-y-4 p-6">
          <h2 className="section-title">Requirements and benefits</h2>

          <div>
            <label htmlFor="eligibility" className="label">
              Eligibility
            </label>
            <textarea
              id="eligibility"
              rows={2}
              value={form.eligibility}
              onChange={(event) => set('eligibility', event.target.value)}
              placeholder="3rd or final year students of B.Tech / B.E. in CS, IT or Data Science."
              className="input resize-y"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Mentioning the year (&ldquo;2nd year onwards&rdquo;) lets the engine check eligibility.
            </p>
          </div>

          <div>
            <label htmlFor="benefits" className="label">
              Benefits
            </label>
            <textarea
              id="benefits"
              rows={2}
              value={form.benefits}
              onChange={(event) => set('benefits', event.target.value)}
              placeholder="Stipend, certificate, mentorship, pre-placement offer..."
              className="input resize-y"
            />
          </div>

          <div>
            <p className="label">Required skills</p>
            <TagInput
              value={form.skills}
              onChange={(value) => set('skills', value)}
              suggestions={skillOptions}
              placeholder="Add a required skill"
            />
            <p className="mt-2 text-xs text-slate-400">
              Skills carry the most weight when matching students to this opportunity.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------- logistics */}
        <section className="card space-y-4 p-6">
          <h2 className="section-title">Location, timing and application</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="location" className="label">
                Location
              </label>
              <input
                id="location"
                value={form.location}
                onChange={(event) => set('location', event.target.value)}
                placeholder="Bengaluru / Remote / India"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="mode" className="label">
                Work mode <span className="text-red-500">*</span>
              </label>
              <select
                id="mode"
                value={form.mode}
                onChange={(event) => set('mode', event.target.value)}
                className="input"
              >
                {WORK_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="duration" className="label">
                Duration
              </label>
              <input
                id="duration"
                value={form.duration}
                onChange={(event) => set('duration', event.target.value)}
                placeholder="6 months / 48 hours / 12 weeks"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="stipend" className="label">
                Stipend / prize / award
              </label>
              <input
                id="stipend"
                value={form.stipend}
                onChange={(event) => set('stipend', event.target.value)}
                placeholder="INR 45,000 / month"
                className="input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deadline" className="label">
                Application deadline <span className="text-red-500">*</span>
              </label>
              <input
                id="deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => set('deadline', event.target.value)}
                className={`input ${errors.deadline ? 'input-error' : ''}`}
              />
              {errors.deadline && <p className="field-error">{errors.deadline}</p>}
            </div>

            <div>
              <label htmlFor="source" className="label">
                Source
              </label>
              <input
                id="source"
                value={form.source}
                onChange={(event) => set('source', event.target.value)}
                placeholder="Company careers page / LinkedIn / college notice"
                className="input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="applicationUrl" className="label">
              Application link <span className="text-red-500">*</span>
            </label>
            <input
              id="applicationUrl"
              type="url"
              value={form.applicationUrl}
              onChange={(event) => set('applicationUrl', event.target.value)}
              placeholder="https://example.com/apply"
              className={`input ${errors.applicationUrl ? 'input-error' : ''}`}
            />
            {errors.applicationUrl && <p className="field-error">{errors.applicationUrl}</p>}
          </div>
        </section>

        {/* ------------------------------------------------- publication */}
        <section className="card space-y-4 p-6">
          <h2 className="section-title">Publication</h2>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">Visible to students</span>
              <span className="text-xs text-slate-500">
                Uncheck to hide it without deleting it.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.isDemo}
              onChange={(event) => set('isDemo', event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Mark as sample / demo data
              </span>
              <span className="text-xs text-slate-500">
                Adds a &ldquo;Sample&rdquo; badge so nobody mistakes a fictional listing for a real
                one.
              </span>
            </span>
          </label>

          <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Only tick &ldquo;sample&rdquo; for listings you invented for a demo. Real opportunities
            should be left unticked so students can trust them.
          </p>
        </section>

        {/* ---------------------------------------------------- actions */}
        <div className="flex justify-end gap-2">
          <Link to="/admin/opportunities" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Publish opportunity'}
          </button>
        </div>
      </form>
    </div>
  );
}
