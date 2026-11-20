export type AppTab = 'marketplace' | 'my-jobs' | 'wallet' | 'profile' | 'admin';

interface TopNavProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenPostJob: () => void;
  onSignIn: () => void;
}

export function TopNav({
  isAuthenticated,
  isAdmin,
  activeTab,
  onSelectTab,
  onOpenPostJob,
  onSignIn,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('marketplace')}
          className="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-700 rounded"
        >
          Instant Job
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        {isAuthenticated ? (
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => onSelectTab('marketplace')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'marketplace'
                  ? 'border-blue-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('my-jobs')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'my-jobs'
                  ? 'border-blue-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              My Jobs
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('wallet')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'wallet'
                  ? 'border-blue-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Wallet
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-blue-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Profile & KYC
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onSelectTab('admin')}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'border-blue-700 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                Admin
              </button>
            )}
          </nav>
        ) : (
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#open-tasks"
              className="py-1 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Open Tasks
            </a>
            <a
              href="#how-escrow-works"
              className="py-1 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#safety-guarantees"
              className="py-1 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Escrow Safety
            </a>
            <a
              href="#faq"
              className="py-1 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
          </nav>
        )}

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onOpenPostJob}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Post a Job
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Mobile secondary compact tab row (only when signed in on small screens) */}
      {isAuthenticated && (
        <div className="md:hidden border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600">
          {(
            [
              ['marketplace', 'Marketplace'],
              ['my-jobs', 'My Jobs'],
              ['wallet', 'Wallet'],
              ['profile', 'Profile'],
              ...(isAdmin ? [['admin', 'Admin']] : []),
            ] as [AppTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === id ? 'text-blue-700 font-semibold' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
