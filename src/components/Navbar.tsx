import React, { useState } from 'react';
import { User } from '../types';
import { 
  Building2, 
  ShieldCheck, 
  User as UserIcon, 
  LogOut, 
  Bell, 
  CreditCard, 
  FileText, 
  History, 
  Check, 
  Sparkles,
  ChevronDown,
  Layers,
  Send,
  ArrowDownRight,
  Receipt,
  Headphones,
  Lock,
  Compass,
  Sun,
  Moon
} from 'lucide-react';

interface NavbarProps {
  user: User | null;
  activeTab: 'home' | 'dashboard' | 'cards' | 'bills' | 'send' | 'withdraw' | 'history' | 'profile' | 'settings' | 'support' | 'admin';
  setActiveTab: (tab: 'home' | 'dashboard' | 'cards' | 'bills' | 'send' | 'withdraw' | 'history' | 'profile' | 'settings' | 'support' | 'admin') => void;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
  onLogout: () => void;
  onOpenAuth: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  unreadNotifsCount,
  onOpenNotifications,
  onLogout,
  onOpenAuth,
  theme,
  onToggleTheme,
}) => {
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-slate-800 text-slate-100 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Silicon Valley Bank Brand Logo */}
        <button 
          onClick={() => setActiveTab(user ? 'dashboard' : 'home')}
          className="flex items-center gap-3 group text-left transition-transform hover:opacity-95 focus:outline-none"
        >
          <img 
            src="/svb-logo.svg" 
            alt="Silicon Valley Bank Logo" 
            className="h-8 sm:h-9 w-auto object-contain group-hover:scale-[1.02] transition-transform"
          />
        </button>

        {/* Center Nav Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
          {!user ? (
            <>
              <button
                onClick={() => setActiveTab('home')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'home'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                Home & Services
              </button>
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              >
                Online Banking Login
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Accounts
              </button>

              <button
                onClick={() => setActiveTab('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'cards'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Virtual Cards
              </button>

              <button
                onClick={() => setActiveTab('send')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'send' || activeTab === 'withdraw'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                Transfers & Wires
              </button>

              <button
                onClick={() => setActiveTab('bills')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'bills'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                Bill Pay
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'history'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Statements
              </button>

              <button
                onClick={() => setActiveTab('support')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'support'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                Support Desk
              </button>

              {user.role === 'admin' && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'admin'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border border-amber-500/30'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Admin Console
                </button>
              )}
            </>
          )}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-all border border-slate-800 hover:border-slate-700 flex items-center justify-center gap-1.5 text-xs font-semibold"
            title={theme === 'dark' ? 'Switch to High-Key Light Mode' : 'Switch to High-Contrast Dark Theme'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline text-slate-300 text-[11px]">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline text-slate-300 text-[11px]">Dark</span>
              </>
            )}
          </button>

          {user ? (
            <>
              {/* Notification Button */}
              <button
                onClick={onOpenNotifications}
                className="relative p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                title="Account Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-cyan-400 text-slate-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* User Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-xs shadow-sm overflow-hidden shrink-0">
                    {user.profilePicture ? (
                      <img src={user.profilePicture} alt={user.fullName} className="w-full h-full object-cover" />
                    ) : (
                      user.fullName.charAt(0)
                    )}
                  </div>
                  <div className="hidden sm:block text-xs">
                    <p className="font-semibold text-slate-100 leading-tight">{user.fullName}</p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span>Acc #{user.accountNumber}</span>
                      {user.role === 'admin' && (
                        <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1 rounded font-bold border border-amber-500/30">ADMIN</span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showSwitchMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-800 mb-1 bg-slate-950/50 rounded-xl">
                      <p className="font-semibold text-white">{user.fullName}</p>
                      <p className="text-slate-400 text-[11px] truncate">{user.email}</p>
                      <p className="text-cyan-400 text-[10px] font-mono mt-0.5">Primary Acc #{user.accountNumber}</p>
                    </div>

                    <div className="py-1 space-y-1">
                      <button
                        onClick={() => {
                          setShowSwitchMenu(false);
                          setActiveTab('profile');
                        }}
                        className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 rounded-xl flex items-center gap-2 transition-colors"
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        User Profile & 2FA
                      </button>

                      {user.role === 'admin' && (
                        <button
                          onClick={() => {
                            setShowSwitchMenu(false);
                            setActiveTab('admin');
                          }}
                          className="w-full text-left px-3 py-1.5 text-amber-400 hover:bg-amber-500/10 rounded-xl flex items-center gap-2 transition-colors font-semibold"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Admin Console
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowSwitchMenu(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center gap-2 transition-colors font-semibold"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenAuth}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-cyan-500/20 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                Sign In / Register
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Sub-Nav */}
      {user && (
        <div className="lg:hidden flex items-center justify-around bg-slate-950 border-t border-slate-800/80 px-2 py-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
              activeTab === 'dashboard' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Accounts</span>
          </button>

          <button
            onClick={() => setActiveTab('cards')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
              activeTab === 'cards' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Cards</span>
          </button>

          <button
            onClick={() => setActiveTab('send')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
              activeTab === 'send' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Transfer</span>
          </button>

          <button
            onClick={() => setActiveTab('bills')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
              activeTab === 'bills' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Bills</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
              activeTab === 'history' ? 'text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Statements</span>
          </button>

          {user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
                activeTab === 'admin' ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Admin</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};

