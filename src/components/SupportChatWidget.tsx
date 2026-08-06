import React, { useState, useEffect, useRef } from 'react';
import { User, SupportTicket } from '../types';
import { api } from '../services/api';
import { MessageSquare, X, Send, Headphones, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';

interface SupportChatWidgetProps {
  user: User;
}

export const SupportChatWidget: React.FC<SupportChatWidgetProps> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchUserTickets = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getSupportTickets();
      const userTickets = res.tickets || [];
      setTickets(userTickets);

      if (userTickets.length > 0) {
        const latest = userTickets[0]; // most recent
        setActiveTicket(latest);

        // Check if latest message is from support and created recently or unread
        const lastMsg = latest.messages[latest.messages.length - 1];
        if (lastMsg && lastMsg.senderRole === 'admin' && !isOpen) {
          setHasUnread(true);
        }
      }
    } catch (err) {
      console.error('Failed to load support chat:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserTickets();
    const interval = setInterval(() => {
      fetchUserTickets(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, activeTicket?.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    try {
      setSending(true);
      if (activeTicket) {
        const res = await api.replySupportTicket(activeTicket.id, messageText.trim());
        setActiveTicket(res.ticket);
      } else {
        const res = await api.createSupportTicket({
          subject: 'Customer Support Consultation',
          category: 'General',
          priority: 'Medium',
          message: messageText.trim()
        });
        setActiveTicket(res.ticket);
        fetchUserTickets(true);
      }
      setMessageText('');
    } catch (err: any) {
      alert(err.message || 'Failed to send message to Customer Support.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-4 py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all transform hover:scale-105 border border-emerald-400/30"
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5 text-slate-950" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-slate-950 animate-ping" />
            )}
          </div>
          <span className="text-xs font-bold tracking-wide">Live Support</span>
          {hasUnread && (
            <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
              New
            </span>
          )}
        </button>
      )}

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[500px] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white">SVB Customer Support</h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] text-slate-400">24/7 Dedicated Client Desk • Online</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/40 text-xs">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !activeTicket || activeTicket.messages.length === 0 ? (
              <div className="text-center py-10 text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-200 text-xs">Welcome to Client Support</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] mx-auto">
                    How can we assist you today? Send a message below to connect directly with our support team.
                  </p>
                </div>
              </div>
            ) : (
              activeTicket.messages.map((m) => {
                const isUser = m.senderRole === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[85%] ${
                      isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                      <span className="font-semibold text-slate-300">
                        {isUser ? 'You' : 'Customer Support'}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs text-slate-100 ${
                        isUser
                          ? 'bg-emerald-600/30 border border-emerald-500/40 rounded-tr-none'
                          : 'bg-slate-900 border border-slate-800 rounded-tl-none text-slate-200'
                      }`}
                    >
                      {m.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Footer */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message to support..."
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={sending || !messageText.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold p-2.5 rounded-xl transition-all disabled:opacity-50 shrink-0"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
