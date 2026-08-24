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
import { User, VirtualCard, CryptoActivationDeposit, Tier3VerificationRequest, Transaction, SupportTicket, SupportMessage } from '../types.js';
import { deduplicateTransactions, saveFinalizedStatus } from '../utils/transactions.js';

// Default project configuration fallback
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0276814234",
  appId: "1:89916653740:web:5ba9a9cdc7a295dbcb5f09",
  apiKey: "AIzaSyDD3L1PRMjFp4YbVVrMjydD9M-HZ7Pik_M",
  authDomain: "gen-lang-client-0276814234.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-useraccountadmin-04fdbca0-f4d3-4cb2-b47d-ede50540d064",
  storageBucket: "gen-lang-client-0276814234.firebasestorage.app",
  messagingSenderId: "89916653740"
};

// Helper to safely get config values across Vite client and Node server
const getEnvVal = (key: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch {}
  return '';
};

// Firebase Config using environment variables or embedded project defaults
const firebaseConfig = {
  apiKey: getEnvVal('VITE_FIREBASE_API_KEY') || getEnvVal('FIREBASE_API_KEY') || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: getEnvVal('VITE_FIREBASE_AUTH_DOMAIN') || getEnvVal('FIREBASE_AUTH_DOMAIN') || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: getEnvVal('VITE_FIREBASE_PROJECT_ID') || getEnvVal('FIREBASE_PROJECT_ID') || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: getEnvVal('VITE_FIREBASE_STORAGE_BUCKET') || getEnvVal('FIREBASE_STORAGE_BUCKET') || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: getEnvVal('VITE_FIREBASE_MESSAGING_SENDER_ID') || getEnvVal('FIREBASE_MESSAGING_SENDER_ID') || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: getEnvVal('VITE_FIREBASE_APP_ID') || getEnvVal('FIREBASE_APP_ID') || DEFAULT_FIREBASE_CONFIG.appId,
  databaseId: getEnvVal('VITE_FIREBASE_DATABASE_ID') || getEnvVal('FIREBASE_DATABASE_ID') || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId
};

// Initialize Firebase App & Firestore
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.databaseId);
