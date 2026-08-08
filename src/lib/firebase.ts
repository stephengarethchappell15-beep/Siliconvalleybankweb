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
  deleteDoc
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';
import { User } from '../types';

// Firebase Config using imported config or environment fallbacks
const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || config.apiKey,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || config.projectId,
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || config.appId,
  databaseId: import.meta.env?.VITE_FIREBASE_DATABASE_ID || config.firestoreDatabaseId
};

// Initialize Firebase App & Firestore
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.databaseId);

/**
 * Save or update user persistently in Firestore
 */
export async function syncUserToFirestore(user: User, password?: string): Promise<void> {
  if (!user || !user.email) return;
  try {
    const cleanEmail = user.email.trim().toLowerCase();
    const payload = {
      ...user,
      email: cleanEmail,
      updatedAt: new Date().toISOString(),
      ...(password ? { password } : {})
    };

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

  } catch (err) {
    console.warn('Firestore user fetch error:', err);
  }

  return null;
}

/**
 * Get all users from Firestore
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

  return Array.from(userMap.values());
}
