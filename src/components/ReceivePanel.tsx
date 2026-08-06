import React, { useState } from 'react';
import { User } from '../types';
import { ArrowDownLeft, Copy, Check, QrCode, Building2, ShieldCheck, Share2, Globe2 } from 'lucide-react';

interface ReceivePanelProps {
  user: User;
}

export const ReceivePanel: React.FC<ReceivePanelProps> = ({ user }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const wireDetails = [
    { label: 'Bank Name', value: 'Silicon Valley Bank (SVB), N.A.', key: 'bank' },
    { label: 'Account Holder Name', value: user.fullName, key: 'name' },
    { label: 'Account Number', value: user.accountNumber, key: 'account' },
    { label: 'Routing / ABA Number', value: '121000358', key: 'routing' },
    { label: 'SWIFT / BIC Code', value: 'SVBUS33XXX', key: 'swift' },
    { label: 'Bank Address', value: '3000 Sand Hill Rd, Building 4, Menlo Park, CA 94025', key: 'address' }
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Receive Funds & Inbound Wires</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Share your dedicated account numbers and wiring instructions to receive deposits worldwide.
            </p>
          </div>
        </div>

        {/* Highlighted Account Number Card */}
        <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-inner flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Your Unique Account Number
            </span>
            <p className="text-2xl font-mono font-bold text-white mt-1 tracking-wider">{user.accountNumber}</p>
            <p className="text-xs text-slate-400 mt-0.5">Linked directly to {user.email}</p>
          </div>

          <button
            onClick={() => copyToClipboard(user.accountNumber, 'account_top')}
            className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 shrink-0"
          >
            {copiedField === 'account_top' ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copied Account #</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Account #</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Wiring Details List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            Complete Wire & Domestic ACH Instructions
          </h3>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Globe2 className="w-3 h-3 text-emerald-400" /> USD Domestic & Int'l
          </span>
        </div>

        <div className="space-y-3">
          {wireDetails.map((item) => (
            <div key={item.key} className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs hover:border-slate-700 transition-colors">
              <div>
                <p className="text-[11px] text-slate-400 font-medium">{item.label}</p>
                <p className="font-semibold text-slate-100 font-mono mt-0.5">{item.value}</p>
              </div>

              <button
                onClick={() => copyToClipboard(item.value, item.key)}
                className="p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors"
                title={`Copy ${item.label}`}
              >
                {copiedField === item.key ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
