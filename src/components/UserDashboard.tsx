import React, { useState } from 'react';
import { User, Transaction, UserNotification } from '../types';
import { api } from '../services/api';
import { 
  CreditCard, 
  Copy, 
  Check, 
  ShieldCheck, 
  ArrowDownRight, 
  TrendingUp, 
  Bell, 
  QrCode, 
  Mail, 
  Phone, 
  Calendar, 
  FileText, 
  Sparkles,
  ExternalLink,
  ChevronRight,
  Lock,
  Key,
  DollarSign,
  Send,
  X,
  AlertCircle
} from 'lucide-react';

interface UserDashboardProps {
  user: User;
  transactions: Transaction[];
  notifications: UserNotification[];
  onOpenReceipt: (txn: Transaction) => void;
  onNavigateTab: (tab: 'dashboard' | 'deposit' | 'withdraw' | 'send' | 'receive' | 'history' | 'profile' | 'settings' | 'support' | 'admin') => void;
  onNavigateToAdmin?: () => void;
  onUserUpdated?: (updatedUser: User) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  transactions,
  notifications,
  onOpenReceipt,
  onNavigateTab,
  onNavigateToAdmin,
  onUserUpdated
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Activation Deposit Modal state
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [cryptoMethod, setCryptoMethod] = useState<'BTC' | 'USDT'>('BTC');
  const [txHash, setTxHash] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const walletAddresses = {
    BTC: 'bc1qe4ln6nt3w0yqc6gvchqeut9d2r2raedm52ej5c',
    USDT: 'TWgMXsoubMTxyK9Zc47ZxcN29bLaCJU4EA'
  };

  const copyAccountNumber = () => {
    navigator.clipboard.writeText(user.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCryptoDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError(null);
    setSubmittingDeposit(true);

    try {
      const res = await api.submitCryptoActivationDeposit(cryptoMethod, txHash, proofNote);
      if (onUserUpdated) onUserUpdated(res.user);
      setShowActivationModal(false);
      alert('$200 Activation deposit request submitted successfully! SVB Compliance will review and generate your 4-Digit Security Code upon approval.');
    } catch (err: any) {
      setActivationError(err.message || 'Failed to submit activation deposit.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const totalDeposits = transactions.reduce((acc, t) => acc + t.amount, 0);
  const recentTransactions = transactions.slice(0, 5);
  const unreadNotifs = notifications.filter(n => !n.read);

  return (
    <div className="space-y-6">

      {/* Tier 3 Upgrade Approved Status Banner */}
      {user.role !== 'admin' && user.verificationTier === 'Tier 3' && (
        <div className="rounded-3xl p-5 border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all bg-gradient-to-r from-cyan-950/80 via-slate-900 to-slate-900 border-cyan-500/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Your account upgrade has been successfully completed.</h3>
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Tier 3 Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Account Tier: <span className="font-bold text-cyan-400">Tier 3</span> • Monthly Spending Limit: <span className="font-bold text-emerald-400">$5,000,000.00 USD</span> (Unlimited).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4-Digit Security Code Status Banner (Only visible if user has initiated transfer code flow or code exists) */}
      {user.role !== 'admin' && user.transferCodeApproved && user.fourDigitCode && (
        <div className="rounded-3xl p-5 border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">4-Digit Outgoing Transfer Code</h3>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Active & Authorized
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Your authorized 4-Digit Outgoing Transfer Security Code is: <span className="font-mono font-bold text-emerald-400 text-sm bg-slate-950 px-2.5 py-1 rounded-lg border border-emerald-500/30">[{user.fourDigitCode}]</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Crypto Activation Deposit Modal */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative animate-fadeIn">
            <button
              onClick={() => setShowActivationModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">$200 Transfer Activation Deposit</h3>
                <p className="text-xs text-slate-400">Required deposit to receive your official 4-Digit Security Code</p>
              </div>
            </div>

            {activationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            <form onSubmit={handleCryptoDepositSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-2">Select Cryptocurrency Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCryptoMethod('BTC')}
                    className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                      cryptoMethod === 'BTC' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Bitcoin (BTC)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCryptoMethod('USDT')}
                    className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                      cryptoMethod === 'USDT' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Tether (USDT)
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Required Deposit Amount:</span>
                  <span className="font-bold text-emerald-400 text-sm">$200.00 USD</span>
                </div>
                <div className="text-[11px]">
                  <span className="text-slate-400 block mb-1">Official SVB Treasury Wallet Address ({cryptoMethod}):</span>
                  <div className="font-mono bg-slate-900 p-2.5 rounded-xl text-amber-400 font-semibold break-all border border-slate-800 select-all">
                    {walletAddresses[cryptoMethod]}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Transaction Hash / Proof (Optional)</label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g. 0x8f4b..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Additional Note / Sender Tag</label>
                <input
                  type="text"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  placeholder="e.g. Transferred from Binance wallet"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingDeposit}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {submittingDeposit ? 'Submitting Deposit...' : 'Confirm $200 Activation Deposit'}
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* Top Banner & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Account Number & Card (2 cols) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Primary Banking Profile</p>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  {user.fullName}
                  {user.role === 'admin' && (
                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase">
                      Admin Access
                    </span>
                  )}
                </h1>
              </div>
            </div>

            <button
              onClick={() => setShowQr(!showQr)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors border border-slate-700 flex items-center gap-1.5 text-xs font-medium"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Show QR</span>
            </button>
          </div>

          {/* Account Number Focus Display */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 mb-6 backdrop-blur flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1">
                <span>SYSTEM ASSIGNED ACCOUNT NUMBER</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl sm:text-3xl font-mono font-bold tracking-wider text-emerald-400">
                  {user.accountNumber}
                </span>
                <button
                  onClick={copyAccountNumber}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-all flex items-center gap-1 text-xs font-semibold"
                  title="Copy Account Number"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-[11px]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      <span className="text-[11px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="text-left sm:text-right border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0 w-full sm:w-auto">
              <p className="text-[11px] text-slate-400">Linked Profile Email</p>
              <p className="text-xs font-semibold text-slate-200 truncate">{user.email}</p>
            </div>
          </div>

          {/* QR Code Overlay toggle */}
          {showQr && (
            <div className="mb-6 p-4 bg-slate-950 border border-emerald-500/30 rounded-2xl flex flex-col items-center justify-center text-center gap-2 animate-fadeIn">
              <div className="bg-white p-3 rounded-xl">
                {/* SVG QR Placeholder */}
                <div className="w-32 h-32 bg-slate-900 rounded flex items-center justify-center text-slate-100 font-mono text-xs font-bold text-center border border-slate-700">
                  QR CODE
                  <br />
                  ACC#{user.accountNumber}
                </div>
              </div>
              <p className="text-xs font-mono text-emerald-400 font-semibold">{user.accountNumber}</p>
              <p className="text-[11px] text-slate-400">Scan to view account details or initiate incoming transfer</p>
            </div>
          )}

          {/* User Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[10px] text-slate-500 font-medium">Email Address</p>
                <p className="font-semibold text-slate-200 truncate">{user.email}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[10px] text-slate-500 font-medium">Phone Contact</p>
                <p className="font-semibold text-slate-200 truncate">{user.phone || 'N/A'}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[10px] text-slate-500 font-medium">Account Tier</p>
                <p className="font-bold text-cyan-400">{user.verificationTier || 'Tier 1'}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-center gap-2.5">
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[10px] text-slate-500 font-medium">Monthly Spending Limit</p>
                <p className="font-bold text-emerald-400">
                  {user.verificationTier === 'Tier 3' ? '$5,000,000.00' : user.verificationTier === 'Tier 2' ? '$250,000.00' : '$50,000.00'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Balance Card (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Balance</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Active Account
              </span>
            </div>

            <div className="my-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {user.currency || 'USD'} ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Total Deposits Funded: <span className="text-emerald-400 font-semibold">${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigateTab('send')}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5"
              >
                Send
              </button>
              <button
                onClick={() => onNavigateTab('withdraw')}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-xl text-xs transition-colors border border-slate-700 flex items-center justify-center gap-1.5"
              >
                Withdraw
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigateTab('receive')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 rounded-xl text-xs transition-colors border border-slate-700 flex items-center justify-center gap-1.5"
              >
                Receive
              </button>
              {user.role === 'admin' ? (
                <button
                  onClick={() => onNavigateTab('admin')}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-xl text-xs transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5"
                >
                  Admin Panel
                </button>
              ) : (
                <button
                  onClick={() => onNavigateTab('history')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 rounded-xl text-xs transition-colors border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  History
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Notifications Section if unread exists */}
      {unreadNotifs.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-200 animate-fadeIn">
          <Bell className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
          <div className="flex-1">
            <p className="font-bold text-emerald-300">New Deposit Notification</p>
            <p className="text-emerald-200/90 mt-0.5">{unreadNotifs[0].message}</p>
          </div>
        </div>
      )}

      {/* Recent Transactions List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              Recent Deposits & Credits
            </h2>
            <p className="text-xs text-slate-400">All funding transactions linked to account #{user.accountNumber}</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">Total: {transactions.length} record(s)</span>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl p-6">
            <ArrowDownRight className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No transactions yet.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Your incoming and outgoing transaction history will appear here once processed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="pb-3 px-3">Date & Time</th>
                  <th className="pb-3 px-3">Reference</th>
                  <th className="pb-3 px-3">Description</th>
                  <th className="pb-3 px-3">Amount</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap">
                      {new Date(txn.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-emerald-400 font-semibold whitespace-nowrap">
                      {txn.reference}
                    </td>
                    <td className="py-3.5 px-3 text-slate-200 font-medium">
                      {txn.description}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-emerald-400 text-sm whitespace-nowrap">
                      +${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {txn.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => onOpenReceipt(txn)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1"
                        title="View Official Receipt"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
