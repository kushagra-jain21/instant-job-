import React, { useState } from 'react';
import { CheckCircle2, LogOut, ShieldCheck, Star } from 'lucide-react';
import {
  submitKycVerification,
  updateProfileSettings,
} from '../services/instantJobService';
import { Review, UserPrivate, UserPublic } from '../types/instantJob';

interface ProfileKycViewProps {
  currentUser: UserPublic;
  privateProfile: UserPrivate;
  reviews: Review[];
  onSignOut: () => void;
}

export function ProfileKycView({
  currentUser,
  privateProfile,
  reviews,
  onSignOut,
}: ProfileKycViewProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [mobile, setMobile] = useState(privateProfile.mobile || '');
  const [mobileVerified, setMobileVerified] = useState(privateProfile.mobileVerified);
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [upiId, setUpiId] = useState(privateProfile.upiId || '');
  const [bankLast4, setBankLast4] = useState(privateProfile.bankAccountLast4 || '');
  const [bankIfsc, setBankIfsc] = useState(privateProfile.bankIfsc || '');
  const [preferredMode, setPreferredMode] = useState<'both' | 'poster' | 'seeker'>(
    privateProfile.preferredMode || 'both'
  );

  // KYC form
  const [kycDocType, setKycDocType] = useState(privateProfile.kycDocType || 'PAN Card');
  const [kycDocLast4, setKycDocLast4] = useState(privateProfile.kycDocLast4 || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSendOtp = () => {
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setMessage('Enter a valid 10-digit Indian mobile number first.');
      return;
    }
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setOtpSent(generated);
    setMessage(`Verification OTP sent to +91 ${mobile}: ${generated}`);
  };

  const handleVerifyOtp = () => {
    if (otpInput.trim() === otpSent) {
      setMobileVerified(true);
      setOtpSent(null);
      setOtpInput('');
      setMessage('Mobile number verified! Click Save Profile to store.');
    } else {
      setMessage('Incorrect OTP. Please check the 6-digit code.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateProfileSettings({
        uid: currentUser.uid,
        displayName,
        bio,
        mobile,
        mobileVerified,
        upiId,
        bankAccountLast4: bankLast4,
        bankIfsc,
        preferredMode,
      });
      setMessage('Profile & payout settings saved securely.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kycDocLast4.trim().length < 4) {
      setMessage('Enter the last 4 characters of your PAN or Aadhaar document.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await submitKycVerification({
        uid: currentUser.uid,
        docType: kycDocType,
        docLast4: kycDocLast4.trim(),
      });
      setMessage('KYC submitted for Admin verification.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to submit KYC.');
    } finally {
      setSaving(false);
    }
  };

  const myReviews = reviews.filter(
    (r) => r.revieweeId === currentUser.uid && !r.removed
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              {currentUser.displayName}
            </h1>
            {currentUser.kycVerified && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                Verified
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {privateProfile.email} · Rating{' '}
            {currentUser.ratingCount > 0 ? `${currentUser.ratingAvg.toFixed(1)}/5 (${currentUser.ratingCount})` : 'No ratings yet'} ·{' '}
            {currentUser.completedJobsCount} completed jobs
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {message && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Account & Payout Settings */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <h2 className="text-base font-bold text-slate-900 font-display">
            Account, Mobile OTP & Payout Settings
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Default Role</label>
              <select
                value={preferredMode}
                onChange={(e) => setPreferredMode(e.target.value as 'both' | 'poster' | 'seeker')}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="both">Both Job Poster & Seeker</option>
                <option value="poster">Mostly Job Poster</option>
                <option value="seeker">Mostly Job Seeker</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Skills / Short Bio
            </label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g., Graphic designer & Python developer based in Bengaluru."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          {/* Mobile OTP Verification (SRS 6.1) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Mobile Number (+91)
              </label>
              {mobileVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  OTP Verified
                </span>
              ) : (
                <span className="text-xs text-amber-700 font-medium">Unverified</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="tel"
                maxLength={10}
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  setMobileVerified(false);
                }}
                placeholder="9876543210"
                className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
              />
              {!mobileVerified && (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Send OTP
                </button>
              )}
            </div>
            {otpSent && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg cursor-pointer"
                >
                  Verify OTP
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">UPI ID</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@okaxis"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Bank A/C Last 4</label>
              <input
                type="text"
                maxLength={4}
                value={bankLast4}
                onChange={(e) => setBankLast4(e.target.value)}
                placeholder="4821"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">IFSC Code</label>
              <input
                type="text"
                maxLength={11}
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value)}
                placeholder="SBIN0001234"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Profile Settings'}
          </button>
        </form>

        {/* KYC & Reviews Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Identity Verification (KYC)
              </h2>
              <span
                className={`text-xs font-semibold ${
                  privateProfile.kycStatus === 'verified'
                    ? 'text-emerald-700'
                    : privateProfile.kycStatus === 'pending'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {privateProfile.kycStatus.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Required for jobs ₹10,000+ and withdrawals ₹5,000+. Verified profiles receive a Verified badge across the marketplace.
            </p>

            {privateProfile.kycStatus !== 'verified' && (
              <form onSubmit={handleKycSubmit} className="space-y-3">
                <select
                  value={kycDocType}
                  onChange={(e) => setKycDocType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                >
                  <option value="PAN Card">PAN Card</option>
                  <option value="Aadhaar Card">Aadhaar Card</option>
                  <option value="Passport">Passport</option>
                </select>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={kycDocLast4}
                  onChange={(e) => setKycDocLast4(e.target.value)}
                  placeholder="Last 4 digits / characters (e.g. 9421)"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={saving || privateProfile.kycStatus === 'pending'}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {privateProfile.kycStatus === 'pending'
                    ? 'Pending Admin Review'
                    : 'Submit KYC Verification'}
                </button>
              </form>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Reviews Received ({myReviews.length})
            </h2>
            {myReviews.length === 0 ? (
              <p className="text-xs text-slate-500">
                Complete a job to receive ratings and reviews from Posters or Workers.
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {myReviews.map((rev) => (
                  <div key={rev.reviewId} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{rev.reviewerName}</span>
                      <span className="inline-flex items-center gap-1 font-mono text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {rev.rating}/5
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
