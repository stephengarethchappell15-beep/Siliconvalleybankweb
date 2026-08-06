import React, { useState } from 'react';
import { User, Transaction } from '../types';
import { api } from '../services/api';
import { ArrowUpRight, Landmark, CreditCard, DollarSign, AlertCircle, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';

interface WithdrawPanelProps {
  user: User;
  onSuccess: (updatedUser: User, transaction: Transaction) => void;
}

export const WithdrawPanel: React.FC<WithdrawPanelProps> = ({ user, onSuccess }) => {
  const [bankName, setBankName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState(user.fullName);
  const [amount, setAmount] = useState('');
  const [fourDigitCode, setFourDigitCode] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTxn, setSuccessTxn] = useState<Transaction | null>(null);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessTxn(null);

    const numAmount = parseFloat(amount);
    if (!bankName || !routingNumber || !accountNumber || !accountHolderName) {
      setError('Please fill in all receiving bank account details.');
      return;
    }
    if (user.role !== 'admin' && !fourDigitCode) {
      setError('Invalid security code. Please enter your 4-digit transaction security code.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid withdrawal amount greater than $0.00.');
      return;
    }
    if (numAmount > user.balance) {
      setError(`Insufficient funds. Your available balance is $${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`);
      return;
    }

    try {
      setLoading(true);
      const res = await api.withdrawFunds({
        bankName: bankName.trim(),
        routingNumber: routingNumber.trim(),
        accountNumber: accountNumber.trim(),
        accountHolderName: accountHolderName.trim(),
        amount: numAmount,
        note: note.trim(),
        fourDigitCode: fourDigitCode.trim()
      });
      setSuccessTxn(res.transaction);
      onSuccess(res.updatedUser, res.transaction);
      setAmount('');
      setFourDigitCode('');
      setNote('');
    } catch (err: any) {
      setError(err.message || 'Invalid security code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">External Wire & ACH Withdrawal</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Withdraw funds directly to any US or international commercial bank account.
            </p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="mt-6 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Available Balance</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">
              ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs text-slate-400">{user.currency}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400">Processing Time</p>
            <p className="text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full inline-block mt-1">
              Instant Wire Clearance
            </p>
          </div>
        </div>
      </div>

      {/* Success Receipt Banner */}
      {successTxn && (
        <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-2xl p-5 text-slate-200 space-y-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-white text-sm">Wire Withdrawal Executed Successfully</span>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-3 border border-emerald-500/10 text-xs space-y-1 font-mono">
            <p className="flex justify-between text-slate-400">
              <span>Reference:</span>
              <span className="text-emerald-400 font-semibold">{successTxn.reference}</span>
            </p>
            <p className="flex justify-between text-slate-400">
              <span>Amount Withdrawn:</span>
              <span className="text-white font-semibold">${successTxn.amount.toFixed(2)} USD</span>
            </p>
            <p className="flex justify-between text-slate-400">
              <span>Destination:</span>
              <span className="text-slate-200">{bankName} (****{accountNumber.slice(-4)})</span>
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-rose-950/60 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleWithdraw} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Receiving Bank Name <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Landmark className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Chase, Bank of America, Wells Fargo"
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Account Holder Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              placeholder="Full Legal Name"
              className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              ABA Routing Number (9 Digits) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
              placeholder="e.g. 121000358"
              maxLength={12}
              className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Bank Account Number <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="External Account #"
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors font-mono"
                required
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Withdrawal Amount ($ USD) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={user.balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl pl-10 pr-16 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setAmount(user.balance.toString())}
                className="absolute right-2.5 top-2 text-[10px] uppercase font-bold text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 px-2 py-1 rounded-lg transition-colors"
              >
                Max
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              4-Digit Transaction Security Code <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                maxLength={4}
                value={fourDigitCode}
                onChange={(e) => setFourDigitCode(e.target.value)}
                placeholder="e.g. 8492"
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors font-mono tracking-widest"
                required={user.role !== 'admin'}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Withdrawal Purpose / Wire Instructions (Optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Escrow payout, Vendor payment"
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
          />
        </div>

        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center gap-3 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>Wire requests are verified through ApexVault FedWire gateway with end-to-end security audit logs.</span>
        </div>

        <button
          type="submit"
          disabled={loading || !bankName || !routingNumber || !accountNumber || !amount}
          className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <ArrowUpRight className="w-4 h-4" />
              <span>Confirm & Process Wire Withdrawal</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
