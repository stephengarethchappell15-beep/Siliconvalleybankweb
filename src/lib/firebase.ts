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
import { User, VirtualCard, CryptoActivationDeposit, Tier3VerificationRequest, Transaction, SupportTicket } from '../types';

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
 * Sync Support Ticket & Messages to Firestore for permanent persistence across support_tickets and chats collections
 */
export async function syncSupportTicketToFirestore(ticket: SupportTicket): Promise<void> {
  if (!ticket || !ticket.id) return;
  try {
    const threadId = ticket.id;
    const nowIso = new Date().toISOString();
    const payload = cleanUndefined({
      ...ticket,
      chatId: threadId,
      threadId: threadId,
      roomId: threadId,
      updatedAt: ticket.updatedAt || nowIso
    });

    // 1. Write to support_tickets and chats documents with matching Room ID
    await Promise.all([
      setDoc(doc(db, 'support_tickets', threadId), payload, { merge: true }),
      setDoc(doc(db, 'chats', threadId), payload, { merge: true })
    ]);

    // 2. Also mirror messages to messages & support_messages collections if present
    if (Array.isArray(ticket.messages) && ticket.messages.length > 0) {
      const writeMsgPromises = ticket.messages.map((m) => {
        const msgId = m.id || `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const msgPayload = cleanUndefined({
          ...m,
          id: msgId,
          ticketId: threadId,
          chatId: threadId,
          threadId: threadId,
          roomId: threadId
        });
        return Promise.all([
          setDoc(doc(db, 'support_tickets', threadId, 'messages', msgId), msgPayload, { merge: true }),
          setDoc(doc(db, 'chats', threadId, 'messages', msgId), msgPayload, { merge: true }),
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
 * Get Support Tickets / Chat Conversations from Firestore
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
        const t = d.data() as SupportTicket;
        const threadId = t.id || d.id;
        const normalizedTicket: SupportTicket = {
          ...t,
          id: threadId,
          chatId: threadId,
          threadId: threadId,
          roomId: threadId
        };
        const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
          (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());
        
        if (isMatch) {
          const existing = ticketMap.get(threadId);
          if (!existing || new Date(normalizedTicket.updatedAt || normalizedTicket.createdAt).getTime() >= new Date(existing.updatedAt || existing.createdAt).getTime()) {
            ticketMap.set(threadId, normalizedTicket);
          }
        }
      }
    };

    if (supportSnap) supportSnap.forEach(processDoc);
    if (chatSnap) chatSnap.forEach(processDoc);

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
          const t = d.data() as SupportTicket;
          const threadId = t.id || d.id;
          const normalizedTicket: SupportTicket = {
            ...t,
            id: threadId,
            chatId: threadId,
            threadId: threadId,
            roomId: threadId
          };
          const isMatch = isAdmin || !userId || normalizedTicket.userId === userId || 
            (normalizedTicket.userEmail && userId.includes('@') && normalizedTicket.userEmail.toLowerCase() === userId.toLowerCase());

          if (isMatch) {
            ticketMap.set(threadId, normalizedTicket);
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



