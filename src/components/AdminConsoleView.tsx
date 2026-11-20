import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Printer,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  adminApproveWithdrawal,
  adminRemoveJob,
  adminResolveDispute,
  adminToggleReviewRemoval,
  adminUpdateUserAccount,
} from '../services/instantJobService';
import {
  AuditLog,
  ChatMessage,
  Dispute,
  formatINR,
  Job,
  JOB_CATEGORIES,
  JobCategory,
  Payment,
  Review,
  UserPublic,
  Withdrawal,
} from '../types/instantJob';

interface AdminConsoleViewProps {
  adminUser: UserPublic;
  jobs: Job[];
  reviews: Review[];
}

type AdminSection = 'analytics' | 'disputes' | 'users' | 'moderation' | 'audit';

export function AdminConsoleView({ adminUser, jobs, reviews }: AdminConsoleViewProps) {
  const [section, setSection] = useState<AdminSection>('analytics');
  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<Withdrawal[]>([]);
  const [allDisputes, setAllDisputes] = useState<Dispute[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Analytics Filters (SRS 7.7)
  const [filterCategory, setFilterCategory] = useState<'all' | JobCategory>('all');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Dispute Inspector State
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [disputeChat, setDisputeChat] = useState<ChatMessage[]>([]);
  const [decisionNote, setDecisionNote] = useState('');
  const [splitWorkerPct, setSplitWorkerPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        collection(db, 'users'),
        (snap) => setAllUsers(snap.docs.map((d) => d.data() as UserPublic)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'payments'),
        (snap) => setAllPayments(snap.docs.map((d) => d.data() as Payment)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'withdrawals'),
        (snap) => setAllWithdrawals(snap.docs.map((d) => d.data() as Withdrawal)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'disputes'), orderBy('createdAt', 'desc')),
        (snap) => setAllDisputes(snap.docs.map((d) => d.data() as Dispute)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'disputes')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(100)),
        (snap) => setAuditLogs(snap.docs.map((d) => d.data() as AuditLog)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      )
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!selectedDispute) {
      setDisputeChat([]);
      return;
    }
    const q = query(
      collection(db, 'jobs', selectedDispute.jobId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setDisputeChat(snap.docs.map((d) => d.data() as ChatMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, `jobs/${selectedDispute.jobId}/messages`)
    );
    return () => unsub();
  }, [selectedDispute]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filterCategory !== 'all' && j.category !== filterCategory) return false;
      if (filterMinAmount && j.amount < Number(filterMinAmount)) return false;
      if (filterDateFrom && j.deadline < filterDateFrom) return false;
      if (filterDateTo && j.deadline > filterDateTo) return false;
      return true;
    });
  }, [jobs, filterCategory, filterMinAmount, filterDateFrom, filterDateTo]);

  const reportStats = useMemo(() => {
    const filteredIds = new Set(filteredJobs.map((j) => j.jobId));
    const relevantPayments = allPayments.filter((p) => filteredIds.has(p.jobId));

    const totalJobs = filteredJobs.length;
    const completedJobs = filteredJobs.filter((j) => j.status === 'completed').length;
    const cancelledJobs = filteredJobs.filter((j) => j.status === 'cancelled').length;
    const disputedJobs = filteredJobs.filter((j) => j.status === 'disputed').length;

    const totalVolume = relevantPayments
      .filter((p) => p.status !== 'failed')
      .reduce((sum, p) => sum + p.amount, 0);
    const platformFees = relevantPayments
      .filter((p) => p.status === 'released')
      .reduce((sum, p) => sum + p.platformFee, 0);
    const withdrawalsTotal = allWithdrawals
      .filter((w) => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);

    const catCounts = JOB_CATEGORIES.map((cat) => ({
      category: cat,
      count: filteredJobs.filter((j) => j.category === cat).length,
      volume: filteredJobs
        .filter((j) => j.category === cat)
        .reduce((sum, j) => sum + j.amount, 0),
    })).sort((a, b) => b.count - a.count);

    return {
      totalJobs,
      completedJobs,
      cancelledJobs,
      disputedJobs,
      totalVolume,
      platformFees,
      withdrawalsTotal,
      activeUsers: allUsers.filter((u) => u.accountStatus === 'active').length,
      catCounts,
    };
  }, [filteredJobs, allPayments, allWithdrawals, allUsers]);

  const handleExportCsv = () => {
    const headers = [
      'Job ID',
      'Title',
      'Category',
      'Poster',
      'Worker',
      'Amount (INR)',
      'Platform Fee (INR)',
      'Status',
      'Payment Status',
      'Deadline',
    ];
    const rows = filteredJobs.map((j) => [
      j.jobId,
      `"${j.title.replace(/"/g, '""')}"`,
      j.category,
      `"${j.posterName}"`,
      `"${j.workerName || 'Unassigned'}"`,
      j.amount,
      j.platformFee,
      j.status,
      j.paymentStatus,
      j.deadline,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `instant-job-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleResolveDispute = async (
    decision: 'release_worker' | 'refund_poster' | 'split'
  ) => {
    if (!selectedDispute) return;
    const job = jobs.find((j) => j.jobId === selectedDispute.jobId);
    if (!job) return;

    const workerShare =
      decision === 'release_worker'
        ? job.netPayout
        : decision === 'refund_poster'
          ? 0
          : Math.round((job.netPayout * splitWorkerPct) / 100);
    const posterShare =
      decision === 'refund_poster'
        ? job.amount
        : decision === 'release_worker'
          ? 0
          : Math.max(0, job.amount - workerShare - job.platformFee);

    setBusy(true);
    setAdminMsg(null);
    try {
      await adminResolveDispute({
        admin: adminUser,
        disputeId: selectedDispute.disputeId,
        jobId: selectedDispute.jobId,
        decision,
        workerShare,
        posterShare,
        decisionNote: decisionNote || `Resolved via ${decision}`,
      });
      setSelectedDispute(null);
      setDecisionNote('');
      setAdminMsg('Dispute resolved and both parties notified.');
    } catch (err) {
      setAdminMsg(err instanceof Error ? err.message : 'Unable to resolve dispute.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Admin & Operations Console
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Platform analytics, dispute arbitration, KYC verification, moderation, and audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
          {(
            [
              ['analytics', 'Reports & Analytics'],
              ['disputes', `Disputes (${allDisputes.filter((d) => d.status === 'open').length})`],
              ['users', `Users & KYC (${allUsers.length})`],
              ['moderation', 'Moderation'],
              ['audit', 'Audit Logs'],
            ] as [AdminSection, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                section === id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {adminMsg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          {adminMsg}
        </div>
      )}

      {/* 1. Reports & Analytics (SRS 7.7) */}
      {section === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end justify-between gap-4 no-print">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as 'all' | JobCategory)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="all">All Categories</option>
                  {JOB_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Min Amount (₹)
                </label>
                <input
                  type="number"
                  value={filterMinAmount}
                  onChange={(e) => setFilterMinAmount(e.target.value)}
                  placeholder="0"
                  className="w-28 px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Deadline From
                </label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Deadline To
                </label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Jobs</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {reportStats.totalJobs}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {reportStats.completedJobs} completed · {reportStats.cancelledJobs} cancelled
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Escrow Volume</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatINR(reportStats.totalVolume)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {reportStats.disputedJobs} currently disputed
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Platform Fees Earned</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatINR(reportStats.platformFees)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Withdrawals settled: {formatINR(reportStats.withdrawalsTotal)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Active Accounts</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {reportStats.activeUsers}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {allUsers.filter((u) => u.kycVerified).length} KYC verified
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Most Popular Job Categories
            </h2>
            <div className="space-y-3">
              {reportStats.catCounts.map((row) => {
                const max = Math.max(1, ...reportStats.catCounts.map((c) => c.count));
                const pct = Math.round((row.count / max) * 100);
                return (
                  <div key={row.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{row.category}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {row.count} jobs · {formatINR(row.volume)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Dispute Management (SRS 7.3) */}
      {section === 'disputes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {allDisputes.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">No disputes filed.</p>
            ) : (
              allDisputes.map((d) => (
                <button
                  key={d.disputeId}
                  type="button"
                  onClick={() => setSelectedDispute(d)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                    selectedDispute?.disputeId === d.disputeId ? 'bg-blue-50/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`font-semibold ${
                        d.status === 'open' ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {d.status.toUpperCase()}
                    </span>
                    <span className="text-slate-500">By {d.raisedByName}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-1">{d.jobTitle}</p>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{d.reason}</p>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            {!selectedDispute ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Select a dispute from the left to inspect job details, chat history, and decide payout.
              </div>
            ) : (
              (() => {
                const dJob = jobs.find((j) => j.jobId === selectedDispute.jobId);
                return (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {selectedDispute.jobTitle}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Raised by {selectedDispute.raisedByName} · Reason: {selectedDispute.reason}
                        </p>
                      </div>
                      {dJob && (
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatINR(dJob.amount)}
                        </span>
                      )}
                    </div>

                    {dJob?.submissionMessage && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <p className="font-semibold text-slate-900">Submitted Work:</p>
                        <p className="text-slate-700 mt-1">{dJob.submissionMessage}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Archived Chat Log ({disputeChat.length} messages)
                      </p>
                      <div className="max-h-44 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                        {disputeChat.length === 0 ? (
                          <p className="text-xs text-slate-500">No chat messages on this job.</p>
                        ) : (
                          disputeChat.map((m) => (
                            <div key={m.messageId} className="text-xs">
                              <span className="font-semibold text-slate-900">{m.senderName}: </span>
                              <span className="text-slate-700">{m.text}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {selectedDispute.status === 'open' ? (
                      <div className="space-y-4 pt-2 border-t border-slate-200">
                        <textarea
                          rows={2}
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder="Admin decision note (sent to both users)..."
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                        />

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Split Percentage to Worker: {splitWorkerPct}%
                          </label>
                          <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={splitWorkerPct}
                            onChange={(e) => setSplitWorkerPct(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleResolveDispute('release_worker')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                          >
                            Release 100% to Worker
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleResolveDispute('refund_poster')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                          >
                            Refund 100% to Poster
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleResolveDispute('split')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            Split ({splitWorkerPct}% Worker)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                        Resolved ({selectedDispute.adminDecision}): Worker{' '}
                        {formatINR(selectedDispute.workerShare)} · Poster Refund{' '}
                        {formatINR(selectedDispute.posterShare)}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* 3. Users & KYC Management (SRS 7.5, 7.8) */}
      {section === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Completed</th>
                  <th className="py-3 px-4 font-semibold">Rating</th>
                  <th className="py-3 px-4 font-semibold">KYC</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((u) => (
                  <tr key={u.uid} className="h-12">
                    <td className="py-2 px-4">
                      <p className="font-semibold text-slate-900">{u.displayName}</p>
                      <p className="text-[11px] font-mono text-slate-500">{u.uid.slice(0, 12)}...</p>
                    </td>
                    <td className="py-2 px-4 font-mono tabular-nums">{u.completedJobsCount}</td>
                    <td className="py-2 px-4 font-mono tabular-nums">
                      {u.ratingCount > 0 ? `${u.ratingAvg.toFixed(1)} (${u.ratingCount})` : '—'}
                    </td>
                    <td className="py-2 px-4">
                      <span className={u.kycVerified ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                        {u.kycVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`font-semibold ${
                          u.accountStatus === 'active' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {u.accountStatus}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right space-x-2 whitespace-nowrap">
                      {!u.kycVerified && (
                        <button
                          type="button"
                          onClick={() =>
                            adminUpdateUserAccount({
                              admin: adminUser,
                              targetUid: u.uid,
                              kycVerified: true,
                              kycStatus: 'verified',
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Verify KYC
                        </button>
                      )}
                      {u.uid !== adminUser.uid && (
                        <button
                          type="button"
                          onClick={() =>
                            adminUpdateUserAccount({
                              admin: adminUser,
                              targetUid: u.uid,
                              accountStatus: u.accountStatus === 'active' ? 'blocked' : 'active',
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                        >
                          <ShieldAlert className="w-3 h-3" />
                          {u.accountStatus === 'active' ? 'Block' : 'Unblock'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Moderation (Jobs, Large Withdrawals, Reviews) */}
      {section === 'moderation' && (
        <div className="space-y-6">
          {/* Pending Large Withdrawals */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Pending Large Withdrawals (≥ ₹5,000)
            </h2>
            {allWithdrawals.filter((w) => w.status === 'pending').length === 0 ? (
              <p className="text-xs text-slate-500">No pending withdrawals.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {allWithdrawals
                  .filter((w) => w.status === 'pending')
                  .map((w) => (
                    <div key={w.withdrawalId} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900 font-mono">
                          {formatINR(w.amount)} · {w.method.toUpperCase()} ({w.destination})
                        </p>
                        <p className="text-slate-500">User ID: {w.userId}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            adminApproveWithdrawal({
                              admin: adminUser,
                              withdrawalId: w.withdrawalId,
                              userId: w.userId,
                              amount: w.amount,
                              status: 'completed',
                            })
                          }
                          className="px-3 py-1.5 font-semibold text-white bg-emerald-700 rounded cursor-pointer"
                        >
                          Approve Payout
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adminApproveWithdrawal({
                              admin: adminUser,
                              withdrawalId: w.withdrawalId,
                              userId: w.userId,
                              amount: w.amount,
                              status: 'rejected',
                            })
                          }
                          className="px-3 py-1.5 font-semibold text-red-700 border border-red-200 rounded cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Job Moderation */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Active Jobs Moderation
            </h2>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {jobs
                .filter((j) => j.status === 'open')
                .map((j) => (
                  <div key={j.jobId} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{j.title}</p>
                      <p className="text-slate-500">
                        {j.posterName} · {formatINR(j.amount)} · {j.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        adminRemoveJob({
                          admin: adminUser,
                          job: j,
                          reason: 'Removed by Admin for policy review',
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-red-700 border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove & Refund
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Review Moderation */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Ratings & Reviews Moderation
            </h2>
            {reviews.length === 0 ? (
              <p className="text-xs text-slate-500">No reviews posted yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {reviews.map((r) => (
                  <div key={r.reviewId} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {r.reviewerName} ({r.rating}/5) {r.removed ? '[REMOVED]' : ''}
                      </p>
                      <p className="text-slate-600">{r.comment}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        adminToggleReviewRemoval({
                          admin: adminUser,
                          reviewId: r.reviewId,
                          removed: !r.removed,
                        })
                      }
                      className="px-3 py-1.5 font-semibold text-slate-700 border border-slate-200 rounded cursor-pointer"
                    >
                      {r.removed ? 'Restore' : 'Remove Review'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Audit Logs (SRS 10.10) */}
      {section === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Actor</th>
                  <th className="py-3 px-4 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.logId} className="h-10">
                    <td className="py-2 px-4 font-mono font-semibold text-slate-900">
                      {log.action}
                    </td>
                    <td className="py-2 px-4 text-slate-700">{log.actorName}</td>
                    <td className="py-2 px-4 text-slate-600">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
