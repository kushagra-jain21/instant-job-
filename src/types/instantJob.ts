import type { Timestamp } from 'firebase/firestore';

export const ADMIN_EMAIL = '21.jain.kushagra@gmail.com';
export const MIN_JOB_AMOUNT = 1;
export const MAX_JOB_AMOUNT = 100000;
export const KYC_JOB_THRESHOLD = 10000;
export const KYC_WITHDRAWAL_THRESHOLD = 5000;
export const PLATFORM_FEE_RATE = 0.05;

export const JOB_CATEGORIES = [
  'Document & Typing',
  'Design & Posters',
  'Tech & Bug Fix',
  'Delivery & Local',
  'Tutoring & Teaching',
  'Video & Audio',
  'Other',
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export type JobStatus =
  | 'open'
  | 'accepted'
  | 'submitted'
  | 'changes_requested'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type PaymentStatus = 'held' | 'released' | 'refunded' | 'split' | 'disputed' | 'failed';
export type PaymentMethod = 'upi' | 'card' | 'netbanking';
export type RefundStatus = 'none' | 'pending' | 'processed' | 'completed';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface UserPublic {
  uid: string;
  displayName: string;
  bio?: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedJobsCount: number;
  kycVerified: boolean;
  accountStatus: 'active' | 'blocked';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPrivate {
  uid: string;
  email: string;
  mobile: string;
  mobileVerified: boolean;
  upiId?: string | null;
  bankAccountLast4?: string | null;
  bankIfsc?: string | null;
  kycStatus: KycStatus;
  kycDocType?: string | null;
  kycDocLast4?: string | null;
  preferredMode: 'both' | 'poster' | 'seeker';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Job {
  jobId: string;
  posterId: string;
  posterName: string;
  posterRating: number;
  posterVerified: boolean;
  workerId?: string | null;
  workerName?: string | null;
  title: string;
  description: string;
  category: JobCategory;
  amount: number;
  platformFee: number;
  netPayout: number;
  deadline: string;
  attachments: string[];
  status: JobStatus;
  paymentStatus: 'held' | 'released' | 'refunded' | 'split' | 'disputed';
  submissionMessage?: string | null;
  submissionLinks?: string[] | null;
  submittedAt?: Timestamp | null;
  changeRequestNote?: string | null;
  acceptedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  posterRated: boolean;
  workerRated: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  messageId: string;
  jobId: string;
  posterId: string;
  workerId: string;
  senderId: string;
  senderName: string;
  text: string;
  attachmentUrl?: string | null;
  createdAt: Timestamp;
}

export interface Payment {
  paymentId: string;
  jobId: string;
  posterId: string;
  workerId?: string | null;
  amount: number;
  platformFee: number;
  netPayout: number;
  workerPayout: number;
  posterRefund: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  refundStatus: RefundStatus;
  refundReason?: string | null;
  gatewayRef: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Withdrawal {
  withdrawalId: string;
  userId: string;
  amount: number;
  method: 'upi' | 'bank';
  destination: string;
  status: 'pending' | 'completed' | 'rejected';
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Review {
  reviewId: string;
  jobId: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  role: 'poster' | 'worker';
  rating: number;
  comment: string;
  removed: boolean;
  createdAt: Timestamp;
}

export interface Dispute {
  disputeId: string;
  jobId: string;
  jobTitle: string;
  posterId: string;
  workerId: string;
  raisedBy: string;
  raisedByName: string;
  reason: string;
  evidence?: string | null;
  status: 'open' | 'resolved';
  adminDecision: 'none' | 'release_worker' | 'refund_poster' | 'split';
  decisionNote?: string | null;
  workerShare: number;
  posterShare: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppNotification {
  notifId: string;
  recipientId: string;
  type:
    | 'job_posted'
    | 'job_accepted'
    | 'work_submitted'
    | 'changes_requested'
    | 'payment_released'
    | 'dispute_update'
    | 'withdrawal'
    | 'deadline_reminder';
  title: string;
  message: string;
  jobId?: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface AuditLog {
  logId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: Timestamp;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function calculateJobFees(amount: number): {
  amount: number;
  platformFee: number;
  netPayout: number;
} {
  const cleanAmount = Math.round(amount);
  const rawFee = cleanAmount < 20 ? 0 : Math.round(cleanAmount * PLATFORM_FEE_RATE);
  const platformFee = Math.min(rawFee, Math.max(0, cleanAmount - 1));
  const netPayout = cleanAmount - platformFee;
  return { amount: cleanAmount, platformFee, netPayout };
}

export function detectOffPlatformContact(text: string): string | null {
  const phonePattern = /(?:\+91[\s-]?)?[6-9]\d{9}/;
  const upiPattern = /[a-zA-Z0-9._-]+@(?:okaxis|okicici|okhdfcbank|oksbi|ybl|ibl|paytm|upi|axl)/i;
  const externalPayPattern = /\b(gpay|phonepe|paytm\s*direct|whatsapp|telegram|pay\s*outside|cash\s*directly)\b/i;

  if (phonePattern.test(text)) {
    return 'Sharing personal mobile numbers is discouraged. Keep communication inside Instant Job chat for dispute protection.';
  }
  if (upiPattern.test(text)) {
    return 'Do not share personal UPI IDs or make off-platform payments. Escrow only protects payments processed through Instant Job.';
  }
  if (externalPayPattern.test(text)) {
    return 'Off-platform payments or external chat apps void Instant Job escrow protection.';
  }
  return null;
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}
