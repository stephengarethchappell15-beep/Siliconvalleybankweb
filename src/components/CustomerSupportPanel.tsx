import React, { useState, useEffect, useRef } from 'react';
import { User, SupportTicket } from '../types';
import { api } from '../services/api';
import { subscribeSupportTicketsFromFirestore } from '../lib/firebase';
import { dbStore } from '../services/dbStore';
import { subscribeRealtimeUpdates } from '../services/realtimeBus';
import { 
  Headphones, 
  MessageSquare, 
  Plus, 
  Send, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ShieldAlert, 
  User as UserIcon, 
  LifeBuoy,
  Search,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Filter,
  Sparkles,
  Paperclip,
  Maximize2
} from 'lucide-react';

interface CustomerSupportPanelProps {
  user: User;
}

export const CustomerSupportPanel: React.FC<CustomerSupportPanelProps> = ({ user }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');

  // New Ticket Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'Deposit' | 'Withdrawal' | 'Account' | 'Security' | 'General'>('General');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [message, setMessage] = useState('');
  const [createImage, setCreateImage] = useState<string>('');
  const [createLoading, setCreateLoading] = useState(false);

  // Chat Reply State
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<string>('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [selectedImageModal, setSelectedImageModal] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (instant = false) => {
    const scroll = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: instant ? 'auto' : 'smooth'
        });
      }
      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      });
    };

    scroll();
    // Re-scroll after micro-delays to account for DOM reflow, image rendering, or font layout
    setTimeout(scroll, 50);
    setTimeout(scroll, 180);
  };

  useEffect(() => {
    if (selectedTicket) {
      scrollToBottom(false);
    }
  }, [selectedTicket?.id, selectedTicket?.messages?.length, selectedTicket?.messages]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.getSupportTickets();
      setTickets(res.tickets);
      if (selectedTicket) {
        const updated = res.tickets.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      } else if (res.tickets.length > 0) {
        setSelectedTicket(res.tickets[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();

    const unsubFirestore = subscribeSupportTicketsFromFirestore(
      user.role === 'admin' ? undefined : user.id,
      user.role === 'admin',
      (fsTickets) => {
        if (fsTickets) {
          fsTickets.forEach(t => dbStore.addSupportTicket(t));
          setTickets(fsTickets);
          setSelectedTicket(prev => {
            if (!prev) return fsTickets.length > 0 ? fsTickets[0] : null;
            const updated = fsTickets.find(t => t.id === prev.id);
            return updated || (fsTickets.length > 0 ? fsTickets[0] : null);
          });
        }
      }
    );

    const unsubRealtimeBus = subscribeRealtimeUpdates((event) => {
      if (event.type.includes('SUPPORT') || event.type.includes('TICKET')) {
        fetchTickets();
      }
    });

    const interval = setInterval(() => {
      fetchTickets();
    }, 3000);

    return () => {
      unsubFirestore();
      unsubRealtimeBus();
      clearInterval(interval);
    };
  }, [user.id, user.role]);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>, isReply: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      if (isReply) {
        setReplyImage(b64);
      } else {
        setCreateImage(b64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || (!message.trim() && !createImage)) return;

    try {
      setCreateLoading(true);
      const res = await api.createSupportTicket({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim() || 'Attached image file',
        images: createImage ? [createImage] : undefined
      });
      setShowCreateModal(false);
      setSubject('');
      setMessage('');
      setCreateImage('');
      await fetchTickets();
      setSelectedTicket(res.ticket);
    } catch (err: any) {
      alert(err.message || 'Failed to submit ticket.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || (!replyText.trim() && !replyImage)) return;

    try {
      setReplyLoading(true);
      const res = await api.replySupportTicket(
        selectedTicket.id, 
        replyText.trim() || 'Attached image', 
        replyImage ? [replyImage] : undefined
      );
      setSelectedTicket(res.ticket);
      setReplyText('');
      setReplyImage('');
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to send reply.');
    } finally {
      setReplyLoading(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: any) => {
    try {
      const res = await api.updateTicketStatus(ticketId, newStatus);
      setSelectedTicket(res.ticket);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    const query = searchFilter.toLowerCase().trim();
    const matchesSearch = !query || 
      t.subject.toLowerCase().includes(query) || 
      t.userName.toLowerCase().includes(query) || 
      t.userEmail.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query) ||
      (t.accountNumber && t.accountNumber.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
              alt="Support Lead"
              className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10"
            />
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 absolute -bottom-0.5 -right-0.5" title="Online" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {user.role === 'admin' ? 'Global Customer Support Desk' : '24/7 Client Support Center'}
              </h2>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {user.role === 'admin' 
                ? 'Review, assist, and reply to client inquiries in real time.' 
                : 'Assigned Lead: Sarah Mitchell | Official Client Service Desk'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Support Ticket</span>
        </button>
      </div>

      {/* Main Grid: Ticket List + Message View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Tickets & Filter */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col h-[600px]">
          <div className="px-2 pb-3 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <LifeBuoy className="w-4 h-4 text-emerald-400" />
                <span>{user.role === 'admin' ? 'Client Inquiries' : 'Your Inquiries'} ({filteredTickets.length})</span>
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono">
                Total: {tickets.length}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search ticket subject, client, or ID..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] pt-1">
              {(['All', 'Open', 'In Progress', 'Resolved'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                    statusFilter === st 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'text-slate-400 hover:text-slate-200 bg-slate-950/60'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs">No support tickets found.</p>
                <p className="text-[11px] text-slate-600">Click "New Support Ticket" above to open an inquiry.</p>
              </div>
            ) : (
              filteredTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    selectedTicket?.id === t.id
                      ? 'bg-slate-800 border-emerald-500/50 shadow-md'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-100 truncate">{t.subject}</span>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                      t.status === 'Open' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      t.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {t.status}
                    </span>
                  </div>

                  {user.role === 'admin' && (
                    <p className="text-[11px] text-slate-300 mt-1 truncate">
                      {t.userName} <span className="text-slate-500 text-[10px]">({t.userEmail})</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                    <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                      {t.category}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {new Date(t.updatedAt || t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Live Chat Thread */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col h-[600px]">
          {selectedTicket ? (
            <>
              {/* Ticket Header */}
              <div className="pb-4 border-b border-slate-800 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{selectedTicket.subject}</h3>
                    <span className="text-[10px] font-mono text-slate-500">#{selectedTicket.id}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Client: <span className="text-slate-200 font-semibold">{selectedTicket.userName}</span> ({selectedTicket.userEmail})
                    {selectedTicket.accountNumber && (
                      <span className="ml-2 font-mono text-slate-400">Acc: {selectedTicket.accountNumber}</span>
                    )}
                  </p>
                </div>

                {user.role === 'admin' && (
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-xs text-white rounded-xl px-2.5 py-1 outline-none font-semibold cursor-pointer"
                  >
                    <option value="Open">Status: Open</option>
                    <option value="In Progress">Status: In Progress</option>
                    <option value="Resolved">Status: Resolved</option>
                    <option value="Closed">Status: Closed</option>
                  </select>
                )}
              </div>

              {/* Messages Scroll Area */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1 scroll-smooth"
              >
                {selectedTicket.messages.map((m) => {
                  const isUser = m.senderRole === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[85%] ${isUser ? 'mr-auto items-start' : 'ml-auto items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                        <span className="font-semibold text-slate-300">{m.senderName}</span>
                        {!isUser && (
                          <span className="bg-amber-500/10 text-amber-400 text-[9px] px-1.5 rounded font-bold border border-amber-500/20">
                            SUPPORT DESK
                          </span>
                        )}
                        <span>• {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div className={`p-3.5 rounded-2xl text-xs space-y-2 ${
                        isUser 
                          ? 'bg-slate-950 border border-slate-800 rounded-tl-none text-slate-100' 
                          : 'bg-emerald-600/30 border border-emerald-500/30 rounded-tr-none text-slate-100'
                      }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>

                        {/* Render attached images */}
                        {m.images && m.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {m.images.map((img, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={img}
                                  alt="Attachment"
                                  onLoad={() => scrollToBottom(false)}
                                  onClick={() => setSelectedImageModal(img)}
                                  className="w-28 h-28 object-cover rounded-xl border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => setSelectedImageModal(img)}
                                  className="absolute bottom-1.5 right-1.5 p-1 bg-slate-950/80 rounded-md text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Expand image"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Preview Attachment */}
              {replyImage && (
                <div className="p-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs px-3 rounded-xl mb-2">
                  <div className="flex items-center gap-2">
                    <img src={replyImage} alt="Attachment" className="w-8 h-8 object-cover rounded-lg border border-slate-700" />
                    <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Image attached for response
                    </span>
                  </div>
                  <button
                    onClick={() => setReplyImage('')}
                    className="text-slate-400 hover:text-rose-400 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Reply Input Box */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-800 flex items-center gap-2">
                <label 
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-xl border border-slate-800 cursor-pointer transition-colors shrink-0" 
                  title="Attach Screenshot / Image"
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageFile(e, true)}
                    className="hidden"
                  />
                  <ImageIcon className="w-4 h-4" />
                </label>

                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={user.role === 'admin' ? "Reply to client inquiry as Official Support..." : "Type your reply message..."}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={replyLoading || (!replyText.trim() && !replyImage)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 shrink-0"
                >
                  {replyLoading ? 'Sending...' : (
                    <>
                      <span>Reply</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <Headphones className="w-10 h-10 text-slate-600" />
              <p className="text-xs">Select a ticket from the left column to view conversation history.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Support Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-emerald-400" />
                Submit New Customer Inquiry
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Subject / Brief Summary</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Deposit confirmation delay inquiry"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="Deposit">Deposit Inquiry</option>
                    <option value="Withdrawal">Withdrawal / Wire</option>
                    <option value="Account">Account Limits</option>
                    <option value="Security">Security & 2FA</option>
                    <option value="General">General Banking</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High (Urgent)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Detailed Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe your issue or question in detail..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-white outline-none resize-none"
                  required
                />
              </div>

              {/* Attach Screenshot / Proof */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Attach Image / Screenshot (Optional)</label>
                <label className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <Paperclip className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400 text-xs truncate">
                    {createImage ? 'Image attached successfully' : 'Upload photo, receipt or document (Max 5MB)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageFile(e, false)}
                    className="hidden"
                  />
                </label>
                {createImage && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={createImage} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-700" />
                    <button
                      type="button"
                      onClick={() => setCreateImage('')}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={createLoading || !subject.trim() || !message.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {createLoading ? 'Submitting...' : 'Submit Support Ticket'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Full-screen Image Lightbox Modal */}
      {selectedImageModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl">
            <button
              onClick={() => setSelectedImageModal(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={selectedImageModal} alt="Expanded View" className="max-h-[80vh] w-auto mx-auto rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
