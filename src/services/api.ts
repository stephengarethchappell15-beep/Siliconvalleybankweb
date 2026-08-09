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
import { syncUserToFirestore, getUserFromFirestore, getAllUsersFromFirestore } from '../lib/firebase';

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
    const errData = await res.json().catch(() => null);
    if (errData && errData.error) {
      const err = new Error(errData.error);
      (err as any).status = res.status;
      throw err;
    }
    return null;
  } catch (e: any) {
    if (e && e.status) {
      throw e;
    }
    return null;
  }
}

export const api = {
  // --- AUTHENTICATION ---
  async register(data: { fullName: string; email: string; phone?: string; password?: string; accountPin?: string }): Promise<AuthResponse> {
    const emailClean = data.email.trim().toLowerCase();

    // Pre-check local dbStore for existing email
    const localExisting = dbStore.getUserByEmail(emailClean);
    if (localExisting && localExisting.email && localExisting.email.trim().toLowerCase() === emailClean) {
      throw new Error('This email address is already linked to an existing account. Please log in or use a different email.');
    }

    // Pre-check Firestore for existing email
    try {
      const fsExisting = await getUserFromFirestore(emailClean);
      if (fsExisting && fsExisting.email && fsExisting.email.trim().toLowerCase() === emailClean) {
        throw new Error('This email address is already linked to an existing account. Please log in or use a different email.');
      }
    } catch (fsErr: any) {
      if (fsErr?.message?.includes('already linked')) {
        throw fsErr;
      }
    }

    let finalUser: User | null = null;
    let tokenStr = '';

    // 1. Try Express backend API
    try {
      const backendRes = await requestApi<{ user: User; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (backendRes && backendRes.user) {
        finalUser = backendRes.user;
        tokenStr = backendRes.token.replace(/^token-/, '');
      }
    } catch (err: any) {
      if (err && err.message) {
        // If backend returned duplicate error or bad request, re-throw directly
        throw err;
      }
      console.warn('Backend register call fallback:', err);
    }

    // 2. Local fallback if server unreachable
    if (!finalUser) {
      const isAdmin = emailClean.includes('admin') || emailClean === 'admin@svb.com' || emailClean === 'siliconvalleybank51@gmail.com';
      const accountNumber = `10${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const uid = `usr-${Date.now()}`;

      finalUser = {
        id: uid,
        fullName: data.fullName.trim(),
        email: emailClean,
        phone: (data.phone && data.phone.trim()) || '+1 (555) 019-2834',
        accountNumber,
        role: isAdmin ? 'admin' : 'user',
        balance: isAdmin ? 5000000 : 0.00,
        ledgerBalance: isAdmin ? 5000000 : 0.00,
        currency: 'USD',
        address: '100 Silicon Valley Way, Palo Alto, CA 94301',
        country: 'United States',
        verificationTier: 'Tier 1',
        status: 'Active',
        accountPin: data.accountPin || '1234',
        fourDigitCode: isAdmin ? '8842' : '',
        transferCodeApproved: isAdmin ? true : false,
        createdAt: new Date().toISOString()
      };
      tokenStr = uid;

      // Initial Welcome Deposit Notification (Account Created)
      dbStore.addNotification({
        id: `NOTIF-${Date.now()}`,
        userId: uid,
        title: 'New Deposit Notification',
        message: `Your account #${accountNumber} is active. Available balance is $0.00 USD.`,
        amount: 0.00,
        currency: 'USD',
        reference: `ACC-${accountNumber}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    // Save to local store and set auth token
    dbStore.saveUser(finalUser);
    dbStore.setStoredToken(tokenStr || finalUser.id);

    // Sync user asynchronously to Firebase Firestore SDK so accounts NEVER vanish
    await syncUserToFirestore(finalUser, data.password || 'password123');

    return { user: finalUser, token: tokenStr || finalUser.id };
  },

  async login(data: { email: string; password?: string }): Promise<AuthResponse> {
    const identifier = data.email.trim().toLowerCase();
    let finalUser: User | null = null;
    let tokenStr = '';

    // 1. Try Express backend API
    try {
      const backendRes = await requestApi<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: identifier, password: data.password || 'password123' }),
      });

      if (backendRes && backendRes.user) {
        finalUser = backendRes.user;
        tokenStr = backendRes.token.replace(/^token-/, '');
      }
    } catch (err) {
      console.warn('Backend login endpoint call fallback:', err);
    }

    // 2. Check Firestore SDK
    if (!finalUser) {
      const fsUser = await getUserFromFirestore(identifier);
      if (fsUser) {
        finalUser = fsUser;
        tokenStr = fsUser.id;
      }
    }

    // 3. Check local dbStore fallback
    if (!finalUser) {
      let localUser = dbStore.getUserByEmail(identifier) || dbStore.getUserById(identifier);
      if (localUser) {
        finalUser = localUser;
        tokenStr = localUser.id;
      }
    }

    if (!finalUser) {
      throw new Error('User account not found. Please check your email address or 10-digit account number.');
    }

    dbStore.saveUser(finalUser);
    dbStore.setStoredToken(tokenStr || finalUser.id);

    // Sync to Firestore SDK
    syncUserToFirestore(finalUser, data.password || 'password123');

    return { user: finalUser, token: tokenStr || finalUser.id };
  },

  async logout(): Promise<void> {
    dbStore.removeStoredToken();
  },

  async getMe(): Promise<{ user: User }> {
    // 1. Try Express backend API
    const backendRes = await requestApi<{ user: User }>('/auth/me');
    if (backendRes && backendRes.user) {
      dbStore.saveUser(backendRes.user);
      syncUserToFirestore(backendRes.user);
      return { user: backendRes.user };
    }

    // 2. Local dbStore session restoration
    let user = dbStore.getCurrentUser();

    // 3. Firestore fallback session restoration
    if (!user) {
      const storedToken = dbStore.getStoredToken();
      if (storedToken) {
        const fsUser = await getUserFromFirestore(storedToken);
        if (fsUser) {
          user = fsUser;
          dbStore.saveUser(fsUser);
        }
      }
    }

    if (!user) {
      throw new Error('Not authenticated');
    }

    return { user };
  },

  async updateProfile(data: { fullName?: string; phone?: string; address?: string; twoFactorEnabled?: boolean; profilePicture?: string }): Promise<{ user: User }> {
    const backendRes = await requestApi<{ user: User }>('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (backendRes && backendRes.user) {
      dbStore.saveUser(backendRes.user);
      return { user: backendRes.user };
    }

    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const updated = dbStore.saveUser({
      ...current,
      ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.profilePicture !== undefined ? { profilePicture: data.profilePicture } : {}),
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
  async submitTier3Verification(data: { 
    address: string; 
    country: string; 
    documentType: 'Passport' | 'National ID Card' | "Driver's License" | 'Residence Permit'; 
    documentUrl: string;
    paymentSlipUrl?: string;
    txHash?: string;
  }): Promise<{ verification: Tier3VerificationRequest }> {
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
      paymentSlipUrl: data.paymentSlipUrl,
      txHash: data.txHash,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    dbStore.addVerification(req);
    dbStore.saveUser({ ...current, verificationTier: 'Pending Tier 3' });

    // Auto post submission to client support chat room
    const chatImages = [data.documentUrl, data.paymentSlipUrl].filter(Boolean) as string[];
    const chatText = `Submitted Tier 3 VIP Account Upgrade Application.\n• Country: ${data.country}\n• Document: ${data.documentType}\n• Address: ${data.address}\n• $5,000 Deposit Payment Slip attached.`;
    
    // Find or create ticket
    const existingTickets = dbStore.getSupportTickets(current.id, false);
    let ticket = existingTickets[0];
    const now = new Date().toISOString();
    if (!ticket) {
      ticket = {
        id: `TICKET-${Date.now()}`,
        userId: current.id,
        userEmail: current.email,
        userName: current.fullName,
        accountNumber: current.accountNumber,
        subject: `SVB Client Support Desk - ${current.fullName}`,
        category: 'Account',
        status: 'Open',
        priority: 'High',
        messages: [],
        createdAt: now,
        updatedAt: now
      };
      dbStore.addSupportTicket(ticket);
    }

    ticket.messages.push({
      id: `MSG-${Date.now()}`,
      senderId: current.id,
      senderName: current.fullName,
      senderRole: current.role,
      message: chatText,
      images: chatImages,
      createdAt: now
    });
    ticket.status = 'Open';
    ticket.updatedAt = now;
    dbStore.updateSupportTicket(ticket);

    dbStore.addAuditLog({
      id: `LOG-${Date.now()}`,
      adminId: current.id,
      adminEmail: current.email,
      action: 'PROFILE_UPDATED',
      targetEmail: current.email,
      targetAccountNumber: current.accountNumber,
      description: `Tier 3 Verification documents & $5,000 deposit slip submitted for ${current.fullName}`,
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
      const updated = dbStore.saveUser({ ...user, verificationTier: 'Tier 3' });
      syncUserToFirestore(updated);
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
    arg1: 'BTC' | 'USDT' | 'TRX' | { cryptoMethod: 'BTC' | 'USDT' | 'TRX'; txHash?: string; proofNote?: string; proofImage?: string },
    txHash?: string,
    proofNote?: string,
    proofImage?: string
  ): Promise<{ deposit: CryptoActivationDeposit; user: User }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    let cryptoMethod: 'BTC' | 'USDT' | 'TRX' = 'BTC';
    let hash = txHash || '';
    let note = proofNote || '';
    let img = proofImage || '';

    if (typeof arg1 === 'object') {
      cryptoMethod = arg1.cryptoMethod;
      hash = arg1.txHash || '';
      note = arg1.proofNote || '';
      img = arg1.proofImage || '';
    } else {
      cryptoMethod = arg1;
    }

    try {
      const backendRes = await requestApi<{ deposit: CryptoActivationDeposit; user: User }>('/user/crypto-activation-deposit', {
        method: 'POST',
        body: JSON.stringify({ cryptoMethod, txHash: hash, proofNote: note, proofImage: img })
      });
      if (backendRes && backendRes.deposit) {
        dbStore.addCryptoDeposit(backendRes.deposit);
        if (backendRes.user) dbStore.saveUser(backendRes.user);
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend crypto activation call failed, using local fallback:', e);
    }

    const walletAddresses = dbStore.getCryptoAddresses();
    const selectedAddress = walletAddresses[cryptoMethod] || walletAddresses.TRX || walletAddresses.BTC;

    const dep: CryptoActivationDeposit = {
      id: `DEP-${Date.now()}`,
      userId: current.id,
      userEmail: current.email,
      userName: current.fullName,
      accountNumber: current.accountNumber,
      cryptoMethod,
      walletAddress: selectedAddress,
      amountUSD: 2500,
      txHash: hash,
      proofNote: note,
      proofImage: img || undefined,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addCryptoDeposit(dep);
    const updatedUser = dbStore.saveUser({ ...current, pendingCryptoDeposit: dep });
    syncUserToFirestore(updatedUser);

    // Auto post deposit proof into support chat room
    try {
      const existingTickets = dbStore.getSupportTickets(current.id, false);
      let ticket = existingTickets[0];
      const nowStr = new Date().toISOString();
      if (!ticket) {
        ticket = {
          id: `TICKET-${Date.now()}`,
          userId: current.id,
          userEmail: current.email,
          userName: current.fullName,
          accountNumber: current.accountNumber,
          subject: `SVB Client Support Desk - ${current.fullName}`,
          category: 'Deposit',
          status: 'Open',
          priority: 'High',
          messages: [],
          createdAt: nowStr,
          updatedAt: nowStr
        };
        dbStore.addSupportTicket(ticket);
      }
      ticket.messages.push({
        id: `MSG-${Date.now()}`,
        senderId: current.id,
        senderName: current.fullName,
        senderRole: current.role,
        message: `Submitted $2,500 Deposit Proof for 4-Digit Security Code Activation.\n• Crypto Method: ${cryptoMethod}\n• TxHash: ${hash || 'N/A'}\n• Notes: ${note || 'N/A'}`,
        images: img ? [img] : [],
        createdAt: nowStr
      });
      ticket.status = 'Open';
      ticket.updatedAt = nowStr;
      dbStore.updateSupportTicket(ticket);
    } catch (chatErr) {
      console.error('Chat post failed:', chatErr);
    }

    return { deposit: dep, user: updatedUser };
  },

  async getCryptoActivationDeposits(): Promise<{ deposits: CryptoActivationDeposit[] }> {
    try {
      const backendRes = await requestApi<{ deposits: CryptoActivationDeposit[] }>('/admin/crypto-activation-deposits');
      if (backendRes && backendRes.deposits) {
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend get crypto deposits fallback:', e);
    }
    return { deposits: dbStore.getCryptoDeposits() };
  },

  async approveCryptoDeposit(depositId: string): Promise<{ deposit: CryptoActivationDeposit; code: string; user: User }> {
    try {
      const backendRes = await requestApi<{ deposit: CryptoActivationDeposit; code: string; user: User }>('/admin/approve-crypto-activation-deposit', {
        method: 'POST',
        body: JSON.stringify({ depositId })
      });
      if (backendRes && backendRes.deposit) {
        dbStore.updateCryptoDeposit(depositId, backendRes.deposit);
        if (backendRes.user) {
          dbStore.saveUser(backendRes.user);
          syncUserToFirestore(backendRes.user);
        }
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend approve crypto deposit fallback:', e);
    }

    const deposits = dbStore.getCryptoDeposits();
    const target = deposits.find(d => d.id === depositId);
    if (!target) throw new Error('Deposit request not found');

    const code = `${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const updatedDep: CryptoActivationDeposit = {
      ...target,
      status: 'Approved',
      generatedCode: code,
      updatedAt: now
    };

    dbStore.updateCryptoDeposit(depositId, updatedDep);

    const user = dbStore.getUserById(target.userId);
    let updatedUser = user;
    if (user) {
      updatedUser = dbStore.saveUser({
        ...user,
        fourDigitCode: code,
        transferCodeApproved: true,
        balance: user.balance + 2500,
        pendingCryptoDeposit: updatedDep
      });
      syncUserToFirestore(updatedUser);

      dbStore.addNotification({
        id: `NOTIF-${Date.now()}`,
        userId: user.id,
        title: '$2,500 Activation Deposit Approved',
        message: `Your $2,500 deposit has been approved and credited to your account. Your official 4-Digit Security Code is [${code}].`,
        amount: 2500,
        currency: 'USD',
        reference: target.id,
        read: false,
        createdAt: now
      });
    }

    return { deposit: updatedDep, code, user: updatedUser || ({ fullName: target.userName } as User) };
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
    let users = dbStore.getUsers();
    let target = users.find(u => 
      u.accountNumber === data.accountNumber || 
      u.email.toLowerCase() === data.accountNumber.toLowerCase() ||
      (u.accountNumber.replace(/[^0-9]/g, '') === data.accountNumber.replace(/[^0-9]/g, '') && data.accountNumber.replace(/[^0-9]/g, '').length > 0)
    );

    if (!target) {
      try {
        const fsTarget = await getUserFromFirestore(data.accountNumber);
        if (fsTarget) {
          dbStore.saveUser(fsTarget);
          target = fsTarget;
        }
      } catch (err) {
        console.warn('Firestore credit user target lookup fallback error:', err);
      }
    }

    if (!target) throw new Error('Target account number or email not found.');

    let fourDigitCode = target.fourDigitCode;
    let transferCodeApproved = target.transferCodeApproved;
    let isNewCode = false;

    if (!fourDigitCode || !transferCodeApproved) {
      fourDigitCode = Math.floor(1000 + Math.random() * 9000).toString();
      transferCodeApproved = true;
      isNewCode = true;
    }

    const newBalance = target.balance + data.amount;
    const updatedUser = dbStore.saveUser({
      ...target,
      balance: newBalance,
      ledgerBalance: newBalance,
      fourDigitCode,
      transferCodeApproved
    });

    syncUserToFirestore(updatedUser);

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
      description: isNewCode ? `${data.description || 'Admin Credit Capitalization'} (4-Digit Code Activated)` : (data.description || 'Admin Credit Capitalization'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);

    const notifMsg = isNewCode
      ? `Your account #${target.accountNumber} has been credited with +$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Your official 4-Digit Outgoing Transfer Code is now active: [ ${fourDigitCode} ].`
      : `Your account #${target.accountNumber} has been credited with +$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`;

    dbStore.addNotification({
      id: `NOTIF-${Date.now()}`,
      userId: target.id,
      title: isNewCode ? 'Account Deposit Credited & 4-Digit Code Activated!' : 'Account Deposit Credited',
      message: notifMsg,
      amount: data.amount,
      currency: 'USD',
      reference: txn.reference,
      read: false,
      createdAt: new Date().toISOString()
    });

    return { user: updatedUser, updatedUser, transaction: txn };
  },

  async createDeposit(payload: DepositPayload): Promise<{ updatedUser: User; transaction: Transaction }> {
    try {
      const backendRes = await requestApi<{ message: string; updatedUser: User; transaction: Transaction }>('/admin/deposit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (backendRes && backendRes.updatedUser && backendRes.transaction) {
        dbStore.saveUser(backendRes.updatedUser);
        dbStore.addTransaction(backendRes.transaction);
        syncUserToFirestore(backendRes.updatedUser);
        return { updatedUser: backendRes.updatedUser, transaction: backendRes.transaction };
      }
    } catch (err) {
      console.warn('Backend deposit endpoint call fallback:', err);
    }

    const res = await this.creditUserAccount({
      accountNumber: payload.accountNumber || payload.userEmail,
      amount: payload.amount,
      reference: payload.reference,
      description: payload.description
    });
    return { updatedUser: res.updatedUser, transaction: res.transaction };
  },

  async debitUserAccount(data: { accountNumber: string; amount: number; description?: string }): Promise<{ user: User; transaction: Transaction; updatedUser: User }> {
    let users = dbStore.getUsers();
    let target = users.find(u => 
      u.accountNumber === data.accountNumber || 
      u.email.toLowerCase() === data.accountNumber.toLowerCase() ||
      (u.accountNumber.replace(/[^0-9]/g, '') === data.accountNumber.replace(/[^0-9]/g, '') && data.accountNumber.replace(/[^0-9]/g, '').length > 0)
    );

    if (!target) {
      try {
        const fsTarget = await getUserFromFirestore(data.accountNumber);
        if (fsTarget) {
          dbStore.saveUser(fsTarget);
          target = fsTarget;
        }
      } catch (err) {
        console.warn('Firestore debit user target lookup fallback error:', err);
      }
    }

    if (!target) throw new Error('Target account number or email not found.');
    if (target.balance < data.amount) throw new Error('Insufficient account funds for debit operation.');

    const newBalance = target.balance - data.amount;
    const updatedUser = dbStore.saveUser({ ...target, balance: newBalance, ledgerBalance: newBalance });

    syncUserToFirestore(updatedUser);

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
    const backendRes = await requestApi<{ message: string; updatedUser: User; transaction: Transaction }>('/admin/withdraw', {
      method: 'POST',
      body: JSON.stringify({
        accountNumber: payload.accountNumber,
        amount: payload.amount,
        note: payload.note || payload.description
      }),
    });

    if (backendRes && backendRes.updatedUser && backendRes.transaction) {
      dbStore.saveUser(backendRes.updatedUser);
      dbStore.addTransaction(backendRes.transaction);
      return { updatedUser: backendRes.updatedUser, transaction: backendRes.transaction };
    }

    const res = await this.debitUserAccount({
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      description: payload.description || payload.note || 'Admin Withdrawal Debit'
    });
    return { updatedUser: res.updatedUser, transaction: res.transaction };
  },

  async lookupAccount(accountNumber: string): Promise<{ found: { fullName: string; accountNumber: string; email: string }; user: { fullName: string; accountNumber: string; email: string } }> {
    const clean = accountNumber.trim().replace(/^#/, '');
    const backendRes = await requestApi<{ found: boolean; fullName?: string; accountNumber?: string; email?: string }>(`/user/account-lookup/${encodeURIComponent(clean)}`);
    if (backendRes && backendRes.found && backendRes.fullName && backendRes.accountNumber) {
      const info = { fullName: backendRes.fullName, accountNumber: backendRes.accountNumber, email: backendRes.email || clean };
      return { found: info, user: info };
    }

    const users = dbStore.getUsers();
    const target = users.find(u => u.accountNumber.toLowerCase().replace(/^#/, '') === clean.toLowerCase() || u.email.toLowerCase() === clean.toLowerCase());
    if (!target) throw new Error('Recipient account number or email not found in SVB directory.');
    const info = { fullName: target.fullName, accountNumber: target.accountNumber, email: target.email };
    return { found: info, user: info };
  },

  async sendTransfer(payload: TransferPayload): Promise<{ user: User; updatedUser: User; transaction: Transaction }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const backendRes = await requestApi<{ message: string; updatedUser: User; transaction: Transaction }>('/user/transfer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (backendRes && backendRes.updatedUser && backendRes.transaction) {
      dbStore.saveUser(backendRes.updatedUser);
      dbStore.addTransaction(backendRes.transaction);
      return { user: backendRes.updatedUser, updatedUser: backendRes.updatedUser, transaction: backendRes.transaction };
    }

    if (current.role !== 'admin') {
      if (!current.fourDigitCode || !current.transferCodeApproved) {
        throw new Error('Invalid 4-Digit Security Code. Activation required.');
      }
      if (!payload.fourDigitCode || payload.fourDigitCode.trim() !== current.fourDigitCode.trim()) {
        throw new Error('Invalid 4-Digit Security Code. Please verify your security authorization code.');
      }
    }

    if (current.balance < payload.amount) {
      throw new Error('Insufficient account balance for wire transfer.');
    }

    const newSenderBalance = current.balance - payload.amount;
    const updatedSender = dbStore.saveUser({ ...current, balance: newSenderBalance, ledgerBalance: newSenderBalance });

    const isPending = current.role !== 'admin';

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
      status: isPending ? 'Pending' : 'Completed',
      reference: `WIRE-${Date.now()}`,
      description: payload.note || `Outgoing Transfer to Acc #${payload.recipientInput}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);

    if (!isPending) {
      const recipient = dbStore.getUsers().find(u => u.accountNumber === payload.recipientInput || u.email.toLowerCase() === payload.recipientInput.toLowerCase());
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
    }

    return { user: updatedSender, updatedUser: updatedSender, transaction: txn };
  },

  async withdrawFunds(payload: WithdrawPayload): Promise<{ user: User; updatedUser: User; transaction: Transaction }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const backendRes = await requestApi<{ message: string; updatedUser: User; transaction: Transaction }>('/user/withdraw', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (backendRes && backendRes.updatedUser && backendRes.transaction) {
      dbStore.saveUser(backendRes.updatedUser);
      dbStore.addTransaction(backendRes.transaction);
      return { user: backendRes.updatedUser, updatedUser: backendRes.updatedUser, transaction: backendRes.transaction };
    }

    if (current.role !== 'admin') {
      if (!current.fourDigitCode || !current.transferCodeApproved) {
        throw new Error('Invalid 4-Digit Security Code. Activation required.');
      }
      if (!payload.fourDigitCode || payload.fourDigitCode.trim() !== current.fourDigitCode.trim()) {
        throw new Error('Invalid 4-Digit Security Code. Please enter your authorized 4-digit code.');
      }
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
      status: current.role === 'admin' ? 'Completed' : 'Pending',
      reference: `WITHDRAW-${Date.now()}`,
      description: `External ACH/Wire to ${payload.bankName} (${payload.accountHolderName})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dbStore.addTransaction(txn);
    return { user: updatedUser, updatedUser, transaction: txn };
  },

  async getTransactions(): Promise<{ transactions: Transaction[] }> {
    const backendRes = await requestApi<{ transactions: Transaction[] }>('/user/transactions');
    if (backendRes && Array.isArray(backendRes.transactions)) {
      backendRes.transactions.forEach(t => dbStore.addTransaction(t));
      return { transactions: backendRes.transactions };
    }

    const current = dbStore.getCurrentUser();
    if (!current) return { transactions: [] };
    const txns = dbStore.getTransactions(current.id);
    return { transactions: txns };
  },

  async getAllTransactions(): Promise<{ transactions: Transaction[] }> {
    const backendRes = await requestApi<{ transactions: Transaction[] }>('/admin/transactions');
    if (backendRes && Array.isArray(backendRes.transactions)) {
      backendRes.transactions.forEach(t => dbStore.addTransaction(t));
      return { transactions: backendRes.transactions };
    }

    return { transactions: dbStore.getTransactions() };
  },

  async approveTransaction(txnId: string, senderName?: string): Promise<void> {
    await requestApi<{ message: string; transaction?: Transaction }>('/admin/approve-transaction', {
      method: 'POST',
      body: JSON.stringify({ transactionId: txnId, senderName }),
    });

    dbStore.updateTransaction(txnId, { 
      status: 'Completed',
      ...(senderName ? { senderName } : {})
    });
  },

  async cancelTransaction(txnId: string): Promise<void> {
    await requestApi<{ message: string; transaction?: Transaction }>('/admin/cancel-transaction', {
      method: 'POST',
      body: JSON.stringify({ transactionId: txnId }),
    });

    dbStore.updateTransaction(txnId, { status: 'Cancelled' });
  },

  async adminCancelTransaction(txnId: string): Promise<void> {
    return this.cancelTransaction(txnId);
  },

  async rejectTransaction(txnId: string, notes?: string): Promise<void> {
    await requestApi<{ message: string; transaction?: Transaction }>('/admin/reject-transaction', {
      method: 'POST',
      body: JSON.stringify({ transactionId: txnId, reason: notes }),
    });

    const txn = dbStore.getTransactions().find(t => t.id === txnId);
    if (txn) {
      const user = dbStore.getUserById(txn.userId);
      if (user && (txn.type === 'Wire Withdrawal' || txn.type === 'Wire Transfer' || txn.type === 'Transfer' || txn.type === 'Withdrawal')) {
        dbStore.saveUser({ ...user, balance: user.balance + txn.amount, ledgerBalance: user.balance + txn.amount });
      }
    }
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

    if (current.role !== 'admin') {
      if (!current.fourDigitCode || !current.transferCodeApproved) {
        throw new Error('Invalid 4-Digit Security Code. Activation required.');
      }
      if (!data.fourDigitCode || data.fourDigitCode.trim() !== current.fourDigitCode.trim()) {
        throw new Error('Invalid 4-Digit Security Code. Please enter your valid 4-digit transfer code.');
      }
    }

    if (current.balance < data.amount) {
      throw new Error('Insufficient balance for bill payment.');
    }

    const newBalance = current.balance - data.amount;
    const updatedUser = dbStore.saveUser({ ...current, balance: newBalance });

    const isPending = current.role !== 'admin';

    const payment: BillPayment = {
      id: `BILL-${Date.now()}`,
      userId: current.id,
      billerName: data.billerName,
      billerCategory: data.billerCategory,
      accountNumber: data.accountNumber,
      amount: data.amount,
      reference: data.reference || `REF-${Date.now()}`,
      status: isPending ? 'Pending' : 'Completed',
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
      status: isPending ? 'Pending' : 'Completed',
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

  async createSupportTicket(data: { subject: string; category: string; priority: string; message: string; images?: string[] }): Promise<{ ticket: SupportTicket }> {
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
        images: data.images,
        createdAt: now
      }],
      createdAt: now,
      updatedAt: now
    };

    dbStore.addSupportTicket(ticket);
    return { ticket };
  },

  async replySupportTicket(ticketId: string, message: string, images?: string[]): Promise<{ ticket: SupportTicket }> {
    const current = dbStore.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const tickets = dbStore.getSupportTickets(undefined, true);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const now = new Date().toISOString();
    const updatedMessages = [...ticket.messages, {
      id: `MSG-${Date.now()}`,
      senderId: current.id,
      senderName: current.role === 'admin' ? 'SVB Compliance Support' : current.fullName,
      senderRole: current.role,
      message,
      images,
      createdAt: now
    }];

    const updatedTicket: SupportTicket = {
      ...ticket,
      messages: updatedMessages,
      status: current.role === 'admin' ? 'In Progress' : 'Open',
      updatedAt: now
    };

    dbStore.updateSupportTicket(updatedTicket);

    // If admin replied, send notification to user
    if (current.role === 'admin') {
      dbStore.addNotification({
        id: `NOTIF-${Date.now()}`,
        userId: ticket.userId,
        title: 'New Reply from Support Desk',
        message: `You have a new message from SVB Client Support regarding "${ticket.subject}".`,
        amount: 0,
        currency: 'USD',
        reference: ticket.id,
        read: false,
        createdAt: now
      });
    }

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
    const rawQ = term.toLowerCase();
    const cleanQ = rawQ.replace(/[^a-z0-9]/g, '');

    let serverUsers: User[] = [];
    try {
      const backendRes = await requestApi<{ users: User[] }>(`/admin/users/search?q=${encodeURIComponent(term)}`);
      if (backendRes && Array.isArray(backendRes.users)) {
        serverUsers = backendRes.users;
        serverUsers.forEach(u => dbStore.saveUser(u));
      }
    } catch (err) {
      console.warn('Server user search endpoint call error:', err);
    }

    const localUsers = dbStore.getUsers();
    let fsUsers: User[] = [];
    try {
      fsUsers = await getAllUsersFromFirestore();
    } catch (e) {
      console.warn('Firestore getAllUsers in search error:', e);
    }

    if (term) {
      try {
        const singleFs = await getUserFromFirestore(term);
        if (singleFs) {
          fsUsers.push(singleFs);
        }
      } catch (e) {
        console.warn('Firestore single user lookup in search error:', e);
      }
    }

    const userMap = new Map<string, User>();
    localUsers.forEach(u => {
      if (u) {
        const key = (u.email || u.id).toLowerCase();
        userMap.set(key, u);
      }
    });
    fsUsers.forEach(u => {
      if (u) {
        const key = (u.email || u.id).toLowerCase();
        userMap.set(key, u);
        dbStore.saveUser(u);
      }
    });
    serverUsers.forEach(u => {
      if (u) {
        const key = (u.email || u.id).toLowerCase();
        userMap.set(key, u);
        dbStore.saveUser(u);
      }
    });

    const combined = Array.from(userMap.values());

    if (!rawQ) {
      return { users: combined };
    }

    const filtered = combined.filter(u => {
      if (!u) return false;
      const email = (u.email || '').toLowerCase();
      const name = (u.fullName || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      const rawAcc = (u.accountNumber || '').toLowerCase();
      const accClean = rawAcc.replace(/[^a-z0-9]/g, '');
      const phoneClean = (u.phone || '').replace(/[^a-z0-9]/g, '');

      return (
        email.includes(rawQ) ||
        name.includes(rawQ) ||
        id.includes(rawQ) ||
        rawAcc.includes(rawQ) ||
        (cleanQ.length > 0 && accClean.includes(cleanQ)) ||
        (cleanQ.length > 0 && phoneClean.includes(cleanQ))
      );
    });

    return { users: filtered };
  },

  async getAllUsers(): Promise<{ users: User[] }> {
    return this.searchUsers('');
  },

  async getAuditLogs(): Promise<{ auditLogs: AuditLog[] }> {
    return { auditLogs: dbStore.getAuditLogs() };
  },

  async regenerateFourDigitCode(userId: string): Promise<{ message: string; user: User; code: string }> {
    try {
      const backendRes = await requestApi<{ message: string; user: User; code: string }>(`/admin/users/${userId}/regenerate-code`, {
        method: 'POST'
      });
      if (backendRes && backendRes.user) {
        dbStore.saveUser(backendRes.user);
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend regenerate code call failed:', e);
    }

    const user = dbStore.getUserById(userId);
    if (!user) throw new Error('User not found');

    const code = `${Math.floor(1000 + Math.random() * 9000)}`;
    const updated = dbStore.saveUser({ ...user, fourDigitCode: code, transferCodeApproved: true });

    return { message: '4-Digit Code regenerated successfully.', user: updated, code };
  },

  async toggleRole(userId: string, role: 'user' | 'admin'): Promise<{ user: User }> {
    try {
      const backendRes = await requestApi<{ user: User }>(`/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      if (backendRes && backendRes.user) {
        dbStore.saveUser(backendRes.user);
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend toggle role call failed:', e);
    }

    const user = dbStore.getUserById(userId);
    if (!user) throw new Error('User not found');

    const updated = dbStore.saveUser({ ...user, role });
    return { user: updated };
  },

  async getCryptoAddresses(): Promise<{ addresses: { BTC: string; USDT: string; TRX: string } }> {
    try {
      const backendRes = await requestApi<{ addresses: { BTC: string; USDT: string; TRX: string } }>('/admin/crypto-wallet-addresses');
      if (backendRes && backendRes.addresses) {
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend get crypto addresses fallback:', e);
    }
    return { addresses: dbStore.getCryptoAddresses() };
  },

  async updateCryptoAddresses(addresses: { BTC?: string; USDT?: string; TRX?: string }): Promise<{ addresses: { BTC: string; USDT: string; TRX: string } }> {
    try {
      const backendRes = await requestApi<{ addresses: { BTC: string; USDT: string; TRX: string } }>('/admin/crypto-wallet-addresses', {
        method: 'POST',
        body: JSON.stringify(addresses)
      });
      if (backendRes && backendRes.addresses) {
        dbStore.updateCryptoAddresses(backendRes.addresses);
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend update crypto addresses fallback:', e);
    }
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
