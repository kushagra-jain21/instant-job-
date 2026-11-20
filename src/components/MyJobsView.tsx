import { useMemo, useState } from 'react';
import { ArrowRight, Bell, Check, Clock } from 'lucide-react';
import { markNotificationRead } from '../services/instantJobService';
import { AppNotification, formatINR, Job, JobStatus, UserPublic } from '../types/instantJob';
import { JobStatusText } from './StatusText';

interface MyJobsViewProps {
  currentUser: UserPublic;
  jobs: Job[];
  notifications: AppNotification[];
  onSelectJob: (job: Job) => void;
  onOpenPostJob: () => void;
}

export function MyJobsView({
  currentUser,
  jobs,
  notifications,
  onSelectJob,
  onOpenPostJob,
}: MyJobsViewProps) {
  const [roleView, setRoleView] = useState<'poster' | 'worker'>('poster');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all');
  const [showAlerts, setShowAlerts] = useState(false);

  const postedJobs = useMemo(
    () => jobs.filter((j) => j.posterId === currentUser.uid),
    [jobs, currentUser.uid]
  );
  const acceptedJobs = useMemo(
    () => jobs.filter((j) => j.workerId === currentUser.uid),
    [jobs, currentUser.uid]
  );

  const activeList = roleView === 'poster' ? postedJobs : acceptedJobs;
  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return activeList;
    return activeList.filter((j) => j.status === statusFilter);
  }, [activeList, statusFilter]);

  const urgentDeadlines = useMemo(() => {
    const now = Date.now();
    return [...postedJobs, ...acceptedJobs].filter((j) => {
      if (!['open', 'accepted', 'changes_requested'].includes(j.status)) return false;
      const due = Date.parse(j.deadline);
      return !Number.isNaN(due) && due - now <= 48 * 60 * 60 * 1000;
    });
  }, [postedJobs, acceptedJobs]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">My Jobs & Alerts</h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage tasks you posted as a Job Poster or accepted as a Job Seeker.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAlerts((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            Alerts ({unreadCount})
          </button>
          <button
            type="button"
            onClick={onOpenPostJob}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap cursor-pointer"
          >
            Post New Job
          </button>
        </div>
      </div>

      {/* Deadline Reminders Banner (SRS 7.6) */}
      {urgentDeadlines.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <Clock className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              <strong>Deadline Reminder:</strong> {urgentDeadlines.length}{' '}
              {urgentDeadlines.length === 1 ? 'task is' : 'tasks are'} due within 48 hours (
              {urgentDeadlines[0].title}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectJob(urgentDeadlines[0])}
            className="text-xs font-semibold text-amber-900 underline cursor-pointer"
          >
            Open Task
          </button>
        </div>
      )}

      {/* Real-time Notifications Drawer */}
      {showAlerts && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Notifications</h2>
            <button
              type="button"
              onClick={() => setShowAlerts(false)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Close
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.notifId} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className={`text-xs font-semibold ${n.read ? 'text-slate-600' : 'text-slate-900'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-600">{n.message}</p>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => markNotificationRead(n.notifId)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Mark Read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Role Switch & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setRoleView('poster')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              roleView === 'poster'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Posted by Me ({postedJobs.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleView('worker')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              roleView === 'worker'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Accepted by Me ({acceptedJobs.length})
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | JobStatus)}
          aria-label="Filter jobs by status"
          className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="accepted">In Progress</option>
          <option value="submitted">Submitted</option>
          <option value="changes_requested">Changes Requested</option>
          <option value="completed">Completed</option>
          <option value="disputed">Disputed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table / List */}
      {filteredList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            No {roleView === 'poster' ? 'posted' : 'accepted'} jobs in this view.
          </p>
          <p className="text-xs text-slate-600">
            {roleView === 'poster'
              ? 'Post a task to fund escrow and find a Job Seeker.'
              : 'Browse the Marketplace to accept an open task with one click.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
          {filteredList.map((job) => (
            <div
              key={job.jobId}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
            >
              <div className="space-y-1.5">
                <JobStatusText status={job.status} />
                <h3 className="text-base font-bold text-slate-900 font-display">{job.title}</h3>
                <p className="text-xs text-slate-500">
                  {job.category} · Due {job.deadline}
                  {job.workerName ? ` · Worker: ${job.workerName}` : ' · Waiting for worker'}
                </p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-5">
                <div className="text-right">
                  <p className="text-base font-bold font-mono text-slate-900 tabular-nums">
                    {formatINR(job.amount)}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                    Net {formatINR(job.netPayout)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Open
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
