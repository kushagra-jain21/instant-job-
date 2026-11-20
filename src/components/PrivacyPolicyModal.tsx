import { X } from 'lucide-react';

export function PrivacyPolicyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 font-display">
            Privacy Policy, Escrow & Cancellation Rules
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close policy modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed max-h-[70vh] overflow-y-auto">
          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">1. Data Privacy & PII Isolation</h3>
            <p>
              Personal details such as your email address, verified mobile number, UPI ID, bank account details, and KYC documents are stored in an isolated private profile accessible only to you and authorized platform administrators for compliance and payout verification.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">2. Held Escrow & Platform Fees</h3>
            <p>
              Job budgets between ₹1 and ₹1,00,000 are collected when a task is posted and held in escrow until the Job Poster approves submitted work. Tasks of ₹20 or more carry a 5% platform service fee deducted upon completion; micro-tasks under ₹20 have ₹0 platform fee.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">3. Cancellation & Refund Policy</h3>
            <p>
              If a Job Poster cancels an open job before any worker accepts it, 100% of the escrowed amount is refunded immediately. Once a job is accepted, either party may raise a dispute so an administrator can inspect submitted files and archived chat logs before releasing, refunding, or splitting funds.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">4. KYC & High-Value Compliance</h3>
            <p>
              In accordance with Indian online payment guidelines, identity verification (KYC) is required before accepting high-value jobs of ₹10,000 or more and before withdrawing ₹5,000 or more.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
