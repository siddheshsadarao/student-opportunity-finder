/**
 * Category management: create, edit and delete opportunity categories.
 */
import { useCallback, useEffect, useState } from 'react';
import { PlusCircle, Pencil, Trash2, Tags, Compass } from 'lucide-react';
import { SkeletonRows, Modal, ConfirmDialog, Spinner, EmptyState } from '../../components/ui';
import { adminApi, metaApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { getCategoryColor, CATEGORY_COLORS } from '../../utils/constants';
import { CATEGORY_ICONS, getCategoryIcon } from '../../utils/iconMap';

// Icon names offered in the form (all exist in lucide-react).
const ICON_CHOICES = [
  'Briefcase',
  'GraduationCap',
  'Code2',
  'Trophy',
  'BookOpen',
  'Presentation',
  'Award',
  'Rocket',
  'Sparkles',
  'Target',
  'Users',
  'Globe',
];

const EMPTY = { name: '', icon: 'Sparkles', color: 'indigo', description: '' };

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setCategories(await metaApi.categories());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setErrors({});
    setEditing({});
  };

  const openEdit = (category) => {
    setForm({
      name: category.name,
      icon: category.icon || 'Sparkles',
      color: category.color || 'indigo',
      description: category.description || '',
    });
    setErrors({});
    setEditing(category);
  };

  const onSave = async (event) => {
    event.preventDefault();

    if (form.name.trim().length < 2) {
      setErrors({ name: 'Enter a category name.' });
      return;
    }

    setSaving(true);
    try {
      if (editing?.id) {
        await adminApi.updateCategory(editing.id, form);
        toast.success('Category updated.');
      } else {
        await adminApi.createCategory(form);
        toast.success('Category created.');
      }
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminApi.deleteCategory(deleting.id);
      toast.success('Category deleted.');
      setDeleting(null);
      load();
    } catch (error) {
      // The backend refuses if opportunities still use the category.
      toast.error(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="mt-1 text-slate-500">
            Each category gets its own page and icon in the student sidebar.
          </p>
        </div>
        <button type="button" onClick={openNew} className="btn-primary shrink-0">
          <PlusCircle className="h-4 w-4" />
          Add category
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={5} />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Add the first category so opportunities can be organised."
          action={
            <button type="button" onClick={openNew} className="btn-primary">
              Add category
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            const colors = getCategoryColor(category.color);

            return (
              <div key={category.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg ${colors.bg}`}
                  >
                    <Icon className={`h-5.5 w-5.5 ${colors.text}`} />
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(category)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Edit ${category.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(category)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${category.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h2 className="mt-3.5 font-semibold text-slate-900">{category.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">
                  {category.description || 'No description.'}
                </p>
                <p className="mt-auto pt-3 text-xs font-medium text-primary-600">
                  {category.opportunity_count} open opportunities
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------- create / edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'New category'}
      >
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label htmlFor="cat-name" className="label">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="cat-name"
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }));
                setErrors({});
              }}
              placeholder="Internship"
              className={`input ${errors.name ? 'input-error' : ''}`}
            />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="cat-description" className="label">
              Description
            </label>
            <textarea
              id="cat-description"
              rows={2}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Paid and unpaid work experience with companies."
              className="input resize-none"
            />
          </div>

          <div>
            <p className="label">Icon</p>
            <div className="grid grid-cols-6 gap-2">
              {ICON_CHOICES.map((iconName) => {
                const Icon = CATEGORY_ICONS[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, icon: iconName }))}
                    title={iconName}
                    className={`flex h-10 items-center justify-center rounded-lg border transition ${
                      form.icon === iconName
                        ? 'border-primary-500 bg-primary-50 text-primary-600'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="label">Colour</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(CATEGORY_COLORS).map((colorName) => {
                const colors = CATEGORY_COLORS[colorName];
                return (
                  <button
                    key={colorName}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, color: colorName }))}
                    title={colorName}
                    className={`h-9 w-9 rounded-lg border-2 transition ${colors.bg} ${
                      form.color === colorName ? 'border-slate-800' : 'border-transparent'
                    }`}
                  >
                    <span className={`mx-auto block h-3 w-3 rounded-full ${colors.dot}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />}
              {editing?.id ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete this category?"
        message={`"${deleting?.name}" will be deleted. Categories that still have opportunities cannot be deleted -- move or delete those first.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
