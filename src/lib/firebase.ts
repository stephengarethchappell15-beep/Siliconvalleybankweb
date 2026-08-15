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
 * Helper to normalize any incoming SupportMessage from Firestore docs, subcollections, or root payloads
 */
export function normalizeSupportMessage(rawMsg: any, parentTicket?: any): SupportMessage {
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

  if (typeof rawMsg === 'string') {
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: parentTicket?.userId || 'user',
      senderName: parentTicket?.userName || 'Client',
      senderRole: 'user',
      message: rawMsg,
      createdAt: parentTicket?.createdAt || new Date().toISOString()
    };
  }

  const rawText = 
    rawMsg.message !== undefined && rawMsg.message !== null ? rawMsg.message :
    rawMsg.text !== undefined && rawMsg.text !== null ? rawMsg.text :
    rawMsg.content !== undefined && rawMsg.content !== null ? rawMsg.content :
    rawMsg.body !== undefined && rawMsg.body !== null ? rawMsg.body :
    rawMsg.msg !== undefined && rawMsg.msg !== null ? rawMsg.msg :
    rawMsg.messageText !== undefined && rawMsg.messageText !== null ? rawMsg.messageText :
    rawMsg.description !== undefined && rawMsg.description !== null ? rawMsg.description :
    rawMsg.details !== undefined && rawMsg.details !== null ? rawMsg.details :
    rawMsg.inquiry !== undefined && rawMsg.inquiry !== null ? rawMsg.inquiry :
    rawMsg.notes !== undefined && rawMsg.notes !== null ? rawMsg.notes :
    '';

  const messageStr = typeof rawText === 'string' ? rawText : (typeof rawText === 'object' ? JSON.stringify(rawText) : String(rawText));

  let images: string[] = [];
  if (Array.isArray(rawMsg.images)) {
    images = rawMsg.images.filter(Boolean);
  } else if (rawMsg.image) {
    images = [rawMsg.image];
  } else if (rawMsg.imageUrl) {
    images = [rawMsg.imageUrl];
  } else if (rawMsg.attachment) {
    images = [rawMsg.attachment];
  } else if (rawMsg.attachmentUrl) {
    images = [rawMsg.attachmentUrl];
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

  const threadId = rawMsg.ticketId || rawMsg.chatId || rawMsg.threadId || rawMsg.roomId || parentTicket?.id || `TICKET-${Date.now()}`;

  return {
    id: rawMsg.id || rawMsg._id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ticketId: threadId,
    chatId: threadId,
    threadId: threadId,
    roomId: threadId,
    senderId,
    senderName,
    senderRole: role,
    message: messageStr,
    images: images.length > 0 ? images : undefined,
    createdAt
  };
}

/**
 * Returns all normalized ID variants for a given ticket identifier
 */
export function getTicketIdVariants(ticketId: string): string[] {
  if (!ticketId) return [];
  const set = new Set<string>();
  const raw = ticketId.trim();
  set.add(raw);
  if (raw.startsWith('TICKET-')) {
    set.add(raw.replace(/^TICKET-/, ''));
  } else {
    set.add(`TICKET-${raw}`);
  }
  return Array.from(set).filter(Boolean);
}

/**
 * Helper to normalize any incoming SupportTicket document
 */
export function normalizeSupportTicket(rawDoc: any, docId?: string): SupportTicket {
  if (!rawDoc) {
    const id = docId || `TICKET-${Date.now()}`;
    return {
      id,
      chatId: id,
      threadId: id,
      roomId: id,
      userId: '',
      userEmail: '',
      userName: 'Client',
      accountNumber: '',
      subject: 'Support Inquiry',
      category: 'General',
      status: 'Open',
      priority: 'Medium',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const id = rawDoc.id || docId || rawDoc.ticketId || rawDoc.threadId || rawDoc.chatId || rawDoc.roomId || `TICKET-${Date.now()}`;
  const nowIso = new Date().toISOString();
  
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

  const messages: SupportMessage[] = rawMessages.map(m => normalizeSupportMessage(m, { ...rawDoc, id, createdAt }));

  // If messages is empty, but doc has top-level inquiry / body / message / text, synthesize initial message
  const rootText = rawDoc.message || rawDoc.text || rawDoc.content || rawDoc.body || rawDoc.description || rawDoc.inquiry || rawDoc.notes;
  const rootImages = Array.isArray(rawDoc.images) ? rawDoc.images : (rawDoc.image ? [rawDoc.image] : (rawDoc.imageUrl ? [rawDoc.imageUrl] : (rawDoc.depositSlipUrl ? [rawDoc.depositSlipUrl] : undefined)));

  if (messages.length === 0 && (rootText || (rootImages && rootImages.length > 0))) {
    const textStr = rootText ? (typeof rootText === 'string' ? rootText : JSON.stringify(rootText)) : (rootImages ? 'Attached proof document' : '');
    messages.push({
      id: `msg-initial-${id}`,
      ticketId: id,
      chatId: id,
      threadId: id,
      roomId: id,
      senderId: rawDoc.userId || 'user',
      senderName: rawDoc.userName || (rawDoc.userEmail ? rawDoc.userEmail.split('@')[0] : 'Client'),
      senderRole: 'user',
      message: textStr.trim(),
      images: rootImages,
      createdAt
    });
  }

  return {
    id,
    chatId: id,
    threadId: id,
    roomId: id,
    userId: rawDoc.userId || '',
    userEmail: rawDoc.userEmail || rawDoc.email || '',
    userName: rawDoc.userName || rawDoc.name || (rawDoc.userEmail ? rawDoc.userEmail.split('@')[0] : 'Client'),
    accountNumber: rawDoc.accountNumber || '',
    subject: rawDoc.subject || rawDoc.title || rawDoc.topic || 'Customer Support Consultation',
    category: rawDoc.category || 'General',
    status: (rawDoc.status === 'Resolved' || rawDoc.status === 'Closed' || rawDoc.status === 'In Progress') ? rawDoc.status : 'Open',
    priority: (rawDoc.priority === 'High' || rawDoc.priority === 'Low') ? rawDoc.priority : 'Medium',
    messages,
    createdAt,
    updatedAt
  };
}

/**
 * Merge two ticket representations preserving all messages and highest metadata fidelity
 */
export function mergeSupportTickets(existing: SupportTicket, incoming: SupportTicket): SupportTicket {
  const msgMap = new Map<string, SupportMessage>();

  (existing.messages || []).forEach(m => {
    if (!m) return;
    const key = m.id || `${m.senderId}-${m.message}-${m.createdAt}`;
    msgMap.set(key, m);
  });

  (incoming.messages || []).forEach(m => {
    if (!m) return;
    const key = m.id || `${m.senderId}-${m.message}-${m.createdAt}`;
    msgMap.set(key, m);
  });

  const mergedMessages = Array.from(msgMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    ...existing,
    ...incoming,
    userEmail: incoming.userEmail || existing.userEmail,
    userName: incoming.userName || existing.userName,
    accountNumber: incoming.accountNumber || existing.accountNumber,
    messages: mergedMessages,
    updatedAt: new Date(incoming.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime() 
      ? (incoming.updatedAt || existing.updatedAt) 
      : existing.updatedAt
  };
}

/**
 * Sync Support Ticket & Messages to Firestore for permanent persistence across support_tickets and chats collections
 */
export async function syncSupportTicketToFirestore(ticket: SupportTicket): Promise<void> {
  if (!ticket || !ticket.id) return;
  try {
    const threadId = ticket.id;
    const idVariants = getTicketIdVariants(threadId);
    const nowIso = new Date().toISOString();
    const normalized = normalizeSupportTicket(ticket, threadId);

    const payload = cleanUndefined({
      ...normalized,
      chatId: threadId,
      threadId: threadId,
      roomId: threadId,
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
          ticketId: threadId,
          chatId: threadId,
          threadId: threadId,
          roomId: threadId
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
    const idVariants = getTicketIdVariants(ticketId);
    const normalizedMsg = normalizeSupportMessage(message, { id: ticketId, ...parentTicket });
    const msgId = normalizedMsg.id;
    const nowIso = new Date().toISOString();

    const msgPayload = cleanUndefined({
      ...normalizedMsg,
      id: msgId,
      ticketId: ticketId,
      chatId: ticketId,
      threadId: ticketId,
      roomId: ticketId
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
        const threadId = raw.id || d.id;
        const normalizedTicket = normalizeSupportTicket(raw, threadId);
        
        const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
          (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());
        
        if (isMatch) {
          const existing = ticketMap.get(threadId);
          if (!existing) {
            ticketMap.set(threadId, normalizedTicket);
          } else {
            ticketMap.set(threadId, mergeSupportTickets(existing, normalizedTicket));
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
          const threadId = raw.id || d.id;
          const normalizedTicket = normalizeSupportTicket(raw, threadId);
          
          const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
            (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());

          if (isMatch) {
            const existing = ticketMap.get(threadId);
            if (!existing) {
              ticketMap.set(threadId, normalizedTicket);
            } else {
              ticketMap.set(threadId, mergeSupportTickets(existing, normalizedTicket));
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
    const msgMap = new Map<string, SupportMessage>();
    const unsubs: Array<() => void> = [];
    const idVariants = getTicketIdVariants(ticketId);

    const emit = () => {
      const list = Array.from(msgMap.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      callback(list);
    };

    const processMessageDocs = (snap: any) => {
      if (!snap) return;
      snap.forEach((d: any) => {
        if (d.exists()) {
          const raw = d.data();
          const norm = normalizeSupportMessage(raw, { id: ticketId });
          if (norm && norm.id) {
            msgMap.set(norm.id, norm);
          }
        }
      });
      emit();
    };

    const processParentDoc = (d: any) => {
      if (d && d.exists()) {
        const raw = d.data();
        const normTicket = normalizeSupportTicket(raw, ticketId);
        if (Array.isArray(normTicket.messages) && normTicket.messages.length > 0) {
          normTicket.messages.forEach(m => {
            if (m && m.id) msgMap.set(m.id, m);
          });
          emit();
        }
      }
    };

    idVariants.forEach((variant) => {
      // 1. Subcollection support_tickets/{variant}/messages
      const u1 = onSnapshot(
        collection(db, 'support_tickets', variant, 'messages'),
        processMessageDocs,
        (err) => console.warn('Subcollection messages snapshot error:', err)
      );
      unsubs.push(u1);

      // 2. Subcollection chats/{variant}/messages
      const u2 = onSnapshot(
        collection(db, 'chats', variant, 'messages'),
        processMessageDocs,
        (err) => console.warn('Chats subcollection messages snapshot error:', err)
      );
      unsubs.push(u2);

      // 3. Root collection support_messages queries
      const u3 = onSnapshot(
        query(collection(db, 'support_messages'), where('ticketId', '==', variant)),
        processMessageDocs,
        (err) => console.warn('Root support_messages query error:', err)
      );
      unsubs.push(u3);

      const u4 = onSnapshot(
        query(collection(db, 'support_messages'), where('chatId', '==', variant)),
        processMessageDocs,
        (err) => console.warn('Root support_messages chatId error:', err)
      );
      unsubs.push(u4);

      // 4. Root collection messages queries
      const u5 = onSnapshot(
        query(collection(db, 'messages'), where('ticketId', '==', variant)),
        processMessageDocs,
        (err) => console.warn('Root messages query error:', err)
      );
      unsubs.push(u5);

      const u6 = onSnapshot(
        query(collection(db, 'messages'), where('chatId', '==', variant)),
        processMessageDocs,
        (err) => console.warn('Root messages chatId error:', err)
      );
      unsubs.push(u6);

      // 5. Parent docs listener for embedded messages array
      const u7 = onSnapshot(
        doc(db, 'support_tickets', variant),
        processParentDoc,
        (err) => console.warn('Parent ticket doc listener error:', err)
      );
      unsubs.push(u7);

      const u8 = onSnapshot(
        doc(db, 'chats', variant),
        processParentDoc,
        (err) => console.warn('Parent chat doc listener error:', err)
      );
      unsubs.push(u8);
    });

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
  const msgMap = new Map<string, SupportMessage>();
  const idVariants = getTicketIdVariants(ticketId);

  const processSnap = (snap: any) => {
    if (!snap) return;
    snap.forEach((d: any) => {
      if (d.exists()) {
        const raw = d.data();
        const norm = normalizeSupportMessage(raw, { id: ticketId });
        if (norm && norm.id) {
          msgMap.set(norm.id, norm);
        }
      }
    });
  };

  const processDoc = (d: any) => {
    if (d && d.exists()) {
      const raw = d.data();
      const normTicket = normalizeSupportTicket(raw, ticketId);
      if (Array.isArray(normTicket.messages)) {
        normTicket.messages.forEach(m => {
          if (m && m.id) msgMap.set(m.id, m);
        });
      }
    }
  };

  try {
    const fetchPromises = idVariants.flatMap((variant) => [
      getDocs(collection(db, 'support_tickets', variant, 'messages')).catch(() => null),
      getDocs(collection(db, 'chats', variant, 'messages')).catch(() => null),
      getDocs(query(collection(db, 'support_messages'), where('ticketId', '==', variant))).catch(() => null),
      getDocs(query(collection(db, 'support_messages'), where('chatId', '==', variant))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('ticketId', '==', variant))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('chatId', '==', variant))).catch(() => null),
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



