import { User, Transaction, AuditLog, UserNotification, DepositPayload, TransferPayload, WithdrawPayload, VirtualCard, BillPayment, SupportTicket, AuthResponse, CryptoActivationDeposit } from '../types';

const TOKEN_KEY = 'user_auth_token';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setStoredToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

const authHeaders = () => {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const api = {
  // Auth
  async register(data: { fullName: string; email: string; phone: string; password: string; accountPin?: string }): Promise<AuthResponse> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Registration failed');
    setStoredToken(json.token);
    return json;
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Login failed');
    setStoredToken(json.token);
    return json;
  },

  async getMe(): Promise<{ user: User }> {
    const res = await fetch('/api/auth/me', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Session expired');
    return json;
  },

  // User Actions
  async getTransactions(): Promise<{ transactions: Transaction[] }> {
    const res = await fetch('/api/user/transactions', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch transactions');
    return json;
  },

  async updateProfile(updates: Partial<User>): Promise<{ user: User }> {
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(updates)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update profile');
    return json;
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to change password');
    return json;
  },

  async lookupAccount(accountNumber: string): Promise<{ found: boolean; fullName?: string; accountNumber?: string }> {
    const res = await fetch(`/api/user/account-lookup/${encodeURIComponent(accountNumber)}`, { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) return { found: false };
    return json;
  },

  async sendTransfer(payload: TransferPayload): Promise<{ message: string; updatedUser: User; transaction: Transaction }> {
    const res = await fetch('/api/user/transfer', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Transfer failed');
    return json;
  },

  async withdrawFunds(payload: WithdrawPayload): Promise<{ message: string; updatedUser: User; transaction: Transaction }> {
    const res = await fetch('/api/user/withdraw', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Withdrawal failed');
    return json;
  },

  // Virtual Cards
  async getVirtualCards(): Promise<{ cards: VirtualCard[] }> {
    const res = await fetch('/api/user/cards', { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch virtual cards');
    return json;
  },

  async createVirtualCard(data: { cardType: string; category: string; spendingLimit: number }): Promise<{ card: VirtualCard }> {
    const res = await fetch('/api/user/cards', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create virtual card');
    return json;
  },

  async toggleVirtualCard(cardId: string): Promise<{ card: VirtualCard }> {
    const res = await fetch(`/api/user/cards/${cardId}/toggle`, {
      method: 'PATCH',
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to toggle card');
    return json;
  },

  // Bill Payments
  async getBillPayments(): Promise<{ bills: BillPayment[] }> {
    const res = await fetch('/api/user/bills', { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch bill payments');
    return json;
  },

  async payBill(data: { billerName: string; billerCategory: string; amount: number; reference?: string; fourDigitCode?: string }): Promise<{ message: string; updatedUser: User; billPayment: BillPayment; transaction: Transaction }> {
    const res = await fetch('/api/user/bills/pay', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Bill payment failed');
    return json;
  },

  // Crypto Addresses
  async getCryptoAddresses(): Promise<{ addresses: { BTC: string; USDT: string } }> {
    const res = await fetch('/api/crypto-addresses');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch deposit addresses');
    return json;
  },

  async updateCryptoAddresses(addresses: { BTC?: string; USDT?: string }): Promise<{ addresses: { BTC: string; USDT: string } }> {
    const res = await fetch('/api/admin/crypto-addresses', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(addresses)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update deposit addresses');
    return json;
  },

  // Crypto Activation & Admin Extra Actions
  async submitCryptoActivationDeposit(data: { cryptoMethod: 'BTC' | 'USDT'; txHash?: string; proofNote?: string } | 'BTC' | 'USDT', txHashArg?: string, proofNoteArg?: string): Promise<{ deposit: CryptoActivationDeposit; user: User }> {
    const payload = typeof data === 'object' 
      ? data 
      : { cryptoMethod: data, txHash: txHashArg, proofNote: proofNoteArg };

    const res = await fetch('/api/user/crypto-activation-deposit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to submit activation deposit');
    return json;
  },

  async getCryptoActivationDeposits(): Promise<{ deposits: CryptoActivationDeposit[] }> {
    const res = await fetch('/api/admin/crypto-activation-deposits', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch activation deposits');
    return json;
  },

  async approveCryptoActivationDeposit(depositId: string): Promise<{ message: string; deposit: CryptoActivationDeposit; user: User; code: string }> {
    const res = await fetch('/api/admin/approve-crypto-activation-deposit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ depositId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to approve activation deposit');
    return json;
  },

  async rejectCryptoActivationDeposit(depositId: string): Promise<{ message: string; deposit: CryptoActivationDeposit; user: User }> {
    const res = await fetch('/api/admin/reject-crypto-activation-deposit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ depositId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to reject activation deposit');
    return json;
  },

  async adminWithdraw(payload: WithdrawPayload): Promise<{ message: string; updatedUser: User; transaction: Transaction }> {
    const res = await fetch('/api/admin/withdraw', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Admin withdrawal failed');
    return json;
  },

  async adminCancelTransaction(transactionId: string): Promise<{ message: string; transaction: Transaction }> {
    const res = await fetch('/api/admin/cancel-transaction', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ transactionId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to cancel transaction');
    return json;
  },

  // Password Reset
  async requestPasswordReset(email: string): Promise<{ message: string; code: string }> {
    const res = await fetch('/api/auth/reset-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Reset request failed');
    return json;
  },

  async verifyAndResetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/reset-password/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Password reset failed');
    return json;
  },

  // Support Tickets
  async getSupportTickets(): Promise<{ tickets: SupportTicket[] }> {
    const res = await fetch('/api/support/tickets', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch tickets');
    return json;
  },

  async createSupportTicket(data: { subject: string; category: string; priority: string; message: string }): Promise<{ ticket: SupportTicket }> {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create support ticket');
    return json;
  },

  async replySupportTicket(ticketId: string, message: string): Promise<{ ticket: SupportTicket }> {
    const res = await fetch(`/api/support/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send reply');
    return json;
  },

  async updateTicketStatus(ticketId: string, status: string): Promise<{ ticket: SupportTicket }> {
    const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update ticket status');
    return json;
  },

  async getNotifications(): Promise<{ notifications: UserNotification[] }> {
    const res = await fetch('/api/user/notifications', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch notifications');
    return json;
  },

  async markNotificationsRead(): Promise<void> {
    await fetch('/api/user/notifications/mark-read', {
      method: 'POST',
      headers: authHeaders()
    });
  },

  // Admin
  async searchUsers(query: string): Promise<{ users: User[] }> {
    const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to search users');
    return json;
  },

  async getAllUsers(): Promise<{ users: User[] }> {
    const res = await fetch('/api/admin/users', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch users');
    return json;
  },

  async createDeposit(payload: DepositPayload): Promise<{ message: string; updatedUser: User; transaction: Transaction }> {
    const res = await fetch('/api/admin/deposit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create deposit');
    return json;
  },

  async getAuditLogs(): Promise<{ auditLogs: AuditLog[] }> {
    const res = await fetch('/api/admin/audit-logs', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch audit logs');
    return json;
  },

  async getAllTransactions(): Promise<{ transactions: Transaction[] }> {
    const res = await fetch('/api/admin/transactions', {
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch system transactions');
    return json;
  },

  async regenerateFourDigitCode(userId: string): Promise<{ message: string; user: User; code: string }> {
    const res = await fetch(`/api/admin/users/${userId}/regenerate-code`, {
      method: 'POST',
      headers: authHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to regenerate 4-Digit Code');
    return json;
  },

  async approveTransaction(transactionId: string, senderName?: string): Promise<{ message: string; transaction: Transaction }> {
    const res = await fetch('/api/admin/approve-transaction', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ transactionId, senderName })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to approve transaction');
    return json;
  },

  async rejectTransaction(transactionId: string, reason?: string): Promise<{ message: string; transaction: Transaction }> {
    const res = await fetch('/api/admin/reject-transaction', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ transactionId, reason })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to reject transaction');
    return json;
  },

  async toggleRole(userId: string, role: 'user' | 'admin'): Promise<{ user: User }> {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ role })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to change role');
    return json;
  }
};
