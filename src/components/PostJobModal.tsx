import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Lock, X } from 'lucide-react';
import {
  calculateJobFees,
  formatINR,
  JOB_CATEGORIES,
  JobCategory,
  MAX_JOB_AMOUNT,
  MIN_JOB_AMOUNT,
  PaymentMethod,
  UserPublic,
} from '../types/instantJob';
import { createJobWithEscrow } from '../services/instantJobService';

interface PostJobModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onPosted: (jobId: string) => void;
}

export function PostJobModal({ currentUser, onClose, onPosted }: PostJobModalProps) {
  const defaultDeadline = useMemo(() => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<JobCategory>('Design & Posters');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [amountInput, setAmountInput] = useState('500');
  const [attachmentInput, setAttachmentInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [step, setStep] = useState<'details' | 'checkout'>('details');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsedAmount = Number(amountInput);
  const amountError = useMemo(() => {
    if (!amountInput.trim()) return 'Enter a fixed budget between ₹1 and ₹1,00,000.';
    if (!Number.isFinite(parsedAmount) || Number.isNaN(parsedAmount)) {
      return 'Job amount must be a valid number.';
    }
    if (parsedAmount < MIN_JOB_AMOUNT) {
      return `Rejected: Job amount cannot be below ₹${MIN_JOB_AMOUNT}. Instant Job supports tasks starting at ₹1.`;
    }
    if (parsedAmount > MAX_JOB_AMOUNT) {
      return `Rejected: Job amount cannot exceed ₹1,00,000 per task under platform limits.`;
    }
    return null;
  }, [amountInput, parsedAmount]);

  const fees = useMemo(() => {
    if (amountError) return { amount: 0, platformFee: 0, netPayout: 0 };
    return calculateJobFees(parsedAmount);
  }, [amountError, parsedAmount]);

  const handleProceedToCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (title.trim().length < 3) {
      setErrorMsg('Job title must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setErrorMsg('Please describe the task clearly (at least 10 characters).');
      return;
    }
    if (!deadline) {
      setErrorMsg('Please choose a deadline date.');
      return;
    }
    if (amountError) {
      setErrorMsg(amountError);
      return;
    }
    setStep('checkout');
  };

  const handleConfirmPaymentAndPost = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const attachments = attachmentInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const { jobId } = await createJobWithEscrow({
        poster: currentUser,
        title,
        description,
        category,
        amount: parsedAmount,
        deadline,
        attachments,
        paymentMethod,
        simulateFailure,
      });
      onPosted(jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process escrow payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {step === 'details' ? 'Post a New Job' : 'Confirm Escrow Summary & Pay'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Step {step === 'details' ? '1 of 2' : '2 of 2'} · Budget range ₹1 to ₹1,00,000
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {step === 'details' ? (
          <form onSubmit={handleProceedToCheckout} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Job Title</label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Design an A4 event poster or fix React checkout bug"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as JobCategory)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                >
                  {JOB_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Amount (₹1 – ₹1,00,000)
                </label>
                <input
                  type="number"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className={`w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border rounded-lg focus:outline-none ${
                    amountError ? 'border-red-400 focus:border-red-600' : 'border-slate-200 focus:border-blue-700'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Deadline</label>
                <input
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
            </div>

            {amountError && (
              <p className="text-xs font-medium text-red-700">{amountError}</p>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Task Description & Acceptance Criteria
              </label>
              <textarea
                required
                rows={4}
                maxLength={3000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain deliverables, format, and anything the worker needs to know..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Reference File / Image Links (optional, one URL per line, max 5)
              </label>
              <textarea
                rows={2}
                value={attachmentInput}
                onChange={(e) => setAttachmentInput(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            {/* Live Summary Preview */}
            {!amountError && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Escrow Deposit: </span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(fees.amount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Platform Fee: </span>
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {formatINR(fees.platformFee)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Worker Receives: </span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    {formatINR(fees.netPayout)}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(amountError)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Review Escrow Summary
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">{category} · Due {deadline}</p>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{title}</h3>
                </div>
                <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                  {formatINR(fees.amount)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Held safely in Instant Job Escrow</span>
                <span className="font-mono tabular-nums">{formatINR(fees.amount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Platform service fee (deducted upon completion)</span>
                <span className="font-mono tabular-nums">-{formatINR(fees.platformFee)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>Worker Net Payout on Approval</span>
                <span className="font-mono text-emerald-700 tabular-nums">
                  {formatINR(fees.netPayout)}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">
                Select Escrow Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['upi', 'UPI (GPay / PhonePe / BHIM)'],
                    ['card', 'Debit / Credit Card'],
                    ['netbanking', 'Net Banking'],
                  ] as [PaymentMethod, string][]
                ).map(([method, label]) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 text-left text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      paymentMethod === method
                        ? 'border-blue-700 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment interruption test toggle per SRS 6.5 & 13 */}
            <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <span>
                Simulate interrupted/failed payment attempt (logs failure safely without publishing job)
              </span>
            </label>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentAndPost}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {submitting ? (
                  'Processing Escrow...'
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Pay {formatINR(fees.amount)} & Publish Job
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              Full 100% refund if you cancel before a Job Seeker accepts your task.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
