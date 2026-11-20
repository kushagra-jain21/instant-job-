import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  calculateJobFees,
  generateSafeId,
  Job,
  JobCategory,
  KYC_JOB_THRESHOLD,
  KYC_WITHDRAWAL_THRESHOLD,
  MAX_JOB_AMOUNT,
  MIN_JOB_AMOUNT,
  Payment,
  PaymentMethod,
  UserPrivate,
  UserPublic,
} from '../types/instantJob';

async function createNotification(params: {
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
}) {
  const notifId = generateSafeId('ntf');
  const path = `notifications/${notifId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      notifId,
      recipientId: params.recipientId,
      type: params.type,
      title: params.title.slice(0, 120),
      message: params.message.slice(0, 400),
      jobId: params.jobId ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

async function createAuditLog(params: {
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}) {
  const logId = generateSafeId('log');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      logId,
      actorId: params.actorId,
      actorName: params.actorName.slice(0, 100),
      action: params.action.slice(0, 100),
      entityType: params.entityType.slice(0, 40),
      entityId: params.entityId,
      summary: params.summary.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function ensureUserProfiles(user: FirebaseUser): Promise<{
  publicProfile: UserPublic;
  privateProfile: UserPrivate;
}> {
  const pubRef = doc(db, 'users', user.uid);
  const privRef = doc(db, 'users', user.uid, 'private', 'profile');

  try {
    const [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Instant Job User').slice(0, 100);

    if (!pubSnap.exists()) {
      await setDoc(pubRef, {
        uid: user.uid,
        displayName,
        bio: '',
        ratingAvg: 0,
        ratingCount: 0,
        completedJobsCount: 0,
        kycVerified: false,
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 160),
        mobile: '',
        mobileVerified: false,
        upiId: '',
        bankAccountLast4: '',
        bankIfsc: '',
        kycStatus: 'none',
        kycDocType: '',
        kycDocLast4: '',
        preferredMode: 'both',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const [freshPub, freshPriv] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
    return {
      publicProfile: freshPub.data() as UserPublic,
      privateProfile: freshPriv.data() as UserPrivate,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updateProfileSettings(params: {
  uid: string;
  displayName: string;
  bio: string;
  mobile: string;
  mobileVerified: boolean;
  upiId: string;
  bankAccountLast4: string;
  bankIfsc: string;
  preferredMode: 'both' | 'poster' | 'seeker';
}) {
  const pubRef = doc(db, 'users', params.uid);
  const privRef = doc(db, 'users', params.uid, 'private', 'profile');
  try {
    await updateDoc(pubRef, {
      displayName: params.displayName.trim().slice(0, 100),
      bio: params.bio.trim().slice(0, 400),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(privRef, {
      mobile: params.mobile.trim().slice(0, 20),
      mobileVerified: params.mobileVerified,
      upiId: params.upiId.trim().slice(0, 100),
      bankAccountLast4: params.bankAccountLast4.trim().slice(0, 8),
      bankIfsc: params.bankIfsc.trim().toUpperCase().slice(0, 20),
      preferredMode: params.preferredMode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}`);
  }
}

export async function submitKycVerification(params: {
  uid: string;
  docType: string;
  docLast4: string;
}) {
  const privRef = doc(db, 'users', params.uid, 'private', 'profile');
  try {
    await updateDoc(privRef, {
      kycStatus: 'pending',
      kycDocType: params.docType.slice(0, 40),
      kycDocLast4: params.docLast4.slice(0, 12),
      updatedAt: serverTimestamp(),
    });
    await createAuditLog({
      actorId: params.uid,
      actorName: params.uid,
      action: 'KYC_SUBMITTED',
      entityType: 'user',
      entityId: params.uid,
      summary: `Submitted ${params.docType} (ending ${params.docLast4}) for KYC review.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}/private/profile`);
  }
}

export async function createJobWithEscrow(params: {
  poster: UserPublic;
  title: string;
  description: string;
  category: JobCategory;
  amount: number;
  deadline: string;
  attachments: string[];
  paymentMethod: PaymentMethod;
  simulateFailure?: boolean;
}): Promise<{ jobId: string; paymentId: string }> {
  if (params.poster.accountStatus === 'blocked') {
    throw new Error('Your account is currently suspended from posting jobs.');
  }
  if (!Number.isFinite(params.amount) || params.amount < MIN_JOB_AMOUNT || params.amount > MAX_JOB_AMOUNT) {
    throw new Error(`Job amount must be strictly between ₹${MIN_JOB_AMOUNT} and ₹1,00,000.`);
  }

  const cleanTitle = params.title.trim();
  const cleanDesc = params.description.trim();
  if (cleanTitle.length < 3 || cleanTitle.length > 120) {
    throw new Error('Job title must be between 3 and 120 characters.');
  }
  if (cleanDesc.length < 10 || cleanDesc.length > 3000) {
    throw new Error('Job description must be between 10 and 3,000 characters.');
  }

  const jobId = generateSafeId('job');
  const fees = calculateJobFees(params.amount);

  if (params.simulateFailure) {
    const failedPayId = generateSafeId('payfail');
    try {
      await setDoc(doc(db, 'payments', failedPayId), {
        paymentId: failedPayId,
        jobId,
        posterId: params.poster.uid,
        workerId: null,
        amount: fees.amount,
        platformFee: fees.platformFee,
        netPayout: fees.netPayout,
        workerPayout: 0,
        posterRefund: 0,
        paymentMethod: params.paymentMethod,
        status: 'failed',
        refundStatus: 'none',
        refundReason: 'Simulated gateway interruption / bank timeout.',
        gatewayRef: `FAIL_${Date.now()}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `payments/${failedPayId}`);
    }
    throw new Error(
      'Payment attempt failed due to a gateway interruption. This attempt has been logged and no job was published. Please retry.'
    );
  }

  const paymentId = `pay_${jobId}`;
  const cleanAttachments = params.attachments
    .map((s) => s.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 5);

  const batch = writeBatch(db);
  batch.set(doc(db, 'jobs', jobId), {
    jobId,
    posterId: params.poster.uid,
    posterName: params.poster.displayName.slice(0, 100),
    posterRating: params.poster.ratingAvg || 0,
    posterVerified: Boolean(params.poster.kycVerified),
    workerId: null,
    workerName: null,
    title: cleanTitle,
    description: cleanDesc,
    category: params.category,
    amount: fees.amount,
    platformFee: fees.platformFee,
    netPayout: fees.netPayout,
    deadline: params.deadline.slice(0, 40),
    attachments: cleanAttachments,
    status: 'open',
    paymentStatus: 'held',
    posterRated: false,
    workerRated: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'payments', paymentId), {
    paymentId,
    jobId,
    posterId: params.poster.uid,
    workerId: null,
    amount: fees.amount,
    platformFee: fees.platformFee,
    netPayout: fees.netPayout,
    workerPayout: 0,
    posterRefund: 0,
    paymentMethod: params.paymentMethod,
    status: 'held',
    refundStatus: 'none',
    gatewayRef: `ESC_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await createNotification({
      recipientId: params.poster.uid,
      type: 'job_posted',
      title: 'Job published & escrow funded',
      message: `"${cleanTitle}" is now live with ₹${fees.amount.toLocaleString('en-IN')} held safely in escrow.`,
      jobId,
    });
    await createAuditLog({
      actorId: params.poster.uid,
      actorName: params.poster.displayName,
      action: 'JOB_POSTED',
      entityType: 'job',
      entityId: jobId,
      summary: `Posted "${cleanTitle}" for ₹${fees.amount} via ${params.paymentMethod.toUpperCase()}.`,
    });
    return { jobId, paymentId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `jobs/${jobId}`);
  }
}

export async function updateOpenJob(params: {
  jobId: string;
  title: string;
  description: string;
  category: JobCategory;
  deadline: string;
  attachments: string[];
}) {
  try {
    await updateDoc(doc(db, 'jobs', params.jobId), {
      title: params.title.trim().slice(0, 120),
      description: params.description.trim().slice(0, 3000),
      category: params.category,
      deadline: params.deadline.slice(0, 40),
      attachments: params.attachments.map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 5),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.jobId}`);
  }
}

export async function cancelOpenJobWithRefund(params: {
  job: Job;
  actorName: string;
  reason?: string;
}) {
  const jobRef = doc(db, 'jobs', params.job.jobId);
  const payRef = doc(db, 'payments', `pay_${params.job.jobId}`);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists()) throw new Error('Job not found.');
      const current = snap.data() as Job;
      if (current.status !== 'open') {
        throw new Error('Only open jobs before acceptance can be cancelled directly for an instant refund.');
      }
      tx.update(jobRef, {
        status: 'cancelled',
        paymentStatus: 'refunded',
        updatedAt: serverTimestamp(),
      });
      tx.update(payRef, {
        status: 'refunded',
        refundStatus: 'completed',
        refundReason: (params.reason || 'Cancelled by Job Poster prior to acceptance.').slice(0, 400),
        posterRefund: current.amount,
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: params.job.posterId,
      type: 'payment_released',
      title: 'Job cancelled & full refund processed',
      message: `₹${params.job.amount.toLocaleString('en-IN')} for "${params.job.title}" has been refunded.`,
      jobId: params.job.jobId,
    });
    await createAuditLog({
      actorId: params.job.posterId,
      actorName: params.actorName,
      action: 'JOB_CANCELLED_REFUNDED',
      entityType: 'job',
      entityId: params.job.jobId,
      summary: `Cancelled open job "${params.job.title}" and refunded ₹${params.job.amount}.`,
    });
  } catch (err) {
    if (err instanceof Error && !err.message.includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.job.jobId}`);
  }
}

export async function acceptJobAtomically(params: {
  jobId: string;
  worker: UserPublic;
}) {
  if (params.worker.accountStatus === 'blocked') {
    throw new Error('Your account is currently blocked from accepting jobs.');
  }
  const jobRef = doc(db, 'jobs', params.jobId);
  const payRef = doc(db, 'payments', `pay_${params.jobId}`);

  let acceptedJob: Job | null = null;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists()) {
        throw new Error('Job no longer exists.');
      }
      const current = snap.data() as Job;
      if (current.posterId === params.worker.uid) {
        throw new Error('You cannot accept a job that you posted yourself.');
      }
      if (current.status !== 'open' || current.workerId) {
        throw new Error('This job has already been accepted by another worker.');
      }
      if (current.amount >= KYC_JOB_THRESHOLD && !params.worker.kycVerified) {
        throw new Error(
          `Jobs of ₹${KYC_JOB_THRESHOLD.toLocaleString('en-IN')} or more require KYC verification. Complete KYC in your Profile first.`
        );
      }
      acceptedJob = current;
      tx.update(jobRef, {
        workerId: params.worker.uid,
        workerName: params.worker.displayName.slice(0, 100),
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(payRef, {
        workerId: params.worker.uid,
        updatedAt: serverTimestamp(),
      });
    });

    if (acceptedJob) {
      const jobData = acceptedJob as Job;
      await createNotification({
        recipientId: jobData.posterId,
        type: 'job_accepted',
        title: 'Your job has been accepted',
        message: `${params.worker.displayName} accepted "${jobData.title}". Chat is now open.`,
        jobId: jobData.jobId,
      });
      await createAuditLog({
        actorId: params.worker.uid,
        actorName: params.worker.displayName,
        action: 'JOB_ACCEPTED',
        entityType: 'job',
        entityId: jobData.jobId,
        summary: `${params.worker.displayName} locked "${jobData.title}" (₹${jobData.amount}).`,
      });
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('already been accepted') ||
        err.message.includes('cannot accept') ||
        err.message.includes('require KYC') ||
        err.message.includes('blocked'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.jobId}`);
  }
}

export async function submitJobWork(params: {
  job: Job;
  workerName: string;
  submissionMessage: string;
  submissionLinks: string[];
}) {
  const cleanMsg = params.submissionMessage.trim();
  if (cleanMsg.length < 3) {
    throw new Error('Please include a brief summary of your completed work.');
  }
  const cleanLinks = params.submissionLinks
    .map((s) => s.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 5);

  try {
    await updateDoc(doc(db, 'jobs', params.job.jobId), {
      status: 'submitted',
      submissionMessage: cleanMsg.slice(0, 2000),
      submissionLinks: cleanLinks,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: params.job.posterId,
      type: 'work_submitted',
      title: 'Work submitted for review',
      message: `${params.workerName} submitted completed work for "${params.job.title}". Review and approve to release ₹${params.job.netPayout.toLocaleString('en-IN')}.`,
      jobId: params.job.jobId,
    });
    await createAuditLog({
      actorId: params.job.workerId || '',
      actorName: params.workerName,
      action: 'WORK_SUBMITTED',
      entityType: 'job',
      entityId: params.job.jobId,
      summary: `Submitted work for "${params.job.title}".`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.job.jobId}`);
  }
}

export async function requestJobChanges(params: {
  job: Job;
  posterName: string;
  note: string;
}) {
  const cleanNote = params.note.trim();
  if (cleanNote.length < 3) {
    throw new Error('Please explain what changes are needed.');
  }
  try {
    await updateDoc(doc(db, 'jobs', params.job.jobId), {
      status: 'changes_requested',
      changeRequestNote: cleanNote.slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
    if (params.job.workerId) {
      await createNotification({
        recipientId: params.job.workerId,
        type: 'changes_requested',
        title: 'Changes requested on submission',
        message: `${params.posterName} requested revisions on "${params.job.title}": ${cleanNote.slice(0, 160)}`,
        jobId: params.job.jobId,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.job.jobId}`);
  }
}

export async function approveAndReleaseEscrow(params: {
  job: Job;
  posterName: string;
}) {
  if (!params.job.workerId) {
    throw new Error('No worker assigned to this job.');
  }
  const jobRef = doc(db, 'jobs', params.job.jobId);
  const payRef = doc(db, 'payments', `pay_${params.job.jobId}`);
  const workerRef = doc(db, 'users', params.job.workerId);

  try {
    await runTransaction(db, async (tx) => {
      const [jobSnap, paySnap, workerSnap] = await Promise.all([
        tx.get(jobRef),
        tx.get(payRef),
        tx.get(workerRef),
      ]);
      if (!jobSnap.exists() || !paySnap.exists()) {
        throw new Error('Job or escrow payment record missing.');
      }
      const currentJob = jobSnap.data() as Job;
      const currentPay = paySnap.data() as Payment;
      if (currentJob.status !== 'submitted') {
        throw new Error('Job must be in submitted state before approval.');
      }
      if (currentPay.status !== 'held') {
        throw new Error('Escrow payment has already been settled.');
      }

      tx.update(jobRef, {
        status: 'completed',
        paymentStatus: 'released',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(payRef, {
        status: 'released',
        workerPayout: currentPay.netPayout,
        updatedAt: serverTimestamp(),
      });
      if (workerSnap.exists()) {
        const wData = workerSnap.data() as UserPublic;
        tx.update(workerRef, {
          completedJobsCount: (wData.completedJobsCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      }
    });

    await createNotification({
      recipientId: params.job.workerId,
      type: 'payment_released',
      title: `₹${params.job.netPayout.toLocaleString('en-IN')} released to your wallet`,
      message: `${params.posterName} approved "${params.job.title}". Net payout credited after ₹${params.job.platformFee} platform fee.`,
      jobId: params.job.jobId,
    });
    await createAuditLog({
      actorId: params.job.posterId,
      actorName: params.posterName,
      action: 'PAYMENT_RELEASED',
      entityType: 'payment',
      entityId: `pay_${params.job.jobId}`,
      summary: `Approved "${params.job.title}" and released ₹${params.job.netPayout} to worker.`,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already been settled')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.job.jobId}`);
  }
}

export async function sendChatMessage(params: {
  job: Job;
  senderId: string;
  senderName: string;
  text: string;
  attachmentUrl?: string;
}) {
  if (!params.job.workerId) {
    throw new Error('Chat is available after a worker accepts the job.');
  }
  const cleanText = params.text.trim();
  if (!cleanText) return;
  const messageId = generateSafeId('msg');
  const path = `jobs/${params.job.jobId}/messages/${messageId}`;
  try {
    await setDoc(doc(db, 'jobs', params.job.jobId, 'messages', messageId), {
      messageId,
      jobId: params.job.jobId,
      posterId: params.job.posterId,
      workerId: params.job.workerId,
      senderId: params.senderId,
      senderName: params.senderName.slice(0, 100),
      text: cleanText.slice(0, 2000),
      attachmentUrl: params.attachmentUrl?.trim().slice(0, 500) || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function submitJobReview(params: {
  job: Job;
  reviewer: UserPublic;
  revieweeId: string;
  role: 'poster' | 'worker';
  rating: number;
  comment: string;
}) {
  if (params.job.status !== 'completed') {
    throw new Error('Ratings are only allowed after the job is completed.');
  }
  const cleanComment = params.comment.trim();
  if (cleanComment.length < 2) {
    throw new Error('Please write a short review comment.');
  }
  const reviewId = generateSafeId('rev');
  const jobRef = doc(db, 'jobs', params.job.jobId);
  const revRef = doc(db, 'reviews', reviewId);
  const revieweeRef = doc(db, 'users', params.revieweeId);

  try {
    await runTransaction(db, async (tx) => {
      const [jobSnap, targetSnap] = await Promise.all([tx.get(jobRef), tx.get(revieweeRef)]);
      if (!jobSnap.exists()) throw new Error('Job not found.');
      const currentJob = jobSnap.data() as Job;
      if (currentJob.status !== 'completed') {
        throw new Error('Ratings are only allowed on completed jobs.');
      }
      if (params.role === 'poster' && currentJob.posterRated) {
        throw new Error('You have already rated this job.');
      }
      if (params.role === 'worker' && currentJob.workerRated) {
        throw new Error('You have already rated this job.');
      }

      tx.set(revRef, {
        reviewId,
        jobId: params.job.jobId,
        reviewerId: params.reviewer.uid,
        reviewerName: params.reviewer.displayName.slice(0, 100),
        revieweeId: params.revieweeId,
        role: params.role,
        rating: Math.min(5, Math.max(1, Math.round(params.rating))),
        comment: cleanComment.slice(0, 500),
        removed: false,
        createdAt: serverTimestamp(),
      });

      tx.update(jobRef, {
        ...(params.role === 'poster' ? { posterRated: true } : { workerRated: true }),
        updatedAt: serverTimestamp(),
      });

      if (targetSnap.exists()) {
        const tData = targetSnap.data() as UserPublic;
        const oldCount = tData.ratingCount || 0;
        const oldAvg = tData.ratingAvg || 0;
        const newCount = oldCount + 1;
        const newAvg = Number(((oldAvg * oldCount + params.rating) / newCount).toFixed(2));
        tx.update(revieweeRef, {
          ratingAvg: newAvg,
          ratingCount: newCount,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already rated')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `reviews/${reviewId}`);
  }
}

export async function raiseDispute(params: {
  job: Job;
  raisedBy: UserPublic;
  reason: string;
  evidence?: string;
}) {
  if (!params.job.workerId) {
    throw new Error('Cannot raise a dispute before a worker accepts the job.');
  }
  const cleanReason = params.reason.trim();
  if (cleanReason.length < 5) {
    throw new Error('Please describe the dispute reason (at least 5 characters).');
  }
  const disputeId = generateSafeId('dsp');
  const jobRef = doc(db, 'jobs', params.job.jobId);
  const payRef = doc(db, 'payments', `pay_${params.job.jobId}`);
  const dspRef = doc(db, 'disputes', disputeId);

  try {
    await runTransaction(db, async (tx) => {
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists()) throw new Error('Job not found.');
      const current = jobSnap.data() as Job;
      if (!['accepted', 'submitted', 'changes_requested'].includes(current.status)) {
        throw new Error('Dispute cannot be opened in the current job state.');
      }
      tx.update(jobRef, {
        status: 'disputed',
        paymentStatus: 'disputed',
        updatedAt: serverTimestamp(),
      });
      tx.update(payRef, {
        status: 'disputed',
        updatedAt: serverTimestamp(),
      });
      tx.set(dspRef, {
        disputeId,
        jobId: params.job.jobId,
        jobTitle: params.job.title.slice(0, 120),
        posterId: params.job.posterId,
        workerId: params.job.workerId,
        raisedBy: params.raisedBy.uid,
        raisedByName: params.raisedBy.displayName.slice(0, 100),
        reason: cleanReason.slice(0, 1000),
        evidence: params.evidence?.trim().slice(0, 1000) || null,
        status: 'open',
        adminDecision: 'none',
        decisionNote: null,
        workerShare: 0,
        posterShare: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const counterpartyId =
      params.raisedBy.uid === params.job.posterId ? params.job.workerId : params.job.posterId;
    await createNotification({
      recipientId: counterpartyId,
      type: 'dispute_update',
      title: 'Dispute opened — payment held',
      message: `${params.raisedBy.displayName} raised a dispute on "${params.job.title}". Payment remains safely held pending Admin review.`,
      jobId: params.job.jobId,
    });
    await createAuditLog({
      actorId: params.raisedBy.uid,
      actorName: params.raisedBy.displayName,
      action: 'DISPUTE_OPENED',
      entityType: 'dispute',
      entityId: disputeId,
      summary: `Opened dispute on "${params.job.title}": ${cleanReason.slice(0, 120)}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `disputes/${disputeId}`);
  }
}

export async function requestWithdrawal(params: {
  user: UserPublic;
  privateProfile: UserPrivate;
  availableBalance: number;
  amount: number;
  method: 'upi' | 'bank';
  destination: string;
  idempotencyKey: string;
}) {
  const cleanAmount = Math.round(params.amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount < 1) {
    throw new Error('Minimum withdrawal amount is ₹1.');
  }
  if (cleanAmount > params.availableBalance) {
    throw new Error(`Insufficient wallet balance. Available: ₹${params.availableBalance.toLocaleString('en-IN')}.`);
  }
  if (cleanAmount >= KYC_WITHDRAWAL_THRESHOLD && !params.user.kycVerified) {
    throw new Error(
      `Withdrawals of ₹${KYC_WITHDRAWAL_THRESHOLD.toLocaleString('en-IN')} or more require KYC verification.`
    );
  }
  const cleanDest = params.destination.trim();
  if (cleanDest.length < 3) {
    throw new Error('Please provide a valid UPI ID or Bank Account destination.');
  }

  const withdrawalId = `wd_${params.idempotencyKey}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  const wdRef = doc(db, 'withdrawals', withdrawalId);

  try {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(wdRef);
      if (existing.exists()) {
        throw new Error('Duplicate withdrawal request blocked. This payout was already submitted.');
      }
      tx.set(wdRef, {
        withdrawalId,
        userId: params.user.uid,
        amount: cleanAmount,
        method: params.method,
        destination: cleanDest.slice(0, 120),
        status: cleanAmount >= KYC_WITHDRAWAL_THRESHOLD ? 'pending' : 'completed',
        idempotencyKey: params.idempotencyKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: params.user.uid,
      type: 'withdrawal',
      title: `Withdrawal of ₹${cleanAmount.toLocaleString('en-IN')} ${cleanAmount >= KYC_WITHDRAWAL_THRESHOLD ? 'queued' : 'completed'}`,
      message: `Destination: ${cleanDest} (${params.method.toUpperCase()}).`,
      jobId: null,
    });
    await createAuditLog({
      actorId: params.user.uid,
      actorName: params.user.displayName,
      action: 'WITHDRAWAL_REQUESTED',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      summary: `Requested ₹${cleanAmount} withdrawal via ${params.method.toUpperCase()} to ${cleanDest}.`,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Duplicate withdrawal')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `withdrawals/${withdrawalId}`);
  }
}

export async function markNotificationRead(notifId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

// --- Admin Operations ---
export async function adminResolveDispute(params: {
  admin: UserPublic;
  disputeId: string;
  jobId: string;
  decision: 'release_worker' | 'refund_poster' | 'split';
  workerShare: number;
  posterShare: number;
  decisionNote: string;
}) {
  const dspRef = doc(db, 'disputes', params.disputeId);
  const jobRef = doc(db, 'jobs', params.jobId);
  const payRef = doc(db, 'payments', `pay_${params.jobId}`);

  try {
    let posterId = '';
    let workerId = '';
    let jobTitle = '';

    await runTransaction(db, async (tx) => {
      const [dspSnap, jobSnap, paySnap] = await Promise.all([
        tx.get(dspRef),
        tx.get(jobRef),
        tx.get(payRef),
      ]);
      if (!dspSnap.exists() || !jobSnap.exists() || !paySnap.exists()) {
        throw new Error('Dispute, job, or payment record not found.');
      }
      const jobData = jobSnap.data() as Job;
      posterId = jobData.posterId;
      workerId = jobData.workerId || '';
      jobTitle = jobData.title;

      const payStatus =
        params.decision === 'release_worker'
          ? 'released'
          : params.decision === 'refund_poster'
            ? 'refunded'
            : 'split';
      const jobStatus = params.decision === 'refund_poster' ? 'cancelled' : 'completed';

      tx.update(dspRef, {
        status: 'resolved',
        adminDecision: params.decision,
        decisionNote: params.decisionNote.trim().slice(0, 1000),
        workerShare: params.workerShare,
        posterShare: params.posterShare,
        updatedAt: serverTimestamp(),
      });
      tx.update(jobRef, {
        status: jobStatus,
        paymentStatus: payStatus,
        completedAt: jobStatus === 'completed' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
      tx.update(payRef, {
        status: payStatus,
        workerPayout: params.workerShare,
        posterRefund: params.posterShare,
        refundStatus: params.posterShare > 0 ? 'completed' : 'none',
        refundReason: params.posterShare > 0 ? `Admin dispute decision: ${params.decisionNote}` : null,
        updatedAt: serverTimestamp(),
      });
    });

    await Promise.all([
      createNotification({
        recipientId: posterId,
        type: 'dispute_update',
        title: 'Dispute resolved by Admin',
        message: `Decision for "${jobTitle}": Worker ₹${params.workerShare.toLocaleString('en-IN')}, Poster Refund ₹${params.posterShare.toLocaleString('en-IN')}.`,
        jobId: params.jobId,
      }),
      workerId
        ? createNotification({
            recipientId: workerId,
            type: 'dispute_update',
            title: 'Dispute resolved by Admin',
            message: `Decision for "${jobTitle}": Worker ₹${params.workerShare.toLocaleString('en-IN')}, Poster Refund ₹${params.posterShare.toLocaleString('en-IN')}.`,
            jobId: params.jobId,
          })
        : Promise.resolve(),
      createAuditLog({
        actorId: params.admin.uid,
        actorName: params.admin.displayName,
        action: 'ADMIN_DISPUTE_RESOLVED',
        entityType: 'dispute',
        entityId: params.disputeId,
        summary: `Resolved dispute (${params.decision}): Worker ₹${params.workerShare}, Refund ₹${params.posterShare}.`,
      }),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `disputes/${params.disputeId}`);
  }
}

export async function adminUpdateUserAccount(params: {
  admin: UserPublic;
  targetUid: string;
  accountStatus?: 'active' | 'blocked';
  kycVerified?: boolean;
  kycStatus?: 'verified' | 'rejected';
}) {
  const pubRef = doc(db, 'users', params.targetUid);
  const privRef = doc(db, 'users', params.targetUid, 'private', 'profile');
  try {
    if (params.accountStatus !== undefined) {
      await updateDoc(pubRef, {
        accountStatus: params.accountStatus,
        updatedAt: serverTimestamp(),
      });
    }
    if (params.kycVerified !== undefined && params.kycStatus !== undefined) {
      await updateDoc(pubRef, {
        kycVerified: params.kycVerified,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(privRef, {
        kycStatus: params.kycStatus,
        updatedAt: serverTimestamp(),
      });
    }
    await createAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: 'ADMIN_USER_UPDATED',
      entityType: 'user',
      entityId: params.targetUid,
      summary: `Updated user ${params.targetUid} (${params.accountStatus || params.kycStatus || 'update'}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.targetUid}`);
  }
}

export async function adminRemoveJob(params: {
  admin: UserPublic;
  job: Job;
  reason: string;
}) {
  const jobRef = doc(db, 'jobs', params.job.jobId);
  const payRef = doc(db, 'payments', `pay_${params.job.jobId}`);
  try {
    await runTransaction(db, async (tx) => {
      const paySnap = await tx.get(payRef);
      tx.update(jobRef, {
        status: 'cancelled',
        paymentStatus: 'refunded',
        updatedAt: serverTimestamp(),
      });
      if (paySnap.exists()) {
        tx.update(payRef, {
          status: 'refunded',
          refundStatus: 'completed',
          refundReason: `Admin removed job: ${params.reason.slice(0, 300)}`,
          posterRefund: params.job.amount,
          workerPayout: 0,
          updatedAt: serverTimestamp(),
        });
      }
    });
    await createNotification({
      recipientId: params.job.posterId,
      type: 'dispute_update',
      title: 'Job removed by Admin moderation',
      message: `"${params.job.title}" was removed (${params.reason}). Escrow has been refunded.`,
      jobId: params.job.jobId,
    });
    await createAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: 'ADMIN_JOB_REMOVED',
      entityType: 'job',
      entityId: params.job.jobId,
      summary: `Removed job "${params.job.title}": ${params.reason}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `jobs/${params.job.jobId}`);
  }
}

export async function adminToggleReviewRemoval(params: {
  admin: UserPublic;
  reviewId: string;
  removed: boolean;
}) {
  try {
    await updateDoc(doc(db, 'reviews', params.reviewId), {
      removed: params.removed,
    });
    await createAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: params.removed ? 'ADMIN_REVIEW_REMOVED' : 'ADMIN_REVIEW_RESTORED',
      entityType: 'review',
      entityId: params.reviewId,
      summary: `${params.removed ? 'Removed' : 'Restored'} review ${params.reviewId}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reviews/${params.reviewId}`);
  }
}

export async function adminApproveWithdrawal(params: {
  admin: UserPublic;
  withdrawalId: string;
  userId: string;
  amount: number;
  status: 'completed' | 'rejected';
}) {
  try {
    await updateDoc(doc(db, 'withdrawals', params.withdrawalId), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: params.userId,
      type: 'withdrawal',
      title: `Large withdrawal ${params.status}`,
      message: `Your withdrawal of ₹${params.amount.toLocaleString('en-IN')} has been marked ${params.status}.`,
      jobId: null,
    });
    await createAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: 'ADMIN_WITHDRAWAL_PROCESSED',
      entityType: 'withdrawal',
      entityId: params.withdrawalId,
      summary: `Marked withdrawal ₹${params.amount} as ${params.status}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `withdrawals/${params.withdrawalId}`);
  }
}

export function getNotificationsCollectionRef() {
  return collection(db, 'notifications');
}
