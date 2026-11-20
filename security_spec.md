# Instant Job — Security Specification & Payload TDD

## 1. Data Invariants
1. **Job Budget Bounds**: Every job `amount` must be strictly `>= 1` and `<= 100000` (Rs. 1 to Rs. 1,00,000).
2. **Single-Worker Acceptance**: A job can only transition from `open` to `accepted` when `workerId == null`, and the accepting worker cannot be `posterId`.
3. **Escrow Integrity**: A job cannot reach `completed` unless `paymentStatus` transitions to `released`, and a worker cannot unilaterally mark their own job `completed`.
4. **PII Isolation**: User email, mobile number, UPI ID, bank account, and KYC document details reside strictly in `/users/{userId}/private/{docId}`, readable and writable only by the owner or verified admin.
5. **Completed-Only Reviews**: A review can only be created when the referenced `/jobs/{jobId}` has `status == 'completed'` and the reviewer is either `posterId` or `workerId`.
6. **Master Gate Chat**: Chat messages in `/jobs/{jobId}/messages/{messageId}` require parent job existence and verify `senderId` is `posterId` or `workerId` of that job.
7. **Immutable Fields & Timestamps**: `posterId`, `createdAt`, `amount`, and `netPayout` cannot be mutated post-creation by non-admins; `createdAt` and `updatedAt` must equal `request.time`.
8. **Admin Privilege Protection**: Non-admin users cannot set `accountStatus: 'blocked'`, `kycVerified: true` on public profiles, or resolve disputes.

## 2. The "Dirty Dozen" Malicious Payloads (Must Return PERMISSION_DENIED)
1. **Out-of-Bounds Job Amount (₹0 or ₹1,50,000)**: `POST /jobs/job_1` with `amount: 0` or `amount: 150000`.
2. **Poster Self-Acceptance**: Poster updates `/jobs/job_1` setting `workerId: posterId, status: 'accepted'`.
3. **Second Worker Overwrite**: Worker C updates `/jobs/job_1` when `status` is already `'accepted'` and `workerId` is Worker B.
4. **Worker Self-Approval**: Worker B updates `/jobs/job_1` setting `status: 'completed', paymentStatus: 'released'`.
5. **Shadow Ghost Field**: User creates `/jobs/job_2` adding undeclared field `isFeatured: true` or `adminOverride: true`.
6. **PII Scraping**: User A reads `/users/userB/private/profile`.
7. **Blanket Collection Scrape**: User A queries `list /payments` without `posterId == uid` or `workerId == uid`.
8. **Premature Review**: User writes `/reviews/rev_1` referencing a job with `status: 'accepted'`.
9. **Unauthorized Chat Injection**: User C (not poster or worker) writes `/jobs/job_1/messages/msg_1`.
10. **ID Poisoning**: User writes `/jobs/<1500-char-id>` with oversized document ID.
11. **Unverified Admin Email Spoof**: Token with `email: '21.jain.kushagra@gmail.com'` and `email_verified: false`.
12. **Timestamp Backdating**: User creates `/jobs/job_3` with `createdAt: Timestamp(2020-01-01)`.
