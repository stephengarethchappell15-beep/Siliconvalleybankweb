import React, { useState } from 'react';
import { User, Tier3VerificationRequest } from '../types';
import { api } from '../services/api';
import { ShieldCheck, Upload, FileText, CheckCircle2, Clock, AlertCircle, MapPin, Globe, Sparkles } from 'lucide-react';

interface Tier3VerificationPanelProps {
  user: User;
  onUserUpdated: (updatedUser: User) => void;
}

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Switzerland',
  'Singapore',
  'Japan',
  'United Arab Emirates'
];

export const Tier3VerificationPanel: React.FC<Tier3VerificationPanelProps> = ({ user, onUserUpdated }) => {
  const [address, setAddress] = useState(user.address || '');
  const [country, setCountry] = useState(user.country || 'United States');
  const [documentType, setDocumentType] = useState<'Passport' | 'National ID Card' | "Driver's License" | 'Residence Permit'>('Passport');
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [previewName, setPreviewName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setMsg({ type: 'error', text: 'Document image size must be under 5MB.' });
        return;
      }
      setPreviewName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocumentUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!address.trim()) {
      setMsg({ type: 'error', text: 'Full residential address is required.' });
      return;
    }

    if (!documentUrl) {
      setMsg({ type: 'error', text: 'Please upload a photo or scan of your selected identity document.' });
      return;
    }

    try {
      setLoading(true);
      await api.submitTier3Verification({
        address: address.trim(),
        country,
        documentType,
        documentUrl
      });
      setMsg({ type: 'success', text: 'Your Tier 3 verification request has been submitted to Silicon Valley Bank Compliance for review.' });
      const updatedSnap = await api.getMe();
      onUserUpdated(updatedSnap.user);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Submission failed.' });
    } finally {
      setLoading(false);
    }
  };

  const isTier3 = user.verificationTier === 'Tier 3';
  const isPending = user.verificationTier === 'Pending Tier 3';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
              isTier3 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : (isPending ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30')
            }`}>
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Tier 3 Account Identity Verification</h2>
                <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                  isTier3 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : (isPending ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30')
                }`}>
                  {user.verificationTier || 'Tier 1'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isTier3 
                  ? 'Your account has achieved Tier 3 Unlimited VIP Status.' 
                  : (isPending ? 'Your verification documents are currently under compliance review.' : 'Upgrade to Tier 3 for unlimited wire transfer limits and institutional treasury features.')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
          msg.type === 'success' 
            ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {isTier3 ? (
        <div className="bg-slate-900/60 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Identity Verified (Tier 3 Active)</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You enjoy high-volume international wire limits, zero transaction delays, and priority treasury management services at Silicon Valley Bank.
          </p>
        </div>
      ) : isPending ? (
        <div className="bg-slate-900/60 border border-amber-500/30 rounded-3xl p-8 text-center space-y-3">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/30 shadow-lg shadow-amber-500/10">
            <Clock className="w-8 h-8 animate-spin" />
          </div>
          <h3 className="text-lg font-bold text-white">Verification Pending Approval</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Your submitted identity documents are being verified by our compliance team. You will receive an automated notification once approved.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Complete Tier 3 Verification Form
            </h3>
            <span className="text-[10px] text-slate-400">Step 1 of 1</span>
          </div>

          {/* Full Home Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Full Home Address</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="100 Technology Way, Suite 400, Palo Alto, CA 94301"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none"
                required
              />
            </div>
          </div>

          {/* Country of Residence */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Country of Residence</label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none appearance-none cursor-pointer"
              >
                {COUNTRIES.map(c => (
                  <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Document Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Accepted Identity Document</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Passport', 'National ID Card', "Driver's License", 'Residence Permit'] as const).map((docType) => (
                <button
                  key={docType}
                  type="button"
                  onClick={() => setDocumentType(docType)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    documentType === docType
                      ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 mb-2" />
                  <span className="text-xs">{docType}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Identity Document Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Upload {documentType} Photo / Scan</label>
            <div className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-2xl p-6 text-center transition-colors bg-slate-950/50">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                id="doc-upload"
                className="hidden"
              />
              <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    {previewName ? `Uploaded: ${previewName}` : `Click to upload ${documentType}`}
                  </p>
                  <p className="text-[10px] text-slate-500">PNG, JPG, or PDF up to 5MB</p>
                </div>
              </label>

              {documentUrl && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className="text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Document attached successfully
                  </p>
                  {documentUrl.startsWith('data:image') && (
                    <img src={documentUrl} alt="Preview" className="mt-2 h-28 mx-auto rounded-lg object-cover border border-slate-700" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !documentUrl}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all text-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Submit Verification Documents</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
