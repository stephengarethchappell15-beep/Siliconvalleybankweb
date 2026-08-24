export const dbManager = new DatabaseManager();

// ==========================================
// Firestore Helpers & Compatibility Re-exports
// ==========================================
export {
  getUserFromFirestore,
  getAllUsersFromFirestore,
  syncUserToFirestore,
  syncTransactionToFirestore,
  syncCryptoDepositToFirestore,
  syncEmailConfigToFirestore,
  getEmailConfigFromFirestore,
  getEmailLogsFromFirestore,
  getVirtualCardsFromFirestore,
  syncVirtualCardToFirestore,
  syncVerificationToFirestore,
  getAllVerificationsFromFirestore,
  getTransactionsFromFirestore,
  updateTransactionInFirestore,
  syncSupportTicketToFirestore,
  getSupportTicketsFromFirestore,
  sendSupportMessageToFirestore,
  deleteSupportMessageFromFirestore
} from '../lib/firebase.js';

// Compatibility Aliases for callers expecting sync/save aliases
export {
  syncUserToFirestore as saveUserFromFirestore,
  syncUserToFirestore as syncUserFromFirestore,
  syncVirtualCardToFirestore as syncVirtualCardFromFirestore
} from '../lib/firebase.js';
