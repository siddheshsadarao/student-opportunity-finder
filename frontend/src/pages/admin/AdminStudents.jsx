/**
 * Registered students list, with search and a detail modal.
 */
import { useCallback, useEffect, useState } from 'react';
import { Search, Users, Eye } from 'lucide-react';
import { SkeletonRows, EmptyState, Pagination, Modal, Avatar } from '../../components/ui';
import useDebounce from '../../hooks/useDebounce';
import { adminApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const debouncedSearch = useDebounce(search, 400);
  const toast = useToast();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.students({
        search: debouncedSearch || undefined,
        page,
        limit: 15,
      });
      setStudents(data.students);
      setPagination(data.pagination);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
        <p className="mt-1 text-slate-500">{pagination.total} registered on the platform.</p>
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
                      onClick={() => setSelected(student)}
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
        onClose={() => setSelected(null)}
        title={selected?.name || 'Student'}
        description={selected?.email}
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4">
              {[
                ['College', selected.college],
                ['Degree', selected.degree],
                ['Branch', selected.branch],
                ['Year', selected.year ? `Year ${selected.year}` : null],
                ['City', selected.city],
                ['Career goal', selected.career_goal],
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
          </div>
        )}
      </Modal>
    </div>
  );
}
