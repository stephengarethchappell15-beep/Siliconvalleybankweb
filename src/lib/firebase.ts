import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';
import { User, VirtualCard, CryptoActivationDeposit, Tier3VerificationRequest, Transaction, SupportTicket, SupportMessage } from '../types';

// Helper to safely get config values across Vite client and Node server
const getEnvVal = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {}
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key]!;
    if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`]!;
  }
  return '';
};

// Firebase Config using imported config or environment fallbacks
const firebaseConfig = {
  apiKey: getEnvVal('VITE_FIREBASE_API_KEY') || getEnvVal('FIREBASE_API_KEY') || config.apiKey,
  authDomain: getEnvVal('VITE_FIREBASE_AUTH_DOMAIN') || getEnvVal('FIREBASE_AUTH_DOMAIN') || config.authDomain,
  projectId: getEnvVal('VITE_FIREBASE_PROJECT_ID') || getEnvVal('FIREBASE_PROJECT_ID') || config.projectId,
  storageBucket: getEnvVal('VITE_FIREBASE_STORAGE_BUCKET') || getEnvVal('FIREBASE_STORAGE_BUCKET') || config.storageBucket,
  messagingSenderId: getEnvVal('VITE_FIREBASE_MESSAGING_SENDER_ID') || getEnvVal('FIREBASE_MESSAGING_SENDER_ID') || config.messagingSenderId,
  appId: getEnvVal('VITE_FIREBASE_APP_ID') || getEnvVal('FIREBASE_APP_ID') || config.appId,
  databaseId: getEnvVal('VITE_FIREBASE_DATABASE_ID') || getEnvVal('FIREBASE_DATABASE_ID') || config.firestoreDatabaseId
};

// Initialize Firebase App & Firestore
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.databaseId);

// Helper to remove undefined fields recursively to prevent Firestore write crashes
function cleanUndefined<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = cleanUndefined(value);
    }
  }
  return clean as T;
}

/**
 * Save or update user persistently in Firestore
 */
export async function syncUserToFirestore(user: User, password?: string): Promise<void> {
  if (!user || !user.email) return;
  try {
    const cleanEmail = user.email.trim().toLowerCase();
    const payload = cleanUndefined({
      ...user,
      email: cleanEmail,
      updatedAt: new Date().toISOString(),
      ...(password ? { password } : {})
    });

    // Save under primary user ID doc
    if (user.id) {
      await setDoc(doc(db, 'users', user.id), payload, { merge: true });
    }

    // Save under email lookup doc
    await setDoc(doc(db, 'users_by_email', cleanEmail), payload, { merge: true });

    // Save under accountNumber lookup doc if present
    if (user.accountNumber) {
      const cleanAcc = user.accountNumber.replace(/[^0-9]/g, '');
      await setDoc(doc(db, 'users_by_account', user.accountNumber), payload, { merge: true });
      if (cleanAcc) {
        await setDoc(doc(db, 'users_by_account', cleanAcc), payload, { merge: true });
      }
    }
  } catch (err) {
    console.warn('Firestore user sync warning:', err);
  }
}

/**
 * Get user by email or account number or ID from Firestore
 */
export async function getUserFromFirestore(identifier: string): Promise<User | null> {
  if (!identifier) return null;
  const raw = identifier.trim().toLowerCase();
  const cleanNum = raw.replace(/[^0-9]/g, '');

  try {
    // 1. Check direct doc lookups
    const byIdSnap = await getDoc(doc(db, 'users', identifier));
    if (byIdSnap.exists()) return byIdSnap.data() as User;

    const byEmailSnap = await getDoc(doc(db, 'users_by_email', raw));
    if (byEmailSnap.exists()) return byEmailSnap.data() as User;

    const byAccSnap = await getDoc(doc(db, 'users_by_account', identifier));
    if (byAccSnap.exists()) return byAccSnap.data() as User;

    if (cleanNum) {
      const byCleanAccSnap = await getDoc(doc(db, 'users_by_account', cleanNum));
      if (byCleanAccSnap.exists()) return byCleanAccSnap.data() as User;
    }

    // 2. Query collection fallback
    const usersRef = collection(db, 'users');
    const qEmail = query(usersRef, where('email', '==', raw));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) return snapEmail.docs[0].data() as User;

    const qAcc = query(usersRef, where('accountNumber', '==', identifier));
    const snapAcc = await getDocs(qAcc);
    if (!snapAcc.empty) return snapAcc.docs[0].data() as User;

    if (cleanNum) {
      const qCleanAcc = query(usersRef, where('accountNumber', '==', cleanNum));
      const snapCleanAcc = await getDocs(qCleanAcc);
      if (!snapCleanAcc.empty) return snapCleanAcc.docs[0].data() as User;
    }

    // 3. Complete scan fallback
    const allUsers = await getAllUsersFromFirestore();
    const matched = allUsers.find(u => {
      if (!u) return false;
      const emailClean = (u.email || '').trim().toLowerCase();
      const accRaw = (u.accountNumber || '').trim().toLowerCase();
      const accClean = accRaw.replace(/[^0-9]/g, '');
      const uid = (u.id || '').trim().toLowerCase();

      return (
        emailClean === raw ||
        accRaw === raw ||
        (cleanNum.length > 0 && accClean === cleanNum) ||
        uid === raw
      );
    });

    if (matched) return matched;
  } catch (err) {
    console.warn('Firestore user fetch error:', err);
  }

  return null;
}

/**
 * Get all users from Firestore with discovery across users, users_by_email, tickets, and transactions
 */
export async function getAllUsersFromFirestore(): Promise<User[]> {
  const userMap = new Map<string, User>();

  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach((d) => {
      if (d.exists()) {
        const data = d.data() as User;
        if (data && data.email) {
          userMap.set(data.email.toLowerCase(), data);
        }
      }
    });
  } catch (err) {
    console.warn('Firestore getAllUsers main collection error:', err);
  }

  try {
    const emailSnap = await getDocs(collection(db, 'users_by_email'));
    emailSnap.forEach((d) => {
      if (d.exists()) {
        const data = d.data() as User;
        if (data && data.email && !userMap.has(data.email.toLowerCase())) {
          userMap.set(data.email.toLowerCase(), data);
        }
      }
    });
  } catch (err) {
    console.warn('Firestore getAllUsers email collection error:', err);
  }

  // Cross-discovery: Extract active users from Support Tickets / Chats who contacted support
  try {
    const [ticketsSnap, chatsSnap] = await Promise.all([
      getDocs(collection(db, 'support_tickets')).catch(() => null),
      getDocs(collection(db, 'chats')).catch(() => null)
    ]);

    const processTicketUser = (docItem: any) => {
      if (docItem && docItem.exists()) {
        const t = docItem.data();
        const userEmail = (t.userEmail || '').trim().toLowerCase();
        if (userEmail && !userMap.has(userEmail)) {
          const synthesizedUser: User = {
            id: t.userId || `usr-${userEmail.replace(/[^a-z0-9]/g, '')}`,
            fullName: t.userName || userEmail.split('@')[0],
            email: userEmail,
            phone: '+1 (555) 019-2834',
            accountNumber: t.accountNumber || '10' + Math.floor(10000000 + Math.random() * 90000000).toString(),
            role: 'user',
            balance: 0.00,
            ledgerBalance: 0.00,
            currency: 'USD',
            address: 'Silicon Valley, CA',
            country: 'United States',
            verificationTier: 'Tier 1',
            status: 'Active',
            accountPin: '1234',
            fourDigitCode: '8842',
            transferCodeApproved: true,
            createdAt: t.createdAt || new Date().toISOString()
          };
          userMap.set(userEmail, synthesizedUser);
        }
      }
    };

    if (ticketsSnap) ticketsSnap.forEach(processTicketUser);
    if (chatsSnap) chatsSnap.forEach(processTicketUser);
  } catch (err) {
    console.warn('Firestore user discovery from tickets error:', err);
  }

  return Array.from(userMap.values());
}

/**
 * Sync Virtual Card to Firestore for permanent cross-session storage
 */
export async function syncVirtualCardToFirestore(card: VirtualCard): Promise<void> {
  if (!card || !card.id) return;
  try {
    await setDoc(doc(db, 'virtual_cards', card.id), {
      ...card,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore virtual card sync error:', err);
  }
}

/**
 * Fetch Virtual Cards for a user from Firestore
 */
export async function getVirtualCardsFromFirestore(userId: string): Promise<VirtualCard[]> {
  if (!userId) return [];
  try {
    const q = query(collection(db, 'virtual_cards'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const cards: VirtualCard[] = [];
    snap.forEach((d) => {
      if (d.exists()) cards.push(d.data() as VirtualCard);
    });
    return cards;
  } catch (err) {
    console.warn('Firestore getVirtualCards error:', err);
    return [];
  }
}

/**
 * Sync Global Crypto Wallet Deposit Addresses to Firestore
 */
export async function syncCryptoAddressesToFirestore(addresses: { BTC: string; USDT: string }): Promise<void> {
  if (!addresses) return;
  try {
    await setDoc(doc(db, 'config', 'crypto_addresses'), {
      BTC: addresses.BTC,
      USDT: addresses.USDT,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore crypto addresses sync error:', err);
  }
}

/**
 * Subscribe to Live Global Crypto Wallet Deposit Addresses from Firestore
 */
export function subscribeCryptoAddressesFromFirestore(callback: (addresses: { BTC: string; USDT: string }) => void): () => void {
  try {
    const unsub = onSnapshot(doc(db, 'config', 'crypto_addresses'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.BTC && data.USDT) {
          callback({ BTC: data.BTC, USDT: data.USDT });
        }
      }
    }, (err) => {
      console.warn('Firestore subscribeCryptoAddresses error:', err);
    });
    return unsub;
  } catch (err) {
    console.warn('Firestore subscribeCryptoAddresses catch error:', err);
    return () => {};
  }
}

/**
 * Sync Crypto Activation Deposit ($2,500 deposit for 4-digit code) to Firestore
 */
export async function syncCryptoDepositToFirestore(deposit: CryptoActivationDeposit): Promise<void> {
  if (!deposit || !deposit.id) return;
  try {
    await setDoc(doc(db, 'crypto_activation_deposits', deposit.id), {
      ...deposit,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore crypto deposit sync error:', err);
  }
}

/**
 * Get all Crypto Activation Deposits from Firestore for admin queue
 */
export async function getAllCryptoDepositsFromFirestore(): Promise<CryptoActivationDeposit[]> {
  try {
    const snap = await getDocs(collection(db, 'crypto_activation_deposits'));
    const list: CryptoActivationDeposit[] = [];
    snap.forEach((d) => {
      if (d.exists()) list.push(d.data() as CryptoActivationDeposit);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Firestore getAllCryptoDeposits error:', err);
    return [];
  }
}

/**
 * Sync Tier 3 Verification Request ($5,000 upgrade deposit) to Firestore
 */
export async function syncVerificationToFirestore(verif: Tier3VerificationRequest): Promise<void> {
  if (!verif || !verif.id) return;
  try {
    await setDoc(doc(db, 'tier3_verifications', verif.id), {
      ...verif,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore verification sync error:', err);
  }
}

/**
 * Get all Tier 3 Verification Requests from Firestore for admin queue
 */
export async function getAllVerificationsFromFirestore(): Promise<Tier3VerificationRequest[]> {
  try {
    const snap = await getDocs(collection(db, 'tier3_verifications'));
    const list: Tier3VerificationRequest[] = [];
    snap.forEach((d) => {
      if (d.exists()) list.push(d.data() as Tier3VerificationRequest);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Firestore getAllVerifications error:', err);
    return [];
  }
}

/**
 * Sync Transaction to Firestore
 */
export async function syncTransactionToFirestore(txn: Transaction): Promise<void> {
  if (!txn || (!txn.id && !txn.reference)) return;
  try {
    const docId = txn.id || txn.reference;
    const payload = cleanUndefined({
      ...txn,
      id: docId,
      updatedAt: txn.updatedAt || new Date().toISOString()
    });

    const writes = [setDoc(doc(db, 'transactions', docId), payload, { merge: true })];
    if (txn.reference && txn.reference !== docId) {
      writes.push(setDoc(doc(db, 'transactions', txn.reference), { ...payload, id: txn.reference }, { merge: true }));
    }
    if (txn.id && txn.id !== docId) {
      writes.push(setDoc(doc(db, 'transactions', txn.id), { ...payload, id: txn.id }, { merge: true }));
    }
    await Promise.all(writes);
  } catch (err) {
    console.warn('Firestore transaction sync error:', err);
  }
}

/**
 * Get Transactions for user from Firestore
 */
export async function getTransactionsFromFirestore(userId?: string): Promise<Transaction[]> {
  try {
    let q;
    if (userId) {
      q = query(collection(db, 'transactions'), where('userId', '==', userId));
    } else {
      q = collection(db, 'transactions');
    }
    const snap = await getDocs(q);
    const list: Transaction[] = [];
    snap.forEach((d) => {
      if (d.exists()) list.push(d.data() as Transaction);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Firestore getTransactions error:', err);
    return [];
  }
}

/**
 * Subscribe to real-time User snapshot updates from Firestore
 */
export function subscribeUserFromFirestore(userId: string | undefined, email: string | undefined, callback: (user: User) => void): () => void {
  const unsubs: (() => void)[] = [];

  try {
    if (userId) {
      const u1 = onSnapshot(doc(db, 'users', userId), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as User;
          if (data && data.email) callback(data);
        }
      }, (err) => console.warn('User snapshot error:', err));
      unsubs.push(u1);
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const u2 = onSnapshot(doc(db, 'users_by_email', cleanEmail), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as User;
          if (data && data.email) callback(data);
        }
      }, (err) => console.warn('User by email snapshot error:', err));
      unsubs.push(u2);
    }
  } catch (err) {
    console.warn('subscribeUserFromFirestore error:', err);
  }

  return () => {
    unsubs.forEach(u => u());
  };
}

/**
 * Subscribe to real-time Transactions snapshot updates from Firestore
 */
export function subscribeTransactionsFromFirestore(userId: string | null | undefined, callback: (txns: Transaction[]) => void): () => void {
  try {
    let q;
    if (userId) {
      q = query(collection(db, 'transactions'), where('userId', '==', userId));
    } else {
      q = collection(db, 'transactions');
    }

    const unsub = onSnapshot(q, (snap) => {
      const list: Transaction[] = [];
      snap.forEach((d) => {
        if (d.exists()) list.push(d.data() as Transaction);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    }, (err) => console.warn('Transactions snapshot error:', err));

    return unsub;
  } catch (err) {
    console.warn('subscribeTransactionsFromFirestore error:', err);
    return () => {};
  }
}

/**
 * Subscribe to real-time All Users list from Firestore
 */
export function subscribeAllUsersFromFirestore(callback: (users: User[]) => void): () => void {
  const unsubs: (() => void)[] = [];
  const userMap = new Map<string, User>();

  const emit = () => {
    callback(Array.from(userMap.values()));
  };

  try {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      snap.forEach((d) => {
        if (d.exists()) {
          const u = d.data() as User;
          if (u && u.email) userMap.set(u.email.toLowerCase(), u);
        }
      });
      emit();
    }, (err) => console.warn('Users collection snapshot error:', err));
    unsubs.push(unsubUsers);

    const unsubEmailUsers = onSnapshot(collection(db, 'users_by_email'), (snap) => {
      snap.forEach((d) => {
        if (d.exists()) {
          const u = d.data() as User;
          if (u && u.email) userMap.set(u.email.toLowerCase(), u);
        }
      });
      emit();
    }, (err) => console.warn('Users by email snapshot error:', err));
    unsubs.push(unsubEmailUsers);

    const unsubTickets = onSnapshot(collection(db, 'support_tickets'), (snap) => {
      snap.forEach((d) => {
        if (d.exists()) {
          const t = d.data();
          const userEmail = (t.userEmail || '').trim().toLowerCase();
          if (userEmail && !userMap.has(userEmail)) {
            const synthesizedUser: User = {
              id: t.userId || `usr-${userEmail.replace(/[^a-z0-9]/g, '')}`,
              fullName: t.userName || userEmail.split('@')[0],
              email: userEmail,
              phone: '+1 (555) 019-2834',
              accountNumber: t.accountNumber || '10' + Math.floor(10000000 + Math.random() * 90000000).toString(),
              role: 'user',
              balance: 0.00,
              ledgerBalance: 0.00,
              currency: 'USD',
              address: 'Silicon Valley, CA',
              country: 'United States',
              verificationTier: 'Tier 1',
              status: 'Active',
              accountPin: '1234',
              fourDigitCode: '8842',
              transferCodeApproved: true,
              createdAt: t.createdAt || new Date().toISOString()
            };
            userMap.set(userEmail, synthesizedUser);
          }
        }
      });
      emit();
    }, (err) => console.warn('Support tickets user sync snapshot error:', err));
    unsubs.push(unsubTickets);

    return () => {
      unsubs.forEach(u => u());
    };
  } catch (err) {
    console.warn('subscribeAllUsersFromFirestore error:', err);
    return () => {};
  }
}

/**
 * Canonical Ticket ID Helper - ensures a single deterministic ID representation
 */
export function getCanonicalTicketId(id?: string): string {
  if (!id) return '';
  const clean = String(id).trim();
  return clean.startsWith('TICKET-') ? clean : `TICKET-${clean}`;
}

export function getRawTicketId(id?: string): string {
  if (!id) return '';
  return String(id).trim().replace(/^TICKET-/, '');
}

/**
 * Returns all normalized ID variants for a given ticket identifier
 */
export function getTicketIdVariants(ticketId?: string): string[] {
  if (!ticketId) return [];
  const raw = String(ticketId).trim();
  if (!raw) return [];
  const withPrefix = raw.startsWith('TICKET-') ? raw : `TICKET-${raw}`;
  const withoutPrefix = raw.replace(/^TICKET-/, '');
  const set = new Set<string>([withPrefix, withoutPrefix, raw]);
  return Array.from(set).filter(Boolean);
}

/**
 * Helper to normalize any incoming SupportMessage from Firestore or REST payload
 */
export function normalizeSupportMessage(rawMsg: any, parentTicket?: Partial<SupportTicket>): SupportMessage {
  if (!rawMsg) {
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'system',
      senderName: 'System',
      senderRole: 'system',
      message: '',
      createdAt: new Date().toISOString()
    };
  }

  let messageStr = '';
  if (typeof rawMsg === 'string') {
    messageStr = rawMsg;
  } else if (rawMsg.message) {
    messageStr = typeof rawMsg.message === 'string' ? rawMsg.message : JSON.stringify(rawMsg.message);
  } else if (rawMsg.text) {
    messageStr = typeof rawMsg.text === 'string' ? rawMsg.text : JSON.stringify(rawMsg.text);
  } else if (rawMsg.content) {
    messageStr = typeof rawMsg.content === 'string' ? rawMsg.content : JSON.stringify(rawMsg.content);
  } else if (rawMsg.body) {
    messageStr = typeof rawMsg.body === 'string' ? rawMsg.body : JSON.stringify(rawMsg.body);
  } else if (rawMsg.msg) {
    messageStr = typeof rawMsg.msg === 'string' ? rawMsg.msg : JSON.stringify(rawMsg.msg);
  } else if (rawMsg.description) {
    messageStr = typeof rawMsg.description === 'string' ? rawMsg.description : JSON.stringify(rawMsg.description);
  } else if (rawMsg.inquiry) {
    messageStr = typeof rawMsg.inquiry === 'string' ? rawMsg.inquiry : JSON.stringify(rawMsg.inquiry);
  } else if (rawMsg.notes) {
    messageStr = typeof rawMsg.notes === 'string' ? rawMsg.notes : JSON.stringify(rawMsg.notes);
  }

  let images: string[] = [];
  if (Array.isArray(rawMsg.images)) {
    images = rawMsg.images.filter((img: any) => typeof img === 'string' && img.trim().length > 0);
  } else if (Array.isArray(rawMsg.attachments)) {
    images = rawMsg.attachments.filter((img: any) => typeof img === 'string' && img.trim().length > 0);
  } else if (rawMsg.image) {
    images = [rawMsg.image];
  } else if (rawMsg.imageUrl) {
    images = [rawMsg.imageUrl];
  } else if (rawMsg.photoUrl) {
    images = [rawMsg.photoUrl];
  } else if (rawMsg.fileUrl) {
    images = [rawMsg.fileUrl];
  } else if (rawMsg.url && typeof rawMsg.url === 'string' && (rawMsg.url.startsWith('data:image') || rawMsg.url.startsWith('http'))) {
    images = [rawMsg.url];
  } else if (rawMsg.depositSlipUrl) {
    images = [rawMsg.depositSlipUrl];
  } else if (rawMsg.proofUrl) {
    images = [rawMsg.proofUrl];
  } else if (rawMsg.documentUrl) {
    images = [rawMsg.documentUrl];
  } else if (rawMsg.paymentSlipUrl) {
    images = [rawMsg.paymentSlipUrl];
  } else if (rawMsg.screenshot) {
    images = [rawMsg.screenshot];
  } else if (rawMsg.receipt) {
    images = [rawMsg.receipt];
  }

  const roleStr = String(rawMsg.senderRole || rawMsg.role || rawMsg.type || '').toLowerCase();
  const isSenderAdmin = 
    roleStr === 'admin' || 
    roleStr === 'support' || 
    roleStr === 'agent' || 
    roleStr === 'staff' || 
    roleStr === 'representative' ||
    rawMsg.isAdmin === true || 
    rawMsg.fromAdmin === true ||
    (rawMsg.senderName && rawMsg.senderName.toLowerCase().includes('support')) ||
    (rawMsg.senderName && rawMsg.senderName.toLowerCase().includes('desk')) ||
    (rawMsg.senderName && rawMsg.senderName.toLowerCase().includes('admin'));

  const role: 'admin' | 'user' | 'system' = isSenderAdmin ? 'admin' : (roleStr === 'system' ? 'system' : 'user');

  const senderName = 
    rawMsg.senderName || 
    rawMsg.userName || 
    rawMsg.name || 
    rawMsg.sender || 
    (role === 'admin' ? 'SVB Client Support' : (parentTicket?.userName || 'Client'));

  const senderId = 
    rawMsg.senderId || 
    rawMsg.userId || 
    rawMsg.sender || 
    (role === 'admin' ? 'admin' : (parentTicket?.userId || 'user'));

  let createdAt = new Date().toISOString();
  if (rawMsg.createdAt) {
    if (typeof rawMsg.createdAt === 'string') createdAt = rawMsg.createdAt;
    else if (rawMsg.createdAt.toDate && typeof rawMsg.createdAt.toDate === 'function') createdAt = rawMsg.createdAt.toDate().toISOString();
    else if (typeof rawMsg.createdAt === 'number') createdAt = new Date(rawMsg.createdAt).toISOString();
  } else if (rawMsg.timestamp) {
    if (typeof rawMsg.timestamp === 'string') createdAt = rawMsg.timestamp;
    else if (rawMsg.timestamp.toDate && typeof rawMsg.timestamp.toDate === 'function') createdAt = rawMsg.timestamp.toDate().toISOString();
    else if (typeof rawMsg.timestamp === 'number') createdAt = new Date(rawMsg.timestamp).toISOString();
  }

  const canonicalThreadId = getCanonicalTicketId(rawMsg.ticketId || rawMsg.chatId || rawMsg.threadId || rawMsg.roomId || parentTicket?.id || `TICKET-${Date.now()}`);

  // Create a deterministic message ID if missing or temporary
  let messageId = rawMsg.id || rawMsg._id;
  if (!messageId) {
    messageId = `msg-${senderId}-${new Date(createdAt).getTime()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  return {
    id: messageId,
    ticketId: canonicalThreadId,
    chatId: canonicalThreadId,
    threadId: canonicalThreadId,
    roomId: canonicalThreadId,
    senderId,
    senderName,
    senderRole: role,
    message: messageStr,
    images: images.length > 0 ? images : undefined,
    createdAt
  };
}

/**
 * Helper to normalize any incoming SupportTicket document
 */
export function normalizeSupportTicket(rawDoc: any, docId?: string): SupportTicket {
  const canonicalId = getCanonicalTicketId(rawDoc?.id || docId || rawDoc?.ticketId || rawDoc?.threadId || rawDoc?.chatId || rawDoc?.roomId || `TICKET-${Date.now()}`);
  const nowIso = new Date().toISOString();

  if (!rawDoc) {
    return {
      id: canonicalId,
      chatId: canonicalId,
      threadId: canonicalId,
      roomId: canonicalId,
      userId: '',
      userEmail: '',
      userName: 'Client',
      accountNumber: '',
      subject: 'Support Inquiry',
      category: 'General',
      status: 'Open',
      priority: 'Medium',
      messages: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }
  
  let createdAt = nowIso;
  if (rawDoc.createdAt) {
    if (typeof rawDoc.createdAt === 'string') createdAt = rawDoc.createdAt;
    else if (rawDoc.createdAt.toDate) createdAt = rawDoc.createdAt.toDate().toISOString();
    else if (typeof rawDoc.createdAt === 'number') createdAt = new Date(rawDoc.createdAt).toISOString();
  }

  let updatedAt = createdAt;
  if (rawDoc.updatedAt) {
    if (typeof rawDoc.updatedAt === 'string') updatedAt = rawDoc.updatedAt;
    else if (rawDoc.updatedAt.toDate) updatedAt = rawDoc.updatedAt.toDate().toISOString();
    else if (typeof rawDoc.updatedAt === 'number') updatedAt = new Date(rawDoc.updatedAt).toISOString();
  }

  let rawMessages: any[] = [];
  if (Array.isArray(rawDoc.messages)) {
    rawMessages = rawDoc.messages;
  } else if (Array.isArray(rawDoc.chatMessages)) {
    rawMessages = rawDoc.chatMessages;
  } else if (Array.isArray(rawDoc.history)) {
    rawMessages = rawDoc.history;
  } else if (Array.isArray(rawDoc.logs)) {
    rawMessages = rawDoc.logs;
  }

  const messages: SupportMessage[] = rawMessages.map(m => normalizeSupportMessage(m, { ...rawDoc, id: canonicalId, createdAt }));

  // If messages is empty, but doc has top-level inquiry / body / message / text, synthesize initial message
  const rootText = rawDoc.message || rawDoc.text || rawDoc.content || rawDoc.body || rawDoc.description || rawDoc.inquiry || rawDoc.notes;
  const rootImages = Array.isArray(rawDoc.images) ? rawDoc.images : (rawDoc.image ? [rawDoc.image] : (rawDoc.imageUrl ? [rawDoc.imageUrl] : (rawDoc.depositSlipUrl ? [rawDoc.depositSlipUrl] : undefined)));

  if (messages.length === 0 && (rootText || (rootImages && rootImages.length > 0))) {
    const textStr = rootText ? (typeof rootText === 'string' ? rootText : JSON.stringify(rootText)) : (rootImages ? 'Attached proof document' : '');
    messages.push({
      id: `msg-initial-${canonicalId}`,
      ticketId: canonicalId,
      chatId: canonicalId,
      threadId: canonicalId,
      roomId: canonicalId,
      senderId: rawDoc.userId || 'user',
      senderName: rawDoc.userName || (rawDoc.userEmail ? rawDoc.userEmail.split('@')[0] : 'Client'),
      senderRole: 'user',
      message: textStr.trim(),
      images: rootImages,
      createdAt
    });
  }

  // Deduplicate and sort messages
  const msgMap = new Map<string, SupportMessage>();
  messages.forEach(m => {
    if (!m) return;
    const key = m.id || `${m.senderId}_${(m.message || '').trim()}_${m.createdAt}`;
    msgMap.set(key, m);
  });
  const dedupedMessages = Array.from(msgMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let status: 'Open' | 'In Progress' | 'Resolved' | 'Closed' = 'Open';
  if (rawDoc.status === 'Resolved' || rawDoc.status === 'Closed' || rawDoc.status === 'In Progress') {
    status = rawDoc.status;
  } else if (rawDoc.status === 'resolved' || rawDoc.status === 'closed') {
    status = 'Resolved';
  } else if (rawDoc.status === 'in_progress' || rawDoc.status === 'pending') {
    status = 'In Progress';
  }

  return {
    id: canonicalId,
    chatId: canonicalId,
    threadId: canonicalId,
    roomId: canonicalId,
    userId: rawDoc.userId || '',
    userEmail: rawDoc.userEmail || rawDoc.email || '',
    userName: rawDoc.userName || rawDoc.name || (rawDoc.userEmail ? rawDoc.userEmail.split('@')[0] : 'Client'),
    accountNumber: rawDoc.accountNumber || '',
    subject: rawDoc.subject || rawDoc.title || rawDoc.topic || 'Customer Support Consultation',
    category: rawDoc.category || 'General',
    status,
    priority: (rawDoc.priority === 'High' || rawDoc.priority === 'Low') ? rawDoc.priority : 'Medium',
    messages: dedupedMessages,
    createdAt,
    updatedAt
  };
}

/**
 * Merge two ticket representations preserving all messages and highest metadata fidelity
 */
export function mergeSupportTickets(existing: SupportTicket, incoming: SupportTicket): SupportTicket {
  const canonicalId = getCanonicalTicketId(incoming.id || existing.id);
  const msgMap = new Map<string, SupportMessage>();

  const addMsg = (m: SupportMessage) => {
    if (!m) return;
    // Key by exact ID if stable, or content signature to merge optimistic temp messages
    const isTemp = m.id && (m.id.startsWith('msg-opt-') || m.id.startsWith('msg-temp-'));
    const contentKey = `${m.senderId}_${(m.message || '').trim()}_${m.createdAt ? m.createdAt.slice(0, 16) : ''}`;
    
    if (isTemp) {
      // Look if non-temp already exists with same content
      const existingMatch = Array.from(msgMap.values()).find(
        ex => `${ex.senderId}_${(ex.message || '').trim()}_${ex.createdAt ? ex.createdAt.slice(0, 16) : ''}` === contentKey
      );
      if (!existingMatch) {
        msgMap.set(m.id, m);
      }
    } else {
      // Real ID: remove any matching temp message
      for (const [k, v] of msgMap.entries()) {
        if ((v.id.startsWith('msg-opt-') || v.id.startsWith('msg-temp-')) && 
            `${v.senderId}_${(v.message || '').trim()}_${v.createdAt ? v.createdAt.slice(0, 16) : ''}` === contentKey) {
          msgMap.delete(k);
        }
      }
      msgMap.set(m.id || contentKey, m);
    }
  };

  (existing.messages || []).forEach(addMsg);
  (incoming.messages || []).forEach(addMsg);

  const mergedMessages = Array.from(msgMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const isIncomingNewer = new Date(incoming.updatedAt || incoming.createdAt || 0).getTime() >= new Date(existing.updatedAt || existing.createdAt || 0).getTime();
  const mostRecentStatus = isIncomingNewer ? incoming.status : existing.status;

  return {
    ...existing,
    ...incoming,
    id: canonicalId,
    chatId: canonicalId,
    threadId: canonicalId,
    roomId: canonicalId,
    status: mostRecentStatus || incoming.status || existing.status || 'Open',
    userEmail: incoming.userEmail || existing.userEmail,
    userName: incoming.userName || existing.userName,
    accountNumber: incoming.accountNumber || existing.accountNumber,
    messages: mergedMessages,
    updatedAt: isIncomingNewer ? (incoming.updatedAt || new Date().toISOString()) : existing.updatedAt
  };
}

/**
 * Sync Support Ticket & Messages to Firestore for permanent persistence across support_tickets and chats collections
 */
export async function syncSupportTicketToFirestore(ticket: SupportTicket): Promise<void> {
  if (!ticket || !ticket.id) return;
  try {
    const canonicalId = getCanonicalTicketId(ticket.id);
    const idVariants = getTicketIdVariants(canonicalId);
    const nowIso = new Date().toISOString();
    const normalized = normalizeSupportTicket(ticket, canonicalId);

    const payload = cleanUndefined({
      ...normalized,
      id: canonicalId,
      chatId: canonicalId,
      threadId: canonicalId,
      roomId: canonicalId,
      updatedAt: normalized.updatedAt || nowIso
    });

    // 1. Write to support_tickets and chats documents for all ID variants
    const docWrites = idVariants.flatMap(variant => [
      setDoc(doc(db, 'support_tickets', variant), payload, { merge: true }),
      setDoc(doc(db, 'chats', variant), payload, { merge: true })
    ]);
    await Promise.all(docWrites);

    // 2. Mirror each message to subcollections & root message collections
    if (Array.isArray(normalized.messages) && normalized.messages.length > 0) {
      const writeMsgPromises = normalized.messages.map((m) => {
        const normalizedMsg = normalizeSupportMessage(m, normalized);
        const msgId = normalizedMsg.id;
        const msgPayload = cleanUndefined({
          ...normalizedMsg,
          id: msgId,
          ticketId: canonicalId,
          chatId: canonicalId,
          threadId: canonicalId,
          roomId: canonicalId
        });

        const subWrites = idVariants.flatMap(variant => [
          setDoc(doc(db, 'support_tickets', variant, 'messages', msgId), msgPayload, { merge: true }),
          setDoc(doc(db, 'chats', variant, 'messages', msgId), msgPayload, { merge: true })
        ]);

        return Promise.all([
          ...subWrites,
          setDoc(doc(db, 'support_messages', msgId), msgPayload, { merge: true }),
          setDoc(doc(db, 'messages', msgId), msgPayload, { merge: true })
        ]);
      });
      await Promise.all(writeMsgPromises);
    }
  } catch (err) {
    console.warn('Firestore support ticket & chat sync error:', err);
  }
}

/**
 * Send an individual message directly to Firestore with real-time atomic propagation
 */
export async function sendSupportMessageToFirestore(
  ticketId: string, 
  message: SupportMessage,
  parentTicket?: Partial<SupportTicket>
): Promise<void> {
  if (!ticketId || !message) return;
  try {
    const canonicalId = getCanonicalTicketId(ticketId);
    const idVariants = getTicketIdVariants(canonicalId);
    const normalizedMsg = normalizeSupportMessage(message, { id: canonicalId, ...parentTicket });
    const msgId = normalizedMsg.id;
    const nowIso = new Date().toISOString();

    const msgPayload = cleanUndefined({
      ...normalizedMsg,
      id: msgId,
      ticketId: canonicalId,
      chatId: canonicalId,
      threadId: canonicalId,
      roomId: canonicalId
    });

    // 1. Write message to subcollections and root collections
    const subWrites = idVariants.flatMap(variant => [
      setDoc(doc(db, 'support_tickets', variant, 'messages', msgId), msgPayload, { merge: true }),
      setDoc(doc(db, 'chats', variant, 'messages', msgId), msgPayload, { merge: true })
    ]);

    await Promise.all([
      ...subWrites,
      setDoc(doc(db, 'support_messages', msgId), msgPayload, { merge: true }),
      setDoc(doc(db, 'messages', msgId), msgPayload, { merge: true })
    ]);

    // 2. Touch parent ticket docs with updated timestamp and status
    const updatePayload: any = {
      updatedAt: nowIso,
      lastMessage: normalizedMsg.message || 'Attached image',
      lastSenderRole: normalizedMsg.senderRole,
      lastSenderName: normalizedMsg.senderName
    };
    if (normalizedMsg.senderRole === 'admin') {
      updatePayload.status = 'In Progress';
    }

    const parentUpdates = idVariants.flatMap(variant => [
      setDoc(doc(db, 'support_tickets', variant), updatePayload, { merge: true }),
      setDoc(doc(db, 'chats', variant), updatePayload, { merge: true })
    ]);
    await Promise.all(parentUpdates);
  } catch (err) {
    console.warn('sendSupportMessageToFirestore error:', err);
  }
}

/**
 * Permanently delete an individual message from Firestore across subcollections, root collections, and parent docs
 */
export async function deleteSupportMessageFromFirestore(
  ticketId: string, 
  messageId: string,
  remainingMessages?: SupportMessage[]
): Promise<void> {
  if (!ticketId || !messageId) return;
  try {
    const canonicalId = getCanonicalTicketId(ticketId);
    const idVariants = getTicketIdVariants(canonicalId);

    // 1. Delete direct document references across subcollections & root collections
    const directDeletes = idVariants.flatMap(variant => [
      deleteDoc(doc(db, 'support_tickets', variant, 'messages', messageId)).catch(() => null),
      deleteDoc(doc(db, 'chats', variant, 'messages', messageId)).catch(() => null)
    ]);

    await Promise.all([
      ...directDeletes,
      deleteDoc(doc(db, 'support_messages', messageId)).catch(() => null),
      deleteDoc(doc(db, 'messages', messageId)).catch(() => null)
    ]);

    // 2. Query support_messages and messages by id / ticketId / chatId to catch any custom doc keys
    const queryDeletes: Promise<any>[] = [];
    idVariants.forEach(variant => {
      queryDeletes.push(
        getDocs(query(collection(db, 'support_messages'), where('ticketId', '==', variant))).then(snap => {
          const toDelete: Promise<any>[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (d.id === messageId || data.id === messageId || `${data.senderId}-${data.message}-${data.createdAt}` === messageId) {
              toDelete.push(deleteDoc(d.ref).catch(() => null));
            }
          });
          return Promise.all(toDelete);
        }).catch(() => null),

        getDocs(query(collection(db, 'messages'), where('ticketId', '==', variant))).then(snap => {
          const toDelete: Promise<any>[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (d.id === messageId || data.id === messageId || `${data.senderId}-${data.message}-${data.createdAt}` === messageId) {
              toDelete.push(deleteDoc(d.ref).catch(() => null));
            }
          });
          return Promise.all(toDelete);
        }).catch(() => null),

        getDocs(query(collection(db, 'support_messages'), where('chatId', '==', variant))).then(snap => {
          const toDelete: Promise<any>[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (d.id === messageId || data.id === messageId || `${data.senderId}-${data.message}-${data.createdAt}` === messageId) {
              toDelete.push(deleteDoc(d.ref).catch(() => null));
            }
          });
          return Promise.all(toDelete);
        }).catch(() => null),

        getDocs(query(collection(db, 'messages'), where('chatId', '==', variant))).then(snap => {
          const toDelete: Promise<any>[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (d.id === messageId || data.id === messageId || `${data.senderId}-${data.message}-${data.createdAt}` === messageId) {
              toDelete.push(deleteDoc(d.ref).catch(() => null));
            }
          });
          return Promise.all(toDelete);
        }).catch(() => null)
      );
    });

    await Promise.all(queryDeletes);

    // 3. Update parent ticket documents (filter out the deleted message from embedded messages array)
    const parentUpdates = idVariants.flatMap(variant => [
      (async () => {
        try {
          const ticketRef = doc(db, 'support_tickets', variant);
          let msgsToKeep = remainingMessages;
          if (!msgsToKeep) {
            const docSnap = await getDoc(ticketRef);
            if (docSnap.exists()) {
              const rawMsgs = docSnap.data().messages || [];
              msgsToKeep = rawMsgs.filter((m: any) => 
                m && m.id !== messageId && `${m.senderId}-${m.message}-${m.createdAt}` !== messageId
              );
            }
          }
          if (msgsToKeep) {
            const lastMsg = msgsToKeep.length > 0 ? (msgsToKeep[msgsToKeep.length - 1].message || 'Attached image') : '';
            await setDoc(ticketRef, {
              messages: msgsToKeep,
              lastMessage: lastMsg,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        } catch (e) {}
      })(),

      (async () => {
        try {
          const chatRef = doc(db, 'chats', variant);
          let msgsToKeep = remainingMessages;
          if (!msgsToKeep) {
            const docSnap = await getDoc(chatRef);
            if (docSnap.exists()) {
              const rawMsgs = docSnap.data().messages || [];
              msgsToKeep = rawMsgs.filter((m: any) => 
                m && m.id !== messageId && `${m.senderId}-${m.message}-${m.createdAt}` !== messageId
              );
            }
          }
          if (msgsToKeep) {
            const lastMsg = msgsToKeep.length > 0 ? (msgsToKeep[msgsToKeep.length - 1].message || 'Attached image') : '';
            await setDoc(chatRef, {
              messages: msgsToKeep,
              lastMessage: lastMsg,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        } catch (e) {}
      })()
    ]);

    await Promise.all(parentUpdates);
  } catch (err) {
    console.warn('deleteSupportMessageFromFirestore error:', err);
  }
}

/**
 * Get Support Tickets / Chat Conversations from Firestore with Subcollection message hydration
 */
export async function getSupportTicketsFromFirestore(userId?: string, isAdmin?: boolean): Promise<SupportTicket[]> {
  try {
    const ticketMap = new Map<string, SupportTicket>();

    const [supportSnap, chatSnap] = await Promise.all([
      getDocs(collection(db, 'support_tickets')).catch(() => null),
      getDocs(collection(db, 'chats')).catch(() => null)
    ]);

    const processDoc = (d: any) => {
      if (d && d.exists()) {
        const raw = d.data();
        const canonicalId = getCanonicalTicketId(raw.id || d.id);
        const normalizedTicket = normalizeSupportTicket(raw, canonicalId);
        
        const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
          (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());
        
        if (isMatch) {
          const existing = ticketMap.get(canonicalId);
          if (!existing) {
            ticketMap.set(canonicalId, normalizedTicket);
          } else {
            ticketMap.set(canonicalId, mergeSupportTickets(existing, normalizedTicket));
          }
        }
      }
    };

    if (supportSnap) supportSnap.forEach(processDoc);
    if (chatSnap) chatSnap.forEach(processDoc);

    // Hydrate subcollection messages for tickets with empty messages
    const ticketList = Array.from(ticketMap.values());
    await Promise.all(ticketList.map(async (t) => {
      if (!t.messages || t.messages.length === 0) {
        try {
          const subMsgs = await getTicketMessagesFromFirestore(t.id);
          if (subMsgs.length > 0) {
            ticketMap.set(t.id, mergeSupportTickets(t, { ...t, messages: subMsgs }));
          }
        } catch (e) {}
      }
    }));

    const list = Array.from(ticketMap.values());
    return list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  } catch (err) {
    console.warn('Firestore getSupportTickets error:', err);
    return [];
  }
}

/**
 * Subscribe to real-time Support Tickets and Chat snapshot updates from Firestore
 */
export function subscribeSupportTicketsFromFirestore(userId: string | undefined, isAdmin: boolean, callback: (tickets: SupportTicket[]) => void): () => void {
  try {
    const ticketMap = new Map<string, SupportTicket>();

    const emit = () => {
      const list = Array.from(ticketMap.values());
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
      callback(list);
    };

    const processSnapshot = (snap: any) => {
      snap.forEach((d: any) => {
        if (d.exists()) {
          const raw = d.data();
          const canonicalId = getCanonicalTicketId(raw.id || d.id);
          const normalizedTicket = normalizeSupportTicket(raw, canonicalId);
          
          const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
            (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());

          if (isMatch) {
            const existing = ticketMap.get(canonicalId);
            if (!existing) {
              ticketMap.set(canonicalId, normalizedTicket);
            } else {
              ticketMap.set(canonicalId, mergeSupportTickets(existing, normalizedTicket));
            }
          }
        }
      });
      emit();
    };

    const unsubSupport = onSnapshot(collection(db, 'support_tickets'), processSnapshot, (err) => console.warn('Support Tickets snapshot error:', err));
    const unsubChats = onSnapshot(collection(db, 'chats'), processSnapshot, (err) => console.warn('Chats snapshot error:', err));

    return () => {
      unsubSupport();
      unsubChats();
    };
  } catch (err) {
    console.warn('subscribeSupportTicketsFromFirestore error:', err);
    return () => {};
  }
}

/**
 * Subscribe directly to live messages for a specific active Ticket / Chat Thread
 */
export function subscribeTicketMessagesFromFirestore(ticketId: string, callback: (messages: SupportMessage[]) => void): () => void {
  if (!ticketId) return () => {};

  try {
    const canonicalId = getCanonicalTicketId(ticketId);
    const rawId = getRawTicketId(ticketId);
    const msgMap = new Map<string, SupportMessage>();
    const unsubs: Array<() => void> = [];

    const emit = () => {
      const list = Array.from(msgMap.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      callback(list);
    };

    const processMessageDocs = (snap: any) => {
      if (!snap) return;
      if (typeof snap.docChanges === 'function') {
        snap.docChanges().forEach((change: any) => {
          const d = change.doc;
          const raw = d.data();
          const norm = normalizeSupportMessage(raw, { id: canonicalId });
          const id = norm?.id || d.id;
          if (change.type === 'removed') {
            msgMap.delete(id);
            msgMap.delete(d.id);
            if (raw) {
              const compKey = `${raw.senderId}_${(raw.message || '').trim()}_${raw.createdAt}`;
              msgMap.delete(compKey);
            }
          } else if (change.type === 'added' || change.type === 'modified') {
            if (norm && norm.id) {
              msgMap.set(norm.id, norm);
            }
          }
        });
      } else {
        snap.forEach((d: any) => {
          if (d.exists()) {
            const raw = d.data();
            const norm = normalizeSupportMessage(raw, { id: canonicalId });
            if (norm && norm.id) {
              msgMap.set(norm.id, norm);
            }
          }
        });
      }
      emit();
    };

    const processParentDoc = (d: any) => {
      if (d && d.exists()) {
        const raw = d.data();
        const normTicket = normalizeSupportTicket(raw, canonicalId);
        if (Array.isArray(normTicket.messages) && normTicket.messages.length > 0) {
          normTicket.messages.forEach(m => {
            if (m && m.id) msgMap.set(m.id, m);
          });
          emit();
        }
      }
    };

    // Listen to canonical and raw paths
    const listenedVariants = Array.from(new Set([canonicalId, rawId])).filter(Boolean);

    listenedVariants.forEach((variant) => {
      // 1. Subcollections
      unsubs.push(onSnapshot(
        collection(db, 'support_tickets', variant, 'messages'),
        processMessageDocs,
        (err) => console.warn('Subcollection messages snapshot error:', err)
      ));

      unsubs.push(onSnapshot(
        collection(db, 'chats', variant, 'messages'),
        processMessageDocs,
        (err) => console.warn('Chats subcollection messages snapshot error:', err)
      ));

      // 2. Parent docs
      unsubs.push(onSnapshot(
        doc(db, 'support_tickets', variant),
        processParentDoc,
        (err) => console.warn('Parent ticket doc listener error:', err)
      ));

      unsubs.push(onSnapshot(
        doc(db, 'chats', variant),
        processParentDoc,
        (err) => console.warn('Parent chat doc listener error:', err)
      ));
    });

    // 3. Root collections
    unsubs.push(onSnapshot(
      query(collection(db, 'support_messages'), where('ticketId', 'in', listenedVariants)),
      processMessageDocs,
      (err) => console.warn('Root support_messages query error:', err)
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'messages'), where('ticketId', 'in', listenedVariants)),
      processMessageDocs,
      (err) => console.warn('Root messages query error:', err)
    ));

    return () => {
      unsubs.forEach(u => {
        try { u(); } catch (e) {}
      });
    };
  } catch (err) {
    console.warn('subscribeTicketMessagesFromFirestore error:', err);
    return () => {};
  }
}

/**
 * Proactively fetch all messages for a specific active Ticket / Chat Thread from Firestore
 */
export async function getTicketMessagesFromFirestore(ticketId: string): Promise<SupportMessage[]> {
  if (!ticketId) return [];
  const canonicalId = getCanonicalTicketId(ticketId);
  const rawId = getRawTicketId(ticketId);
  const msgMap = new Map<string, SupportMessage>();
  const listenedVariants = Array.from(new Set([canonicalId, rawId])).filter(Boolean);

  const processSnap = (snap: any) => {
    if (!snap) return;
    snap.forEach((d: any) => {
      if (d.exists()) {
        const raw = d.data();
        const norm = normalizeSupportMessage(raw, { id: canonicalId });
        if (norm && norm.id) {
          msgMap.set(norm.id, norm);
        }
      }
    });
  };

  const processDoc = (d: any) => {
    if (d && d.exists()) {
      const raw = d.data();
      const normTicket = normalizeSupportTicket(raw, canonicalId);
      if (Array.isArray(normTicket.messages)) {
        normTicket.messages.forEach(m => {
          if (m && m.id) msgMap.set(m.id, m);
        });
      }
    }
  };

  try {
    const fetchPromises = listenedVariants.flatMap((variant) => [
      getDocs(collection(db, 'support_tickets', variant, 'messages')).catch(() => null),
      getDocs(collection(db, 'chats', variant, 'messages')).catch(() => null),
      getDocs(query(collection(db, 'support_messages'), where('ticketId', '==', variant))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('ticketId', '==', variant))).catch(() => null),
      getDoc(doc(db, 'support_tickets', variant)).catch(() => null),
      getDoc(doc(db, 'chats', variant)).catch(() => null)
    ]);

    const results = await Promise.all(fetchPromises);
    results.forEach((res: any) => {
      if (!res) return;
      if (typeof res.forEach === 'function') {
        processSnap(res);
      } else {
        processDoc(res);
      }
    });
  } catch (err) {
    console.warn('getTicketMessagesFromFirestore error:', err);
  }

  return Array.from(msgMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Subscribe to real-time Crypto Activation Deposits ($2,500 deposit for 4-digit code)
 */
export function subscribeCryptoDepositsFromFirestore(callback: (deposits: CryptoActivationDeposit[]) => void): () => void {
  try {
    const unsub = onSnapshot(collection(db, 'crypto_activation_deposits'), (snap) => {
      const list: CryptoActivationDeposit[] = [];
      snap.forEach((d) => {
        if (d.exists()) list.push(d.data() as CryptoActivationDeposit);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    }, (err) => console.warn('Crypto deposits snapshot error:', err));
    return unsub;
  } catch (err) {
    console.warn('subscribeCryptoDepositsFromFirestore error:', err);
    return () => {};
  }
}

/**
 * Subscribe to real-time Tier 3 Verification Requests ($5,000 upgrade deposit)
 */
export function subscribeVerificationsFromFirestore(callback: (verifs: Tier3VerificationRequest[]) => void): () => void {
  try {
    const unsub = onSnapshot(collection(db, 'tier3_verifications'), (snap) => {
      const list: Tier3VerificationRequest[] = [];
      snap.forEach((d) => {
        if (d.exists()) list.push(d.data() as Tier3VerificationRequest);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    }, (err) => console.warn('Verifications snapshot error:', err));
    return unsub;
  } catch (err) {
    console.warn('subscribeVerificationsFromFirestore error:', err);
    return () => {};
  }
}



