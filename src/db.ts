import fs from 'fs';
import path from 'path';
import { User, BankAccount, VirtualCard, BillPayment, Transaction, AuditLog, UserNotification, DepositPayload, TransferPayload, WithdrawPayload, SupportTicket, SupportMessage, CryptoActivationDeposit, EmailConfig, EmailDeliveryLog } from '../types.js';
import { syncUserToFirestore, getUserFromFirestore, getAllUsersFromFirestore, syncTransactionToFirestore, syncCryptoDepositToFirestore, syncEmailConfigToFirestore, getEmailConfigFromFirestore, getEmailLogsFromFirestore } from '../lib/firebase.js';
import { emailService } from './emailService.js';
