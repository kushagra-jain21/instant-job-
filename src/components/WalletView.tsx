import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wallet as WalletIcon } from 'lucide-react';
import { requestWithdrawal } from '../services/instantJobService';
import {
  formatINR,
  KYC_WITHDRAWAL_THRESHOLD,
  Payment,
  UserPrivate,
  UserPublic,
  Withdrawal,
} from '../types/instantJob';

interface WalletViewProps {
  currentUser: UserPublic;
  privateProfile: UserPrivate;
  payments: Payment[];
  withdrawals: Withdrawal[];
  onGoToKyc: () => void;
}

export function WalletView({
  currentUser,
  privateProfile,
  payments,
  withdrawals,
  onGoToKyc,
}: WalletViewProps) {
  const [wdAmount, setWdAmount] = useState('');
  const [wdMethod, setWdMethod] = useState<'upi' | 'bank'>('upi');
  const [wdDestination, setWdDestination] = useState(
    privateProfile.upiId ||
      (privateProfile.bankAccountLast4 ? `A/C ****${privateProfile.bankAccountLast4} (${privateProfile.bankIfsc || 'IFSC'})` : '')
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() => `k_${Date.now()}`);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const metrics = useMemo(() => {
    let earnedGross = 0;
    let feesDeducted = 0;
    let workerEscrowHeld = 0;
    let posterEscrowFunded = 0;
    let posterRefunded = 0;

    for (const p of payments) {
      if (p.workerId === currentUser.uid) {
        if (p.status === 'released' || p.status === 'split') {
          earnedGross += p.workerPayout;
          if (p.status === 'released') {
            feesDeducted += p.platformFee;
          }
        } else if (p.status === 'held' || p.status === 'disputed') {
          workerEscrowHeld += p.netPayout;
        }
      }
      if (p.posterId === currentUser.uid) {
        if (p.status !== 'failed') {
          posterEscrowFunded += p.amount;
        }
        if (p.status === 'refunded' || p.status === 'split') {
          posterRefunded += p.posterRefund;
        }
      }
    }

    const totalWithdrawn = withdrawals
      .filter((w) => w.status !== 'rejected')
      .reduce((sum, w) => sum + w.amount, 0);

    const availableBalance = Math.max(0, earnedGross - totalWithdrawn);
    return {
      availableBalance,
      earnedGross,
      feesDeducted,
      workerEscrowHeld,
      posterEscrowFunded,
      posterRefunded,
      totalWithdrawn,
    };
  }, [payments, withdrawals, currentUser.uid]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await requestWithdrawal({
        user: currentUser,
        privateProfile,
        availableBalance: metrics.availableBalance,
        amount: Number(wdAmount),
        method: wdMethod,
        destination: wdDestination,
        idempotencyKey,
      });
      setWdAmount('');
      setIdempotencyKey(`k_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`);
      setFeedback({
        type: 'success',
        text: 'Withdrawal submitted successfully.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process withdrawal.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-display">Wallet & Payment History</h1>
        <p className="text-sm text-slate-600 mt-1">
          Track held escrow funds, net worker earnings after platform fees, refunds, and UPI or bank withdrawals.
        </p>
      </div>

      {/* 4-Column Ledger Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Available Wallet Balance</p>
          <p className="text-2xl font-bold font-mono text-emerald-700 tabular-nums mt-1">
            {formatINR(metrics.availableBalance)}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">Ready to withdraw to UPI or Bank</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Incoming Held in Escrow</p>
          <p className="text-2xl font-bold font-mono text-amber-700 tabular-nums mt-1">
            {formatINR(metrics.workerEscrowHeld)}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">Active jobs awaiting approval</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Total Platform Fees Paid</p>
          <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {formatINR(metrics.feesDeducted)}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">Across completed tasks</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Total Withdrawn</p>
          <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {formatINR(metrics.totalWithdrawn)}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            Poster Refunds: {formatINR(metrics.posterRefunded)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Withdrawal Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <WalletIcon className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900 font-display">Withdraw Earnings</h2>
          </div>

          {!currentUser.kycVerified && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5">
              <p>
                Withdrawals of ₹{KYC_WITHDRAWAL_THRESHOLD.toLocaleString('en-IN')} or more require KYC identity verification.
              </p>
              <button
                type="button"
                onClick={onGoToKyc}
                className="font-semibold underline cursor-pointer"
              >
                Complete KYC in Profile
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
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

          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Payout Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWdMethod('upi');
                    if (privateProfile.upiId) setWdDestination(privateProfile.upiId);
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                    wdMethod === 'upi'
                      ? 'border-blue-700 bg-blue-50 text-blue-900'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  UPI ID
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWdMethod('bank');
                    if (privateProfile.bankAccountLast4) {
                      setWdDestination(
                        `A/C ****${privateProfile.bankAccountLast4} (${privateProfile.bankIfsc || 'IFSC'})`
                      );
                    }
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                    wdMethod === 'bank'
                      ? 'border-blue-700 bg-blue-50 text-blue-900'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  Bank Account
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                {wdMethod === 'upi' ? 'UPI ID' : 'Bank Account & IFSC'}
              </label>
              <input
                type="text"
                required
                value={wdDestination}
                onChange={(e) => setWdDestination(e.target.value)}
                placeholder={wdMethod === 'upi' ? 'yourname@oksbi' : 'A/C 12345678 · SBIN0001234'}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Amount (₹)</label>
              <input
                type="number"
                required
                min={1}
                max={Math.max(1, metrics.availableBalance)}
                value={wdAmount}
                onChange={(e) => setWdAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || metrics.availableBalance <= 0}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Processing Payout...' : 'Withdraw Funds'}
            </button>
          </form>
        </div>

        {/* Withdrawals History */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 font-display">Withdrawal History</h2>
          {withdrawals.length === 0 ? (
            <p className="text-xs text-slate-500 py-6">No withdrawals recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4 font-semibold">Destination</th>
                    <th className="py-2.5 pr-4 font-semibold">Method</th>
                    <th className="py-2.5 pr-4 font-semibold">Status</th>
                    <th className="py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {withdrawals.map((w) => (
                    <tr key={w.withdrawalId} className="h-10">
                      <td className="py-2 pr-4 font-mono text-slate-800">{w.destination}</td>
                      <td className="py-2 pr-4 uppercase text-slate-600">{w.method}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`font-semibold ${
                            w.status === 'completed'
                              ? 'text-emerald-700'
                              : w.status === 'pending'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatINR(w.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Full Payment & Escrow Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 font-display">
          Full Escrow, Fee & Refund Ledger
        </h2>
        {payments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No escrow payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Gateway Ref</th>
                  <th className="py-2.5 pr-4 font-semibold">Role</th>
                  <th className="py-2.5 pr-4 font-semibold">Method</th>
                  <th className="py-2.5 pr-4 font-semibold">Escrow Status</th>
                  <th className="py-2.5 pr-4 font-semibold">Refund Status</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Gross</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Fee</th>
                  <th className="py-2.5 text-right font-semibold">Net / Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const isPoster = p.posterId === currentUser.uid;
                  return (
                    <tr key={p.paymentId} className="h-11">
                      <td className="py-2 pr-4 font-mono text-slate-700">{p.gatewayRef}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {isPoster ? 'Job Poster' : 'Job Seeker'}
                      </td>
                      <td className="py-2 pr-4 uppercase text-slate-600">{p.paymentMethod}</td>
                      <td className="py-2 pr-4 font-semibold text-slate-900">{p.status}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {p.refundStatus !== 'none' ? `${p.refundStatus}` : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-900">
                        {formatINR(p.amount)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-500">
                        {formatINR(p.platformFee)}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {p.posterRefund > 0 && isPoster
                          ? `+${formatINR(p.posterRefund)} refund`
                          : formatINR(p.netPayout)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
