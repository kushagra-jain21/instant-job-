import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lock,
  MessageSquare,
  Send,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  acceptJobAtomically,
  approveAndReleaseEscrow,
  cancelOpenJobWithRefund,
  raiseDispute,
  requestJobChanges,
  sendChatMessage,
  submitJobReview,
  submitJobWork,
  updateOpenJob,
} from '../services/instantJobService';
import {
  ChatMessage,
  detectOffPlatformContact,
  formatINR,
  Job,
  JOB_CATEGORIES,
  JobCategory,
  KYC_JOB_THRESHOLD,
  UserPublic,
} from '../types/instantJob';
import { JobStatusText } from './StatusText';

interface JobDetailModalProps {
  job: Job;
  currentUser: UserPublic | null;
  onClose: () => void;
  onRequireSignIn: () => void;
}

export function JobDetailModal({
  job,
  currentUser,
  onClose,
  onRequireSignIn,
}: JobDetailModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatAttachment, setChatAttachment] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Edit Open Job state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(job.title);
  const [editDesc, setEditDesc] = useState(job.description);
  const [editCategory, setEditCategory] = useState<JobCategory>(job.category);
  const [editDeadline, setEditDeadline] = useState(job.deadline);
  const [editAttachments, setEditAttachments] = useState((job.attachments || []).join('\n'));

  // Work Submission state
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState('');

  // Poster Request Changes state
  const [showChangeInput, setShowChangeInput] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  // Dispute state
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');

  // Review state
  const [ratingValue, setRatingValue] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const isPoster = Boolean(currentUser && currentUser.uid === job.posterId);
  const isWorker = Boolean(currentUser && currentUser.uid === job.workerId);
  const isParticipant = isPoster || isWorker;
  const chatEnabled = Boolean(job.workerId && isParticipant);

  const offPlatformWarning = useMemo(() => detectOffPlatformContact(chatText), [chatText]);

  useEffect(() => {
    if (!chatEnabled) {
      setMessages([]);
      return;
    }
    const path = `jobs/${job.jobId}/messages`;
    const q = query(collection(db, 'jobs', job.jobId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => d.data() as ChatMessage));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [chatEnabled, job.jobId]);

  const handleAccept = async () => {
    if (!currentUser) {
      onRequireSignIn();
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await acceptJobAtomically({ jobId: job.jobId, worker: currentUser });
      setFeedback({ type: 'success', text: 'Job locked! You can now chat and submit work.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to accept job.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await updateOpenJob({
        jobId: job.jobId,
        title: editTitle,
        description: editDesc,
        category: editCategory,
        deadline: editDeadline,
        attachments: editAttachments.split('\n'),
      });
      setIsEditing(false);
      setFeedback({ type: 'success', text: 'Job details updated.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update job.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelJob = async () => {
    if (!currentUser) return;
    setBusy(true);
    setFeedback(null);
    try {
      await cancelOpenJobWithRefund({
        job,
        actorName: currentUser.displayName,
      });
      setFeedback({
        type: 'success',
        text: `Job cancelled. Full refund of ${formatINR(job.amount)} processed.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to cancel job.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    setFeedback(null);
    try {
      await submitJobWork({
        job,
        workerName: currentUser.displayName,
        submissionMessage,
        submissionLinks: submissionLinks.split('\n'),
      });
      setSubmissionMessage('');
      setSubmissionLinks('');
      setFeedback({ type: 'success', text: 'Work submitted to Job Poster for review.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit work.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApproveRelease = async () => {
    if (!currentUser) return;
    setBusy(true);
    setFeedback(null);
    try {
      await approveAndReleaseEscrow({ job, posterName: currentUser.displayName });
      setFeedback({
        type: 'success',
        text: `Approved! ${formatINR(job.netPayout)} released to ${job.workerName}'s wallet.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to release payment.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    setFeedback(null);
    try {
      await requestJobChanges({ job, posterName: currentUser.displayName, note: changeNote });
      setShowChangeInput(false);
      setChangeNote('');
      setFeedback({ type: 'success', text: 'Revision feedback sent to worker.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to request changes.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRaiseDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    setFeedback(null);
    try {
      await raiseDispute({
        job,
        raisedBy: currentUser,
        reason: disputeReason,
        evidence: disputeEvidence,
      });
      setShowDisputeForm(false);
      setDisputeReason('');
      setDisputeEvidence('');
      setFeedback({
        type: 'success',
        text: 'Dispute opened. Payment stays frozen in escrow until Admin resolves it.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to raise dispute.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !chatText.trim()) return;
    try {
      await sendChatMessage({
        job,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        text: chatText,
        attachmentUrl: chatAttachment,
      });
      setChatText('');
      setChatAttachment('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send message.',
      });
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const revieweeId = isPoster ? job.workerId : job.posterId;
    if (!revieweeId) return;

    setBusy(true);
    setFeedback(null);
    try {
      await submitJobReview({
        job,
        reviewer: currentUser,
        revieweeId,
        role: isPoster ? 'poster' : 'worker',
        rating: ratingValue,
        comment: reviewComment,
      });
      setReviewComment('');
      setFeedback({ type: 'success', text: 'Rating and review published!' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit review.',
      });
    } finally {
      setBusy(false);
    }
  };

  const canRate =
    job.status === 'completed' &&
    ((isPoster && !job.posterRated) || (isWorker && !job.workerRated));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl my-6 overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <JobStatusText status={job.status} />
            <h2 className="text-xl font-bold text-slate-900 font-display">{job.title}</h2>
            <p className="text-xs text-slate-500">
              {job.category} · Due {job.deadline} · Posted by {job.posterName}
              {job.posterVerified ? ' (KYC Verified)' : ''}
              {job.workerName ? ` · Worker: ${job.workerName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close job details"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div
            className={`mx-6 mt-4 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
              feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Task Specs, Submission & Actions */}
          <div className="lg:col-span-7 space-y-6">
            {/* Escrow Money Breakdown */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Escrow Budget</p>
                <p className="text-base font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                  {formatINR(job.amount)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Platform Fee</p>
                <p className="text-base font-semibold font-mono text-slate-700 tabular-nums mt-0.5">
                  {formatINR(job.platformFee)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Worker Net Payout</p>
                <p className="text-base font-bold font-mono text-emerald-700 tabular-nums mt-0.5">
                  {formatINR(job.netPayout)}
                </p>
              </div>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="space-y-4 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-900">Edit Open Job</h3>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as JobCategory)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    {JOB_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <textarea
                  rows={3}
                  required
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <textarea
                  rows={2}
                  value={editAttachments}
                  onChange={(e) => setEditAttachments(e.target.value)}
                  placeholder="Attachment URLs (one per line)"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500">Task Description</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {job.description}
                </p>
                {job.attachments && job.attachments.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Reference Links</p>
                    <ul className="space-y-1">
                      {job.attachments.map((url, idx) => (
                        <li key={idx}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline break-all"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Submitted Work Block */}
            {job.submissionMessage && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-900">Worker Submission</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {job.submissionMessage}
                </p>
                {job.submissionLinks && job.submissionLinks.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {job.submissionLinks.map((lnk, idx) => (
                      <a
                        key={idx}
                        href={lnk}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-700 hover:underline break-all"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {lnk}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {job.status === 'changes_requested' && job.changeRequestNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
                <p className="text-xs font-semibold text-amber-900">Poster Revision Request</p>
                <p className="text-sm text-amber-800">{job.changeRequestNote}</p>
              </div>
            )}

            {/* Primary Lifecycle Actions */}
            {job.status === 'open' && !isPoster && (
              <div className="pt-2 space-y-3">
                {job.amount >= KYC_JOB_THRESHOLD && currentUser && !currentUser.kycVerified && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    This high-value job (≥ ₹{KYC_JOB_THRESHOLD.toLocaleString('en-IN')}) requires KYC verification before acceptance.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={busy}
                  className="w-full py-3 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {busy
                    ? 'Locking Job...'
                    : currentUser
                      ? `Accept Job Now (Earn ${formatINR(job.netPayout)})`
                      : 'Sign In to Accept This Job'}
                </button>
              </div>
            )}

            {job.status === 'open' && isPoster && !isEditing && (
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer"
                >
                  Edit Job Details
                </button>
                <button
                  type="button"
                  onClick={handleCancelJob}
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer"
                >
                  Cancel Job & Full Refund
                </button>
              </div>
            )}

            {/* Worker Work Submission Form */}
            {isWorker && (job.status === 'accepted' || job.status === 'changes_requested') && (
              <form
                onSubmit={handleSubmitWork}
                className="border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">Submit Finished Work</h3>
                <textarea
                  required
                  rows={3}
                  value={submissionMessage}
                  onChange={(e) => setSubmissionMessage(e.target.value)}
                  placeholder="Describe the completed deliverable or paste notes..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                />
                <textarea
                  rows={2}
                  value={submissionLinks}
                  onChange={(e) => setSubmissionLinks(e.target.value)}
                  placeholder="Deliverable file URLs (Google Drive, GitHub, Figma, etc., one per line)"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {busy ? 'Submitting...' : 'Submit for Poster Approval'}
                </button>
              </form>
            )}

            {/* Poster Review Actions */}
            {isPoster && job.status === 'submitted' && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Review Submitted Work</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleApproveRelease}
                    disabled={busy}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                  >
                    Approve & Release {formatINR(job.netPayout)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangeInput((v) => !v)}
                    className="px-4 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Request Changes
                  </button>
                </div>

                {showChangeInput && (
                  <form onSubmit={handleRequestChanges} className="space-y-2 pt-2">
                    <textarea
                      required
                      rows={2}
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="Explain what needs to be revised..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
                    >
                      Send Revision Request
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Raise Dispute Action */}
            {isParticipant &&
              ['accepted', 'submitted', 'changes_requested'].includes(job.status) && (
                <div className="pt-2">
                  {!showDisputeForm ? (
                    <button
                      type="button"
                      onClick={() => setShowDisputeForm(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Problem with job or delivery? Raise a Dispute
                    </button>
                  ) : (
                    <form
                      onSubmit={handleRaiseDispute}
                      className="border border-red-200 bg-red-50/40 rounded-lg p-4 space-y-3"
                    >
                      <h4 className="text-xs font-bold text-red-900">
                        Raise Dispute (Freezes Escrow Until Admin Decision)
                      </h4>
                      <textarea
                        required
                        rows={2}
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        placeholder="Describe the dispute clearly..."
                        className="w-full px-3 py-2 text-xs bg-white border border-red-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={disputeEvidence}
                        onChange={(e) => setDisputeEvidence(e.target.value)}
                        placeholder="Optional evidence URL or screenshot link"
                        className="w-full px-3 py-2 text-xs bg-white border border-red-200 rounded-lg"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                        >
                          Submit Dispute to Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDisputeForm(false)}
                          className="px-3 py-2 text-xs font-medium text-slate-600 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

            {/* Ratings & Reviews (Only on Completed Jobs) */}
            {canRate && (
              <form
                onSubmit={handleSubmitReview}
                className="border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  Rate {isPoster ? job.workerName : job.posterName}
                </h3>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRatingValue(n)}
                      className="p-1 cursor-pointer"
                      aria-label={`Rate ${n} stars`}
                    >
                      <Star
                        className={`w-5 h-5 ${
                          n <= ratingValue ? 'fill-amber-500 text-amber-500' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-mono text-slate-600">{ratingValue}/5</span>
                </div>
                <textarea
                  required
                  rows={2}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share a brief review of collaboration and quality..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Submit Rating & Review
                </button>
              </form>
            )}
          </div>

          {/* Right Column: In-App Chat (SRS 7.1) */}
          <div className="lg:col-span-5 border border-slate-200 rounded-lg flex flex-col h-[460px] bg-slate-50">
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-900">Job Chat</span>
              </div>
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Archived for disputes
              </span>
            </div>

            {!chatEnabled ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  {job.workerId
                    ? 'Chat is restricted to the Job Poster and assigned Worker.'
                    : 'Chat unlocks automatically once a Job Seeker accepts this task.'}
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Keep all instructions, file links, and feedback inside Instant Job for full escrow coverage.
                </p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
                  Safety rule: Never share personal phone numbers, UPI IDs, or pay outside Instant Job.
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      No messages yet. Say hello to coordinate task details.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === currentUser?.uid;
                      return (
                        <div
                          key={m.messageId}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                              mine
                                ? 'bg-blue-700 text-white'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <p className={`text-[10px] font-semibold mb-0.5 ${mine ? 'text-blue-100' : 'text-slate-500'}`}>
                              {m.senderName}
                            </p>
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            {m.attachmentUrl && (
                              <a
                                href={m.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-1 inline-flex items-center gap-1 underline break-all ${
                                  mine ? 'text-blue-100' : 'text-blue-700'
                                }`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Attachment
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendChat} className="p-3 bg-white border-t border-slate-200 space-y-2">
                  {offPlatformWarning && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-800">
                      {offPlatformWarning}
                    </div>
                  )}
                  <input
                    type="text"
                    value={chatAttachment}
                    onChange={(e) => setChatAttachment(e.target.value)}
                    placeholder="Optional file/image URL..."
                    className="w-full px-2.5 py-1.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-700"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Write a message..."
                      className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                    />
                    <button
                      type="submit"
                      disabled={!chatText.trim()}
                      aria-label="Send message"
                      className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
