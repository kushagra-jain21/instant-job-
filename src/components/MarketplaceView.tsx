import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import {
  formatINR,
  Job,
  JOB_CATEGORIES,
  JobCategory,
  UserPublic,
} from '../types/instantJob';
import { JobStatusText } from './StatusText';

interface MarketplaceViewProps {
  jobs: Job[];
  loading: boolean;
  currentUser: UserPublic | null;
  onSelectJob: (job: Job) => void;
  onOpenPostJob: () => void;
  onSignIn: () => void;
}

type BudgetBand = 'all' | 'micro' | 'mid' | 'high';
type DeadlineBand = 'all' | 'urgent' | 'week';
type SortOption = 'newest' | 'highest' | 'deadline';

export function MarketplaceView({
  jobs,
  loading,
  currentUser,
  onSelectJob,
  onOpenPostJob,
  onSignIn,
}: MarketplaceViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | JobCategory>('all');
  const [budgetBand, setBudgetBand] = useState<BudgetBand>('all');
  const [deadlineBand, setDeadlineBand] = useState<DeadlineBand>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const openJobs = useMemo(() => {
    const now = Date.now();
    const filtered = jobs.filter((job) => {
      if (job.status !== 'open') return false;
      if (categoryFilter !== 'all' && job.category !== categoryFilter) return false;
      if (budgetBand === 'micro' && job.amount > 500) return false;
      if (budgetBand === 'mid' && (job.amount <= 500 || job.amount > 5000)) return false;
      if (budgetBand === 'high' && job.amount <= 5000) return false;

      if (deadlineBand !== 'all') {
        const dueMs = Date.parse(job.deadline);
        if (!Number.isNaN(dueMs)) {
          const diffHours = (dueMs - now) / (1000 * 60 * 60);
          if (deadlineBand === 'urgent' && diffHours > 48) return false;
          if (deadlineBand === 'week' && diffHours > 24 * 7) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${job.title} ${job.description} ${job.category} ${job.posterName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'highest') return b.amount - a.amount;
      if (sortBy === 'deadline') return Date.parse(a.deadline) - Date.parse(b.deadline);
      const aSec = a.createdAt?.seconds || 0;
      const bSec = b.createdAt?.seconds || 0;
      return bSec - aSec;
    });
  }, [jobs, categoryFilter, budgetBand, deadlineBand, searchQuery, sortBy]);

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wide text-blue-700">
                Escrow-Protected Task Marketplace · India
              </p>
              <h1
                className="font-display font-bold text-slate-900 tracking-tight leading-[1.12] max-w-2xl"
                style={{ fontSize: 'clamp(2rem, 3.6vw, 3.25rem)', textWrap: 'balance' }}
              >
                Post any task from ₹1 to ₹1,00,000 and pay only after approval.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                Whether you need a document typed, a poster designed, a software bug fixed, or a local parcel delivered, Instant Job locks the payment in escrow before work begins and releases it to the worker upon completion.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={onOpenPostJob}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Post a Job Now
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign In to Post or Accept Jobs
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <a
                href="#open-tasks"
                className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Browse Open Tasks
              </a>
            </div>
          </div>

          {/* Right visual panel: Escrow lifecycle schematic */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900">Escrow Transaction Flow</span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">₹1 – ₹1,00,000</span>
            </div>

            <ol className="space-y-4 my-5">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                  01
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Poster Funds Escrow</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Job amount is held safely by Instant Job via UPI, card, or net banking before listing goes live.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                  02
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">One-Click Exclusive Lock</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    First qualified Job Seeker locks the task atomically. In-app chat unlocks immediately.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                  03
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Submit, Review & Auto-Release</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Worker submits finished work. Poster approves and net payout moves to worker wallet for UPI or bank withdrawal.
                  </p>
                </div>
              </li>
            </ol>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                Dispute protection active on every job
              </span>
              <span className="font-mono tabular-nums">5% fee ≥ ₹20</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Platform Guarantees Strip */}
      <section
        id="safety-guarantees"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Supported Job Range</p>
          <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₹1 – ₹1,00,000
          </p>
          <p className="text-xs text-slate-600 mt-2">
            From quick typing errands to full project deliverables.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Payment Custody</p>
          <p className="text-xl font-bold text-slate-900 mt-1">100% Held Escrow</p>
          <p className="text-xs text-slate-600 mt-2">
            Funds are never released until work is approved or dispute resolved.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Acceptance Concurrency</p>
          <p className="text-xl font-bold text-slate-900 mt-1">Single-Worker Lock</p>
          <p className="text-xs text-slate-600 mt-2">
            Atomic transactions stop two workers from claiming the same task.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Payout Channels</p>
          <p className="text-xl font-bold text-slate-900 mt-1">UPI & Bank Transfer</p>
          <p className="text-xs text-slate-600 mt-2">
            KYC verified withdrawals for high-value tasks and large payouts.
          </p>
        </div>
      </section>

      {/* Open Tasks Marketplace */}
      <section id="open-tasks" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
              Available Jobs
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Browse funded tasks ready for instant one-click acceptance.
            </p>
          </div>
          <p className="text-sm font-mono tabular-nums text-slate-600">
            {openJobs.length} {openJobs.length === 1 ? 'task' : 'tasks'} open
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, skill, or poster..."
                className="w-full pl-10 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="md:col-span-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | JobCategory)}
                aria-label="Filter by category"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              >
                <option value="all">All Categories</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={deadlineBand}
                onChange={(e) => setDeadlineBand(e.target.value as DeadlineBand)}
                aria-label="Filter by deadline"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              >
                <option value="all">Any Deadline</option>
                <option value="urgent">Due in 48 hrs</option>
                <option value="week">Due this week</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort jobs"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              >
                <option value="newest">Newest First</option>
                <option value="highest">Highest Budget</option>
                <option value="deadline">Earliest Deadline</option>
              </select>
            </div>
          </div>

          {/* Segmented Budget Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'All Budgets'],
                  ['micro', '₹1 – ₹500'],
                  ['mid', '₹501 – ₹5,000'],
                  ['high', '₹5,001 – ₹1,00,000'],
                ] as [BudgetBand, string][]
              ).map(([band, label]) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setBudgetBand(band)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    budgetBand === band
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(searchQuery || categoryFilter !== 'all' || budgetBand !== 'all' || deadlineBand !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setBudgetBand('all');
                  setDeadlineBand('all');
                }}
                className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Job List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-4">
                <div className="h-5 w-2/3 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-100 rounded" />
                <div className="h-4 w-1/2 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : openJobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <p className="text-base font-semibold text-slate-900">
              No open jobs match your current filters.
            </p>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Try clearing your filters or post a new task with a fixed escrow budget from ₹1 to ₹1,00,000.
            </p>
            <button
              type="button"
              onClick={currentUser ? onOpenPostJob : onSignIn}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {currentUser ? 'Post the First Job' : 'Sign In to Post a Job'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openJobs.map((job) => {
              const isOwn = currentUser?.uid === job.posterId;
              return (
                <article
                  key={job.jobId}
                  className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-bold text-slate-900 font-display leading-snug">
                        {job.title}
                      </h3>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                          {formatINR(job.amount)}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Net {formatINR(job.netPayout)}
                        </p>
                      </div>
                    </div>

                    {/* Clean unboxed metadata with typographic separators */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{job.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Due {job.deadline}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        {job.posterName}
                        {job.posterRating > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-slate-700 font-mono tabular-nums">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            {job.posterRating.toFixed(1)}
                          </span>
                        )}
                      </span>
                      {job.posterVerified && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                      {job.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <JobStatusText status={job.status} />
                    <button
                      type="button"
                      onClick={() => onSelectJob(job)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isOwn ? 'Manage Job' : 'View & Accept'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* How It Works & FAQ Sections */}
      <section
        id="how-escrow-works"
        className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
      >
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 font-display">
            01. End-to-End Accountability
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Every step from posting to UPI withdrawal is recorded in a shared ledger so neither Job Poster nor Job Seeker carries payment risk.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Transparent Fee Summary</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Before paying, the Job Poster sees the exact budget, platform fee (5% on tasks ₹20+, ₹0 below ₹20), and worker net payout.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Protected In-App Chat</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Poster and worker coordinate files and revisions inside Instant Job. Chat transcripts remain archived for admin dispute resolution.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">KYC & High-Value Safety</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Tasks of ₹10,000+ and withdrawals of ₹5,000+ verify user identity via PAN or Aadhaar to prevent fraud and fake accounts.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900">
            Can one account both post and accept jobs?
          </h3>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            Yes. Every registered user can act as both a Job Poster and a Job Seeker, though you cannot accept a job that you posted yourself.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900">
            What happens if there is a disagreement on submitted work?
          </h3>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            Either party can raise a dispute. Escrow stays frozen while an administrator reviews the job brief, chat history, and submission to release, refund, or split the amount.
          </p>
        </div>
      </section>
    </div>
  );
}
