import fs from 'fs';
import path from 'path';
import { User, BankAccount, VirtualCard, CryptoActivationDeposit, BillPayment, SupportTicket, AuditLog, UserNotification, SupportMessage } from '../types.js';
import { syncToFirestore, getUserFromFirestore, saveUserToFirestore, getCollectionFromFirestore, saveCollectionToFirestore } from './firebaseDb.js';
import { emailService } from './emailService.js';

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
}

interface EmailDeliveryLog {
  id?: string;
  timestamp: string;
  to: string;
  subject: string;
  status: 'success' | 'failed';
  error?: string;
}

interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>;
  virtualCards: VirtualCard[];
  billPayments: BillPayment[];
  resetTokens: Record<string, { code: string; expires: number }>;
  transactions: any[];
  auditLogs: AuditLog[];
  notifications: UserNotification[];
  supportTickets: SupportTicket[];
  cryptoActivationDeposits: CryptoActivationDeposit[];
  emailConfig: EmailConfig;
  emailDeliveryLogs: EmailDeliveryLog[];
}

const DB_PATH = path.join(process.cwd(), '.data', 'db.json');

function readDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading database:', err);
  }
  return {
    users: [],
    passwords: {},
    virtualCards: [],
    billPayments: [],
    resetTokens: {},
    transactions: [],
    auditLogs: [],
    notifications: [],
    supportTickets: [],
    cryptoActivationDeposits: [],
    emailConfig: { host: '', port: 587, user: '', pass: '', fromEmail: '', fromName: 'SVB Support', secure: false },
    emailDeliveryLogs: []
  };
}

function writeDb(data: DatabaseSchema) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

export async function dbGetUserByEmail(email: string): Promise<User | null> {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  
  const firestoreUser = await getUserFromFirestore(cleanEmail);
  if (firestoreUser) return firestoreUser;

  const db = readDb();
  return db.users.find(u => u.email.trim().toLowerCase() === cleanEmail) || null;
}

export async function dbSaveUser(user: User): Promise<void> {
  if (!user || !user.email) return;
  const cleanEmail = user.email.trim().toLowerCase();

  await saveUserToFirestore(user);

  const db = readDb();
  const index = db.users.findIndex(u => u.id === user.id || u.email.trim().toLowerCase() === cleanEmail);
  if (index >= 0) {
    db.users[index] = user;
  } else {
    db.users.push(user);
  }
  writeDb(db);
}
