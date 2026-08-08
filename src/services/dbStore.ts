import { User, Transaction, UserNotification, SupportTicket, VirtualCard, BillPayment, CryptoActivationDeposit, Tier3VerificationRequest, AuditLog } from '../types';

const STORAGE_KEY = 'svb_core_ledger_v2';
const TOKEN_KEY = 'svb_auth_token_v2';

interface DBStructure {
  users: User[];
  transactions: Transaction[];
  notifications: UserNotification[];
  supportTickets: SupportTicket[];
  virtualCards: VirtualCard[];
  billPayments: BillPayment[];
  cryptoDeposits: CryptoActivationDeposit[];
  verifications: Tier3VerificationRequest[];
  auditLogs: AuditLog[];
  cryptoAddresses: { BTC: string; USDT: string };
}

const DEFAULT_USERS: User[] = [
  {
    id: 'usr-admin-001',
    fullName: 'Silicon Valley Bank Admin',
    email: 'admin@svb.com',
    phone: '+1 (555) 019-2834',
    accountNumber: '1098234710',
    role: 'admin',
    balance: 5000000.00,
    ledgerBalance: 5000000.00,
    currency: 'USD',
    address: '3000 Sand Hill Rd, Menlo Park, CA 94025',
    country: 'United States',
    verificationTier: 'Tier 3',
    status: 'Active',
    accountPin: '1234',
    fourDigitCode: '8842',
    transferCodeApproved: true,
    createdAt: new Date('2024-01-01').toISOString()
  },
  {
    id: 'usr-alex-002',
    fullName: 'Alex Wright',
    email: 'alex.wright@svb.com',
    phone: '+1 (555) 014-9982',
    accountNumber: '1048291034',
    role: 'user',
    balance: 248500.00,
    ledgerBalance: 248500.00,
    currency: 'USD',
    address: '100 Sand Hill Road, Suite 400, Palo Alto, CA 94301',
    country: 'United States',
    verificationTier: 'Tier 1',
    status: 'Active',
    accountPin: '1234',
    fourDigitCode: '8842',
    transferCodeApproved: true,
    createdAt: new Date('2024-02-15').toISOString()
  },
  {
    id: 'usr-client-003',
    fullName: 'SVB Client User',
    email: 'user@svb.com',
    phone: '+1 (555) 012-3456',
    accountNumber: '1099201948',
    role: 'user',
    balance: 150000.00,
    ledgerBalance: 150000.00,
    currency: 'USD',
    address: '500 Tech Circle, San Jose, CA 95110',
    country: 'United States',
    verificationTier: 'Tier 1',
    status: 'Active',
    accountPin: '1234',
    fourDigitCode: '1234',
    transferCodeApproved: true,
    createdAt: new Date('2024-03-01').toISOString()
  },
  {
    id: 'usr-dominic-global',
    fullName: 'Dominic Global',
    email: 'dominicglobalenergysolution@gmail.com',
    phone: '09064718123',
    accountNumber: '102576690868',
    role: 'user',
    balance: 0.00,
    ledgerBalance: 0.00,
    currency: 'USD',
    address: 'Global Energy Solution HQ',
    country: 'United States',
    verificationTier: 'Tier 1',
    status: 'Active',
    accountPin: '1234',
    fourDigitCode: '8842',
    transferCodeApproved: true,
    createdAt: new Date('2024-03-01').toISOString()
  }
];

const DEFAULT_TRANSACTIONS: Transaction[] = [
  {
    id: 'TXN-1001',
    userId: 'usr-alex-002',
    userEmail: 'alex.wright@svb.com',
    accountNumber: '1048291034',
    amount: 250000.00,
    currency: 'USD',
    type: 'Credit Deposit',
    status: 'Completed',
    reference: 'INIT-99201',
    description: 'Initial Venture Capital Treasury Deposit',
    createdAt: new Date('2024-02-15T10:00:00Z').toISOString(),
    updatedAt: new Date('2024-02-15T10:00:00Z').toISOString()
  },
  {
    id: 'TXN-1002',
    userId: 'usr-alex-002',
    userEmail: 'alex.wright@svb.com',
    accountNumber: '1048291034',
    amount: 1500.00,
    currency: 'USD',
    type: 'Wire Transfer',
    status: 'Completed',
    reference: 'WIRE-88219',
    description: 'Cloud Infrastructure Provider Payment',
    createdAt: new Date('2024-03-01T14:30:00Z').toISOString(),
    updatedAt: new Date('2024-03-01T14:30:00Z').toISOString()
  }
];

const EXTRA_USERS_KEY = 'svb_registered_users_v2';

function getInitialDB(): DBStructure {
  let loadedUsers: User[] = [];
  try {
    const rawExtra = localStorage.getItem(EXTRA_USERS_KEY);
    if (rawExtra) {
      const parsedExtra = JSON.parse(rawExtra);
      if (Array.isArray(parsedExtra)) {
        loadedUsers = parsedExtra;
      }
    }
  } catch (e) {
    console.warn('Error reading extra users', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users)) {
        const userMap = new Map<string, User>();
        
        // Load default users first
        for (const defUser of DEFAULT_USERS) {
          if (defUser && defUser.email) {
            userMap.set(defUser.email.toLowerCase(), defUser);
          }
        }

        // Merge users from main storage
        for (const u of parsed.users) {
          if (u && u.email) {
            userMap.set(u.email.toLowerCase(), { ...userMap.get(u.email.toLowerCase()), ...u });
          }
        }

        // Merge users from extra registered backup
        for (const u of loadedUsers) {
          if (u && u.email) {
            userMap.set(u.email.toLowerCase(), { ...userMap.get(u.email.toLowerCase()), ...u });
          }
        }

        parsed.users = Array.from(userMap.values());
        parsed.transactions = parsed.transactions || DEFAULT_TRANSACTIONS;
        parsed.notifications = parsed.notifications || [];
        parsed.supportTickets = parsed.supportTickets || [];
        parsed.virtualCards = parsed.virtualCards || [];
        parsed.billPayments = parsed.billPayments || [];
        parsed.cryptoDeposits = parsed.cryptoDeposits || [];
        parsed.verifications = parsed.verifications || [];
        parsed.auditLogs = parsed.auditLogs || [];
        if (!parsed.cryptoAddresses) {
          parsed.cryptoAddresses = {
            BTC: 'bc1q9v8h9svb3x0k49z82lq09fw2zxl184p24a8svb',
            USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
          };
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading local DB', e);
  }

  const userMap = new Map<string, User>();
  for (const defUser of DEFAULT_USERS) {
    userMap.set(defUser.email.toLowerCase(), defUser);
  }
  for (const extra of loadedUsers) {
    if (extra && extra.email) {
      userMap.set(extra.email.toLowerCase(), extra);
    }
  }

  const initial: DBStructure = {
    users: Array.from(userMap.values()),
    transactions: DEFAULT_TRANSACTIONS,
    notifications: [
      {
        id: 'NOTIF-1',
        userId: 'usr-alex-002',
        title: 'Welcome to Silicon Valley Bank',
        message: 'Your commercial account #1048291034 is active with $248,500.00 USD balance.',
        amount: 248500,
        currency: 'USD',
        reference: 'INIT-99201',
        read: false,
        createdAt: new Date().toISOString()
      }
    ],
    supportTickets: [],
    virtualCards: [
      {
        id: 'CARD-1',
        userId: 'usr-alex-002',
        cardNumber: '4532 •••• •••• 8819',
        cardholderName: 'ALEX WRIGHT',
        expiryMonth: '08',
        expiryYear: '28',
        cvv: '849',
        cardType: 'Visa Corporate',
        category: 'Business',
        spendingLimit: 25000,
        spentAmount: 1240,
        status: 'Active',
        createdAt: new Date().toISOString()
      }
    ],
    billPayments: [],
    cryptoDeposits: [],
    verifications: [],
    auditLogs: [],
    cryptoAddresses: {
      BTC: 'bc1q9v8h9svb3x0k49z82lq09fw2zxl184p24a8svb',
      USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    }
  };

  saveDB(initial);
  return initial;
}

function saveDB(db: DBStructure): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (db && Array.isArray(db.users)) {
      localStorage.setItem(EXTRA_USERS_KEY, JSON.stringify(db.users));
    }
  } catch (e) {
    console.error('Error saving local DB', e);
  }
}

class LocalDBStore {
  private db: DBStructure;

  constructor() {
    this.db = getInitialDB();
  }

  private refresh() {
    this.db = getInitialDB();
  }

  private persist() {
    saveDB(this.db);
  }

  // Token Management
  getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setStoredToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  removeStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  // Auth & Users
  getUsers(): User[] {
    this.refresh();
    return this.db.users;
  }

  getUserById(id: string): User | null {
    if (!id) return null;
    this.refresh();
    const clean = id.trim().toLowerCase();
    const cleanNum = clean.replace(/[^0-9]/g, '');

    return (
      this.db.users.find(u => 
        u.id === id || 
        u.id.toLowerCase() === clean || 
        u.email.toLowerCase() === clean ||
        u.accountNumber === id ||
        (cleanNum.length > 0 && u.accountNumber.replace(/[^0-9]/g, '') === cleanNum)
      ) || null
    );
  }

  getUserByEmail(email: string): User | null {
    if (!email) return null;
    this.refresh();
    const clean = email.trim().toLowerCase();
    const cleanNum = clean.replace(/[^0-9]/g, '');

    return (
      this.db.users.find(u => 
        u.email.toLowerCase() === clean || 
        u.accountNumber.toLowerCase() === clean ||
        (cleanNum.length > 0 && u.accountNumber.replace(/[^0-9]/g, '') === cleanNum) ||
        u.id.toLowerCase() === clean
      ) || null
    );
  }

  getCurrentUser(): User | null {
    const token = this.getStoredToken();
    if (!token) return null;
    return this.getUserById(token) || this.getUserByEmail(token);
  }

  saveUser(user: User): User {
    this.refresh();
    const idx = this.db.users.findIndex(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      this.db.users[idx] = { ...this.db.users[idx], ...user };
    } else {
      this.db.users.push(user);
    }
    this.persist();
    return user;
  }

  // Transactions
  getTransactions(userId?: string): Transaction[] {
    this.refresh();
    if (userId) {
      return this.db.transactions.filter(t => t.userId === userId);
    }
    return this.db.transactions;
  }

  addTransaction(txn: Transaction): Transaction {
    this.refresh();
    this.db.transactions.unshift(txn);
    this.persist();
    return txn;
  }

  updateTransaction(id: string, updates: Partial<Transaction>): Transaction | null {
    this.refresh();
    const idx = this.db.transactions.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.db.transactions[idx] = { ...this.db.transactions[idx], ...updates, updatedAt: new Date().toISOString() };
      this.persist();
      return this.db.transactions[idx];
    }
    return null;
  }

  // Notifications
  getNotifications(userId: string): UserNotification[] {
    this.refresh();
    return this.db.notifications.filter(n => n.userId === userId);
  }

  addNotification(notif: UserNotification): void {
    this.refresh();
    this.db.notifications.unshift(notif);
    this.persist();
  }

  markNotificationsRead(userId: string): void {
    this.refresh();
    this.db.notifications.forEach(n => {
      if (n.userId === userId) n.read = true;
    });
    this.persist();
  }

  // Support Tickets
  getSupportTickets(userId?: string, isAdmin?: boolean): SupportTicket[] {
    this.refresh();
    if (isAdmin) return this.db.supportTickets;
    return this.db.supportTickets.filter(t => t.userId === userId);
  }

  addSupportTicket(ticket: SupportTicket): SupportTicket {
    this.refresh();
    this.db.supportTickets.unshift(ticket);
    this.persist();
    return ticket;
  }

  updateSupportTicket(ticket: SupportTicket): SupportTicket {
    this.refresh();
    const idx = this.db.supportTickets.findIndex(t => t.id === ticket.id);
    if (idx >= 0) {
      this.db.supportTickets[idx] = ticket;
      this.persist();
    }
    return ticket;
  }

  // Virtual Cards
  getVirtualCards(userId: string): VirtualCard[] {
    this.refresh();
    return this.db.virtualCards.filter(c => c.userId === userId);
  }

  addVirtualCard(card: VirtualCard): VirtualCard {
    this.refresh();
    this.db.virtualCards.unshift(card);
    this.persist();
    return card;
  }

  // Bill Payments
  getBillPayments(userId: string): BillPayment[] {
    this.refresh();
    return this.db.billPayments.filter(b => b.userId === userId);
  }

  addBillPayment(bill: BillPayment): BillPayment {
    this.refresh();
    this.db.billPayments.unshift(bill);
    this.persist();
    return bill;
  }

  // Crypto Activation Deposits
  getCryptoDeposits(): CryptoActivationDeposit[] {
    this.refresh();
    return this.db.cryptoDeposits;
  }

  addCryptoDeposit(dep: CryptoActivationDeposit): CryptoActivationDeposit {
    this.refresh();
    this.db.cryptoDeposits.unshift(dep);
    this.persist();
    return dep;
  }

  updateCryptoDeposit(id: string, updates: Partial<CryptoActivationDeposit>): void {
    this.refresh();
    const idx = this.db.cryptoDeposits.findIndex(d => d.id === id);
    if (idx >= 0) {
      this.db.cryptoDeposits[idx] = { ...this.db.cryptoDeposits[idx], ...updates };
      this.persist();
    }
  }

  // Verifications
  getVerifications(): Tier3VerificationRequest[] {
    this.refresh();
    return this.db.verifications;
  }

  addVerification(req: Tier3VerificationRequest): Tier3VerificationRequest {
    this.refresh();
    this.db.verifications.unshift(req);
    this.persist();
    return req;
  }

  updateVerification(id: string, updates: Partial<Tier3VerificationRequest>): void {
    this.refresh();
    const idx = this.db.verifications.findIndex(v => v.id === id);
    if (idx >= 0) {
      this.db.verifications[idx] = { ...this.db.verifications[idx], ...updates };
      this.persist();
    }
  }

  // Audit Logs
  getAuditLogs(): AuditLog[] {
    this.refresh();
    return this.db.auditLogs;
  }

  addAuditLog(log: AuditLog): void {
    this.refresh();
    this.db.auditLogs.unshift(log);
    this.persist();
  }

  // Crypto Addresses
  getCryptoAddresses() {
    this.refresh();
    return this.db.cryptoAddresses;
  }

  updateCryptoAddresses(addresses: { BTC: string; USDT: string }) {
    this.refresh();
    this.db.cryptoAddresses = addresses;
    this.persist();
    return addresses;
  }
}

export const dbStore = new LocalDBStore();
