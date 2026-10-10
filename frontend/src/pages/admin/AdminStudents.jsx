/**
 * Registered students list, with search and a detail modal.
 */
import { useCallback, useEffect, useState } from 'react';
import { Search, Users, Eye, Download, Trash2, UserX, UserCheck } from 'lucide-react';
import { SkeletonRows, EmptyState, Pagination, Modal, Avatar } from '../../components/ui';
import useDebounce from '../../hooks/useDebounce';
import { adminApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import ResumePreview from '../../components/ResumePreview';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const [resumeOnly, setResumeOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [preview, setPreview] = useState(false);
  const loadResume = useCallback(() => adminApi.studentResume(selected.id), [selected?.id]);

  const debouncedSearch = useDebounce(search, 400);
  const toast = useToast();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, resumeOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.students({
        search: debouncedSearch || undefined,
        page,
        limit: 15,
        status: status || undefined,
        hasResume: resumeOnly ? 'true' : undefined,
      });
      setStudents(data.students);
      setPagination(data.pagination);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, status, resumeOnly, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadResume = async () => {
    setBusy(true);
    try {
      const blob = await adminApi.studentResume(selected.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = selected.resume_original_name || 'resume';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };

  const changeStatus = async () => {
    setBusy(true);
    try {
      await adminApi.setStudentStatus(selected.id, !selected.is_active);
      setSelected((current) => ({ ...current, is_active: !current.is_active }));
      await load();
      toast.success('Account status updated.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };

  const removeStudent = async () => {
    setBusy(true);
    try {
      await adminApi.deleteStudent(selected.id, confirmEmail);
      setSelected(null);
      setDeleting(false);
      setConfirmEmail('');
      if (students.length === 1 && page > 1) setPage(page - 1);
      else await load();
      toast.success('Student account deleted.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
        <p className="mt-1 text-slate-500">{pagination.total} registered on the platform.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <select className="input w-auto" aria-label="Account status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All accounts</option>
          <option value="verified">Email verified</option>
          <option value="pending">Email pending</option>
          <option value="inactive">Suspended</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={resumeOnly} onChange={(e) => setResumeOnly(e.target.checked)} />
          Resume uploaded
        </label>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email or college..."
          className="input pl-9"
          aria-label="Search students"
        />
      </div>

      {loading ? (
        <SkeletonRows count={6} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description={
            debouncedSearch
              ? 'No student matches that search.'
              : 'No students have registered yet.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-12 lg:gap-4">
              <div className="col-span-4">Student</div>
              <div className="col-span-3">Education</div>
              <div className="col-span-2">Joined</div>
              <div className="col-span-2">Activity</div>
              <div className="col-span-1 text-right">View</div>
            </div>

            <div className="divide-y divide-slate-100">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="px-5 py-4 transition hover:bg-slate-50 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4"
                >
                  <div className="flex items-center gap-3 lg:col-span-4">
                    <Avatar name={student.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{student.name}</p>
                      <p className="truncate text-sm text-slate-500">{student.email}</p>
                      <p className="text-xs text-slate-500">
                        {!student.is_active ? 'Suspended' : student.email_verified ? 'Email verified' : 'Email pending'}
                        {student.has_resume ? ' · Resume uploaded' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 lg:col-span-3 lg:mt-0">
                    <p className="truncate text-sm text-slate-700">
                      {student.degree || '-'} {student.branch ? `· ${student.branch}` : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {student.college || 'College not set'}
                      {student.year ? ` · Year ${student.year}` : ''}
                    </p>
                  </div>

                  <div className="mt-2 lg:col-span-2 lg:mt-0">
                    <p className="text-sm text-slate-600">{formatDate(student.created_at)}</p>
                    {!student.onboarding_done && (
                      <span className="badge bg-amber-50 text-amber-700">Onboarding pending</span>
                    )}
                  </div>

                  <div className="mt-2 lg:col-span-2 lg:mt-0">
                    <p className="text-xs text-slate-500">{student.saved_count} saved</p>
                    <p className="text-xs text-slate-500">
                      {student.application_count} applications
                    </p>
                  </div>

                  <div className="mt-3 lg:col-span-1 lg:mt-0 lg:text-right">
                    <button
                      type="button"
                      onClick={() => { setSelected(student); setPreview(false); setDeleting(false); setConfirmEmail(''); }}
                      className="btn-secondary btn-sm"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onChange={setPage}
          />
        </>
      )}

      {/* ------------------------------------------------- detail modal */}
      <Modal
        open={!!selected}
        onClose={() => { if (!busy) setSelected(null); }}
        title={selected?.name || 'Student'}
        description={selected?.email}
        size={preview ? 'xl' : 'md'}
      >
        {selected && (
          <div className="space-y-5">
            {!preview && <>
            <dl className="grid grid-cols-2 gap-4">
              {[
                ['College', selected.college],
                ['Degree', selected.degree],
                ['Branch', selected.branch],
                ['Year', selected.year ? `Year ${selected.year}` : null],
                ['City', selected.city],
                ['State / Union territory', selected.state],
                ['Career goal', selected.career_goal],
                ['Phone', selected.phone],
                ['Email', selected.email_verified ? 'Verified' : 'Pending verification'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">
                    {value || <span className="text-slate-400">Not set</span>}
                  </dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 text-xs text-slate-500">Skills</p>
              {selected.skills?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {selected.skills.map((skill) => (
                    <span key={skill} className="badge-skill">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No skills added.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs text-slate-500">Saved opportunities</p>
                <p className="text-xl font-bold text-slate-900">{selected.saved_count}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Applications tracked</p>
                <p className="text-xl font-bold text-slate-900">{selected.application_count}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Registered on {formatDate(selected.created_at)}.
            </p>
            </>}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {selected.has_resume ? (
                <>
                <button className="btn-secondary" onClick={() => setPreview(!preview)} disabled={busy}>
                  <Eye className="h-4 w-4" /> {preview ? 'Hide resume' : 'View resume'}
                </button>
                <button className="btn-secondary" onClick={downloadResume} disabled={busy}>
                  <Download className="h-4 w-4" /> Download
                </button>
                </>
              ) : <span className="py-2 text-sm text-slate-500">No resume uploaded</span>}
              <button className="btn-secondary" onClick={changeStatus} disabled={busy}>
                {selected.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {selected.is_active ? 'Suspend' : 'Restore access'}
              </button>
              <button className="btn-danger" onClick={() => setDeleting(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Delete account
              </button>
            </div>
            {preview && selected.has_resume && <ResumePreview loadFile={loadResume} fileName={selected.resume_original_name || 'resume'} />}
            {deleting && (
              <div className="space-y-3 border-t border-red-200 pt-4">
                <p className="text-sm text-red-700">Permanently delete this account, its resume and associated activity? This cannot be undone.</p>
                <input className="input" aria-label="Confirm student email" placeholder="Enter this student's email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn-danger" disabled={busy || confirmEmail !== selected.email} onClick={removeStudent}>Confirm deletion</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => setDeleting(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
