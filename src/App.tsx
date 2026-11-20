import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  or,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { ensureUserProfiles } from './services/instantJobService';
import {
  ADMIN_EMAIL,
  AppNotification,
  Job,
  Payment,
  Review,
  UserPrivate,
  UserPublic,
  Withdrawal,
} from './types/instantJob';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppTab, TopNav } from './components/TopNav';
import { MarketplaceView } from './components/MarketplaceView';
import { MyJobsView } from './components/MyJobsView';
import { WalletView } from './components/WalletView';
import { ProfileKycView } from './components/ProfileKycView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { PostJobModal } from './components/PostJobModal';
import { JobDetailModal } from './components/JobDetailModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';

function InstantJobApp() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [publicProfile, setPublicProfile] = useState<UserPublic | null>(null);
  const [privateProfile, setPrivateProfile] = useState<UserPrivate | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('marketplace');

  // Shared Firestore state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isAdmin = Boolean(
    firebaseUser?.email === ADMIN_EMAIL && firebaseUser?.emailVerified
  );

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const { publicProfile: pub, privateProfile: priv } = await ensureUserProfiles(user);
          setPublicProfile(pub);
          setPrivateProfile(priv);
        } catch (err) {
          console.error(err);
        }
      } else {
        setPublicProfile(null);
        setPrivateProfile(null);
        setPayments([]);
        setWithdrawals([]);
        setNotifications([]);
        setActiveTab('marketplace');
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Live Profile Sync when Signed In
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const unsubPub = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) setPublicProfile(snap.data() as UserPublic);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );
    const unsubPriv = onSnapshot(
      doc(db, 'users', firebaseUser.uid, 'private', 'profile'),
      (snap) => {
        if (snap.exists()) setPrivateProfile(snap.data() as UserPrivate);
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}/private/profile`)
    );
    return () => {
      unsubPub();
      unsubPriv();
    };
  }, [authReady, firebaseUser]);

  // 3. Jobs Listener (Open public jobs + user's own posted/accepted jobs, or all jobs for admin)
  useEffect(() => {
    if (!authReady) return;
    setJobsLoading(true);
    const jobsCol = collection(db, 'jobs');
    const jobsQuery = !firebaseUser
      ? query(jobsCol, where('status', '==', 'open'))
      : isAdmin
        ? query(jobsCol, orderBy('createdAt', 'desc'))
        : query(
            jobsCol,
            or(
              where('status', '==', 'open'),
              where('posterId', '==', firebaseUser.uid),
              where('workerId', '==', firebaseUser.uid)
            )
          );

    const unsub = onSnapshot(
      jobsQuery,
      (snap) => {
        setJobs(snap.docs.map((d) => d.data() as Job));
        setJobsLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
    );
    return () => unsub();
  }, [authReady, firebaseUser, isAdmin]);

  // 4. User Financial & Notification Listeners
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const unsubPay = onSnapshot(
      query(
        collection(db, 'payments'),
        or(
          where('posterId', '==', firebaseUser.uid),
          where('workerId', '==', firebaseUser.uid)
        )
      ),
      (snap) => setPayments(snap.docs.map((d) => d.data() as Payment)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubWd = onSnapshot(
      query(collection(db, 'withdrawals'), where('userId', '==', firebaseUser.uid)),
      (snap) => setWithdrawals(snap.docs.map((d) => d.data() as Withdrawal)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
    );

    const unsubNotif = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AppNotification);
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubRev = onSnapshot(
      isAdmin
        ? query(collection(db, 'reviews'))
        : query(collection(db, 'reviews'), where('removed', '==', false)),
      (snap) => setReviews(snap.docs.map((d) => d.data() as Review)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    return () => {
      unsubPay();
      unsubWd();
      unsubNotif();
      unsubRev();
    };
  }, [authReady, firebaseUser, isAdmin]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveTab('marketplace');
  };

  const selectedJob = selectedJobId ? jobs.find((j) => j.jobId === selectedJobId) || null : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav
        isAuthenticated={Boolean(firebaseUser && publicProfile)}
        isAdmin={isAdmin}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenPostJob={() => setShowPostModal(true)}
        onSignIn={handleSignIn}
      />

      {authError && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {authError}
          </div>
        </div>
      )}

      {publicProfile?.accountStatus === 'blocked' && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 font-medium">
            Your account has been suspended by an administrator. You cannot post or accept new jobs.
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {activeTab === 'marketplace' && (
          <MarketplaceView
            jobs={jobs}
            loading={jobsLoading}
            currentUser={publicProfile}
            onSelectJob={(job) => setSelectedJobId(job.jobId)}
            onOpenPostJob={() => {
              if (!publicProfile) handleSignIn();
              else setShowPostModal(true);
            }}
            onSignIn={handleSignIn}
          />
        )}

        {activeTab === 'my-jobs' && publicProfile && (
          <MyJobsView
            currentUser={publicProfile}
            jobs={jobs}
            notifications={notifications}
            onSelectJob={(job) => setSelectedJobId(job.jobId)}
            onOpenPostJob={() => setShowPostModal(true)}
          />
        )}

        {activeTab === 'wallet' && publicProfile && privateProfile && (
          <WalletView
            currentUser={publicProfile}
            privateProfile={privateProfile}
            payments={payments}
            withdrawals={withdrawals}
            onGoToKyc={() => setActiveTab('profile')}
          />
        )}

        {activeTab === 'profile' && publicProfile && privateProfile && (
          <ProfileKycView
            currentUser={publicProfile}
            privateProfile={privateProfile}
            reviews={reviews}
            onSignOut={handleSignOut}
          />
        )}

        {activeTab === 'admin' && isAdmin && publicProfile && (
          <AdminConsoleView
            adminUser={publicProfile}
            jobs={jobs}
            reviews={reviews}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Instant Job · Escrow Task Marketplace (₹1 – ₹1,00,000)</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Privacy Policy & Cancellation Rules
            </button>
            {publicProfile && (
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-slate-900 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </footer>

      {showPostModal && publicProfile && (
        <PostJobModal
          currentUser={publicProfile}
          onClose={() => setShowPostModal(false)}
          onPosted={(jobId) => {
            setShowPostModal(false);
            setSelectedJobId(jobId);
          }}
        />
      )}

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          currentUser={publicProfile}
          onClose={() => setSelectedJobId(null)}
          onRequireSignIn={handleSignIn}
        />
      )}

      {showPrivacyModal && (
        <PrivacyPolicyModal onClose={() => setShowPrivacyModal(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <InstantJobApp />
    </ErrorBoundary>
  );
}
