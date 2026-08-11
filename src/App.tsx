import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SidebarNav } from './components/SidebarNav';
import { AuthModal } from './components/AuthModal';
import { UserDashboard } from './components/UserDashboard';
import { SendPanel } from './components/SendPanel';
import { WithdrawPanel } from './components/WithdrawPanel';
import { ReceivePanel } from './components/ReceivePanel';
import { ProfilePanel } from './components/ProfilePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { CustomerSupportPanel } from './components/CustomerSupportPanel';
import { AdminPanel } from './components/AdminPanel';
import { TransactionHistory } from './components/TransactionHistory';
import { ReceiptModal } from './components/ReceiptModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { VirtualCardsPanel } from './components/VirtualCardsPanel';
import { BillPayPanel } from './components/BillPayPanel';
import { Homepage } from './components/Homepage';
import { LegalModal, LegalDocType } from './components/LegalModal';
import { SupportChatWidget } from './components/SupportChatWidget';
import { api, getStoredToken, removeStoredToken } from './services/api';
import { dbStore } from './services/dbStore';
import { subscribeUserFromFirestore, subscribeTransactionsFromFirestore } from './lib/firebase';
import { User, Transaction, UserNotification } from './types';
import { ShieldCheck, Building2, ShieldAlert } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<
    'home' | 'dashboard' | 'cards' | 'bills' | 'deposit' | 'withdraw' | 'send' | 'receive' | 'history' | 'profile' | 'settings' | 'support' | 'admin'
  >('dashboard');
  
  // Data states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);

  // Modals & Drawers
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [receiptTxn, setReceiptTxn] = useState<Transaction | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalDocType>('privacy');

  const openLegalDoc = (doc: LegalDocType) => {
    setLegalTab(doc);
    setShowLegalModal(true);
  };

  const [loading, setLoading] = useState(true);

  // Initialize session or default demo user
  const initSession = async () => {
    setLoading(true);
    try {
      const token = getStoredToken();
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.user);
          if (res.user.role === 'admin') {
            setActiveTab(prev => prev === 'home' ? 'admin' : prev);
          }
        } catch (apiErr) {
          console.warn('api.getMe error, checking local fallback:', apiErr);
          const localUser = dbStore.getCurrentUser();
          if (localUser) {
            setUser(localUser);
            if (localUser.role === 'admin') {
              setActiveTab(prev => prev === 'home' ? 'admin' : prev);
            }
          } else {
            removeStoredToken();
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.warn('Session restoration error:', err);
      const localUser = dbStore.getCurrentUser();
      if (localUser) {
        setUser(localUser);
        if (localUser.role === 'admin') {
          setActiveTab(prev => prev === 'home' ? 'admin' : prev);
        }
      } else {
        removeStoredToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch data when user or activeTab changes
  const fetchData = async () => {
    if (!user) return;

    try {
      if (user.role === 'admin') {
        const txnsRes = await api.getAllTransactions();
        setTransactions(txnsRes.transactions);
      } else {
        const txnsRes = await api.getTransactions();
        setTransactions(txnsRes.transactions);
      }

      const notifsRes = await api.getNotifications();
      setNotifications(notifsRes.notifications);
    } catch (err) {
      console.error('Data fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000); // 4s auto-refresh fallback
    return () => clearInterval(interval);
  }, [user?.id, activeTab]);

  // Real-time Firestore snapshot listeners (instantly sync balance & transactions across sessions without logging out)
  useEffect(() => {
    if (!user) return;

    const unsubUser = subscribeUserFromFirestore(user.id, user.email, (updatedUser) => {
      setUser(prev => {
        if (!prev) return updatedUser;
        const merged = { ...prev, ...updatedUser };
        dbStore.saveUser(merged);
        return merged;
      });
    });

    const unsubTxns = subscribeTransactionsFromFirestore(
      user.role === 'admin' ? null : user.id,
      (fsTxns) => {
        setTransactions(fsTxns);
        fsTxns.forEach(t => dbStore.addTransaction(t));
      }
    );

    return () => {
      unsubUser();
      unsubTxns();
    };
  }, [user?.id, user?.email, user?.role]);

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setActiveTab('home');
    setShowAuthModal(true);
  };

  const handleQuickSwitch = async (email: string) => {
    setLoading(true);
    try {
      const pass = email === 'admin@svb.com' ? 'admin123' : 'user123';
      const res = await api.login({ email, password: pass });
      setUser(res.user);
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Quick switch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDepositSuccess = (updatedUser: User, transaction: Transaction) => {
    if (user && updatedUser.id === user.id) {
      setUser(updatedUser);
    }
    fetchData();
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await api.markNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className={`min-h-screen bg-[#f4f6f8] text-slate-800 font-sans antialiased selection:bg-[#00a3e0] selection:text-white flex flex-col ${theme === 'light' ? 'light-mode' : ''}`}>
      
      {/* Top SVB Go Branding Header */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadNotifsCount={unreadCount}
        onOpenNotifications={() => setShowNotifDrawer(true)}
        onLogout={handleLogout}
        onOpenAuth={() => setShowAuthModal(true)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
      />

      {/* Main Layout Container with Sidebar */}
      <div className="flex-1 flex w-full min-h-[calc(100vh-64px)]">
        
        {/* Left Vertical Navigation Sidebar */}
        {user && activeTab !== 'home' && (
          <SidebarNav
            user={user}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenFraudControl={() => openLegalDoc('privacy')}
          />
        )}

        {/* Right Main Content Area */}
        <main className="flex-1 bg-[#f4f6f8] px-3 sm:px-6 py-5 max-w-[1600px] w-full mx-auto overflow-x-hidden">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-3 text-slate-500 animate-pulse">
              <Building2 className="w-10 h-10 text-[#00a3e0]" />
              <p className="text-xs font-semibold">Connecting to Silicon Valley Bank Core Ledger...</p>
            </div>
          ) : activeTab === 'home' || !user ? (
            <Homepage
              onOpenAuth={() => setShowAuthModal(true)}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <UserDashboard
                  user={user}
                  transactions={transactions}
                  notifications={notifications}
                  onOpenReceipt={(txn) => setReceiptTxn(txn)}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onNavigateToAdmin={() => setActiveTab('admin')}
                  onUserUpdated={(updated) => setUser(updated)}
                />
              )}

              {activeTab === 'cards' && (
                <VirtualCardsPanel
                  user={user}
                  onRefreshUser={refreshUser}
                />
              )}

              {activeTab === 'bills' && (
                <BillPayPanel
                  user={user}
                  onRefreshUser={refreshUser}
                />
              )}

              {activeTab === 'send' && (
                <SendPanel
                  user={user}
                  onSuccess={(updatedUser, txn) => {
                    setUser(updatedUser);
                    setReceiptTxn(txn);
                    fetchData();
                  }}
                />
              )}

              {activeTab === 'withdraw' && (
                <WithdrawPanel
                  user={user}
                  onSuccess={(updatedUser, txn) => {
                    setUser(updatedUser);
                    setReceiptTxn(txn);
                    fetchData();
                  }}
                />
              )}

              {activeTab === 'receive' && (
                <ReceivePanel user={user} />
              )}

              {activeTab === 'history' && (
                <TransactionHistory
                  transactions={transactions}
                  onOpenReceipt={(txn) => setReceiptTxn(txn)}
                  isAdmin={user.role === 'admin'}
                />
              )}

              {activeTab === 'profile' && (
                <ProfilePanel
                  user={user}
                  onUpdateUser={(updated) => setUser(updated)}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsPanel
                  user={user}
                  onUpdateUser={(updated) => setUser(updated)}
                />
              )}

              {activeTab === 'support' && (
                <CustomerSupportPanel user={user} />
              )}

              {(activeTab === 'admin' || activeTab === 'deposit') && user.role === 'admin' && (
                <AdminPanel
                  adminUser={user}
                  onDepositSuccess={handleDepositSuccess}
                />
              )}

              {(activeTab === 'admin' || activeTab === 'deposit') && user.role !== 'admin' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-md mx-auto space-y-4 shadow-sm">
                  <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
                  <h3 className="text-lg font-bold text-[#002b49]">Access Denied: Admin Privilege Required</h3>
                  <p className="text-xs text-slate-500">
                    The Administration Operation Portal is strictly restricted to verified system administrators. Standard client accounts do not have permission to view or execute administrative actions.
                  </p>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="bg-[#002b49] hover:bg-[#001f35] text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}
            </>
          )}

        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-slate-400 font-medium">
            <button onClick={() => openLegalDoc('privacy')} className="hover:text-cyan-400 transition-colors">Privacy Policy</button>
            <span>•</span>
            <button onClick={() => openLegalDoc('terms')} className="hover:text-cyan-400 transition-colors">Terms of Service</button>
            <span>•</span>
            <button onClick={() => openLegalDoc('about')} className="hover:text-cyan-400 transition-colors">About Us</button>
            <span>•</span>
            <button onClick={() => openLegalDoc('contact')} className="hover:text-cyan-400 transition-colors">Contact Us</button>
            <span>•</span>
            <button onClick={() => openLegalDoc('disclaimer')} className="hover:text-cyan-400 transition-colors">Disclaimer</button>
            <span>•</span>
            <button onClick={() => openLegalDoc('cookies')} className="hover:text-cyan-400 transition-colors">Cookie Policy</button>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-900 pt-4">
            <p>© 2026 Silicon Valley Bank (SVB) Core Banking Platform.</p>
            <div className="flex items-center gap-4 text-slate-400">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 256-Bit Banking SSL Encrypted</span>
              <span>•</span>
              <span>FDIC Insured Coverage</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Support Chat Widget for Logged In Users */}
      {user && <SupportChatWidget user={user} />}

      {/* Modals & Drawers */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u) => {
          setUser(u);
          if (u.role === 'admin') {
            setActiveTab('admin');
          } else {
            setActiveTab('dashboard');
          }
        }}
      />

      <ReceiptModal
        transaction={receiptTxn}
        onClose={() => setReceiptTxn(null)}
      />

      <NotificationsDrawer
        isOpen={showNotifDrawer}
        notifications={notifications}
        onClose={() => setShowNotifDrawer(false)}
        onMarkAllRead={handleMarkNotificationsRead}
      />

      <LegalModal
        isOpen={showLegalModal}
        initialTab={legalTab}
        onClose={() => setShowLegalModal(false)}
      />

    </div>
  );
}

