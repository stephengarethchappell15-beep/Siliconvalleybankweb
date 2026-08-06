import express from 'express';
import { dbManager } from './db.js';

const app = express();

app.use(express.json());

// Security Headers & Reputation Best Practices
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Robots.txt for SEO & Security Audit Compliance
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// Sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${host}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

// Helper auth middleware extractor
const getAuthUser = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  if (!token.startsWith('token-')) return null;
  const userId = token.replace('token-', '');
  return dbManager.findUserById(userId) || null;
};

// --- API ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Auth: Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { fullName, email, phone, password, accountPin } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }

    const result = dbManager.createUser({ fullName, email, phone: phone || '', password, accountPin });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = dbManager.loginUser(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Authentication failed.' });
  }
});

// Auth: Get Current User
app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user });
});

// User: Update Profile
app.patch('/api/user/profile', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const updatedUser = dbManager.updateUserProfile(user.id, req.body);
    res.json({ user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update profile.' });
  }
});

// User: Change Password
app.post('/api/user/change-password', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { oldPassword, newPassword } = req.body;
    dbManager.changePassword(user.id, oldPassword, newPassword);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to change password.' });
  }
});

// User: Account Lookup
app.get('/api/user/account-lookup/:accNo', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const accUser = dbManager.findUserByAccountNumber(req.params.accNo) || dbManager.findUserByEmail(req.params.accNo);
  if (accUser) {
    res.json({ found: true, fullName: accUser.fullName, accountNumber: accUser.accountNumber });
  } else {
    res.json({ found: false });
  }
});

// User: Send Transfer
app.post('/api/user/transfer', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { destinationCountry, destinationBank, recipientInput, recipientName, amount, fourDigitCode, note } = req.body;
    if (!recipientInput || !amount) {
      return res.status(400).json({ error: 'Recipient account number and transfer amount are required.' });
    }

    const result = dbManager.createTransfer(user, {
      destinationCountry,
      destinationBank,
      recipientInput,
      recipientName,
      amount: Number(amount),
      fourDigitCode,
      note
    });
    res.json({
      message: 'Transfer request submitted successfully in Pending status.',
      updatedUser: result.sender,
      transaction: result.transaction
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Transfer failed.' });
  }
});

// User: Wire Withdrawal
app.post('/api/user/withdraw', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { bankName, routingNumber, accountNumber, accountHolderName, amount, note } = req.body;
    const result = dbManager.createWithdrawal(user, {
      bankName,
      routingNumber,
      accountNumber,
      accountHolderName,
      amount: Number(amount),
      note
    });
    res.json({
      message: 'Withdrawal processed successfully.',
      updatedUser: result.user,
      transaction: result.transaction
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Withdrawal failed.' });
  }
});

// User: Virtual Cards
app.get('/api/user/cards', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const cards = dbManager.getUserVirtualCards(user.id);
  res.json({ cards });
});

app.post('/api/user/cards', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const card = dbManager.createVirtualCard(user.id, req.body);
    res.status(201).json({ card });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to issue virtual card.' });
  }
});

app.patch('/api/user/cards/:cardId/toggle', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const card = dbManager.toggleVirtualCardStatus(user.id, req.params.cardId);
    res.json({ card });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to toggle card status.' });
  }
});

// User: Bill Payments
app.get('/api/user/bills', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const bills = dbManager.getUserBillPayments(user.id);
  res.json({ bills });
});

app.post('/api/user/bills/pay', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = dbManager.payBill(user, req.body);
    res.json({ message: 'Bill payment processed successfully.', updatedUser: result.user, billPayment: result.billPayment, transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Bill payment failed.' });
  }
});

// Auth: Password Reset Request & Reset Execution
app.post('/api/auth/reset-password/request', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required.' });
    const result = dbManager.requestPasswordReset(email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset request failed.' });
  }
});

app.post('/api/auth/reset-password/verify', (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }
    const result = dbManager.verifyAndResetPassword(email, code, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset verification failed.' });
  }
});

// Support Tickets: Get List
app.get('/api/support/tickets', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const tickets = user.role === 'admin' 
    ? dbManager.getSupportTickets()
    : dbManager.getSupportTickets(user.id);
  res.json({ tickets });
});

// Support Tickets: Create New
app.post('/api/support/tickets', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { subject, category, priority, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }
    const ticket = dbManager.createSupportTicket(user, { subject, category, priority, message });
    res.status(201).json({ ticket });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create support ticket.' });
  }
});

// Support Tickets: Reply
app.post('/api/support/tickets/:id/reply', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message content is required.' });
    }
    const ticket = dbManager.replySupportTicket(req.params.id, user, message);
    res.json({ ticket });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reply to ticket.' });
  }
});

// Support Tickets: Update Status (Admin)
app.patch('/api/support/tickets/:id/status', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  try {
    const { status } = req.body;
    const ticket = dbManager.updateTicketStatus(req.params.id, status, user);
    res.json({ ticket });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update ticket status.' });
  }
});

// User: Transactions (Only user's own transactions)
app.get('/api/user/transactions', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const transactions = dbManager.getUserTransactions(user.id);
  res.json({ transactions });
});

// User: Notifications
app.get('/api/user/notifications', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const notifications = dbManager.getUserNotifications(user.id);
  res.json({ notifications });
});

// User: Mark Notifications as Read
app.post('/api/user/notifications/mark-read', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  dbManager.markNotificationsRead(user.id);
  res.json({ success: true });
});

// Admin: Search Users by email or account number
app.get('/api/admin/users/search', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  const query = (req.query.q as string) || '';
  const users = dbManager.searchUsers(query);

  if (query.trim()) {
    dbManager.addAuditLog({
      adminId: user.id,
      adminEmail: user.email,
      action: 'USER_SEARCHED',
      targetEmail: query,
      targetAccountNumber: 'N/A',
      description: `Admin searched user records with query: "${query}"`,
      details: { resultCount: users.length }
    });
  }

  res.json({ users });
});

// Admin: Get All Users
app.get('/api/admin/users', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ users: dbManager.getUsers() });
});

// Admin: Process Deposit Entry
app.post('/api/admin/deposit', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { userEmail, accountNumber, amount, currency, description, reference } = req.body;
    if ((!userEmail && !accountNumber) || !amount) {
      return res.status(400).json({ error: 'User email or account number, and amount are required.' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Deposit amount must be a positive number.' });
    }

    const result = dbManager.createDeposit(
      {
        userEmail,
        accountNumber,
        amount: numAmount,
        currency: currency || 'USD',
        description: description || 'Admin Balance Deposit',
        reference: reference || ''
      },
      user
    );

    res.status(200).json({
      message: 'Deposit processed successfully',
      updatedUser: result.user,
      transaction: result.transaction
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process deposit.' });
  }
});

// Admin: Get Audit Logs
app.get('/api/admin/audit-logs', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ auditLogs: dbManager.getAuditLogs() });
});

// Admin: Get All System Transactions
app.get('/api/admin/transactions', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ transactions: dbManager.getAllTransactions() });
});

// User & Admin: Get Crypto Wallet Deposit Addresses
app.get('/api/crypto-addresses', (req, res) => {
  res.json({ addresses: dbManager.getCryptoWalletAddresses() });
});

// Admin: Update Crypto Wallet Deposit Addresses
app.patch('/api/admin/crypto-addresses', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  try {
    const addresses = dbManager.updateCryptoWalletAddresses(user, req.body);
    res.json({ addresses });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update addresses.' });
  }
});

// User: Request $2,500 Crypto Activation Deposit (BTC / USDT)
app.post('/api/user/crypto-activation-deposit', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { cryptoMethod, txHash, proofNote } = req.body;
    if (!cryptoMethod || (cryptoMethod !== 'BTC' && cryptoMethod !== 'USDT')) {
      return res.status(400).json({ error: 'Payment method must be BTC or USDT.' });
    }

    const deposit = dbManager.createCryptoActivationDeposit(user, cryptoMethod, txHash, proofNote);
    res.status(201).json({ deposit, user: dbManager.findUserById(user.id) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit activation deposit.' });
  }
});

// Admin: Get Pending Crypto Activation Deposits
app.get('/api/admin/crypto-activation-deposits', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ deposits: dbManager.getCryptoActivationDeposits() });
});

// Admin: Approve $200 Crypto Activation Deposit & Issue 4-Digit Code
app.post('/api/admin/approve-crypto-activation-deposit', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { depositId } = req.body;
    if (!depositId) return res.status(400).json({ error: 'Deposit ID is required.' });

    const result = dbManager.approveCryptoActivationDeposit(user, depositId);
    res.json({ message: 'Deposit approved and 4-Digit Code generated successfully.', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to approve deposit.' });
  }
});

// Admin: Reject $200 Crypto Activation Deposit
app.post('/api/admin/reject-crypto-activation-deposit', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { depositId } = req.body;
    if (!depositId) return res.status(400).json({ error: 'Deposit ID is required.' });

    const result = dbManager.rejectCryptoActivationDeposit(user, depositId);
    res.json({ message: 'Deposit rejected.', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reject deposit.' });
  }
});

// Admin: Process Account Withdrawal from Any User
app.post('/api/admin/withdraw', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { accountNumber, amount, note } = req.body;
    if (!accountNumber || !amount) {
      return res.status(400).json({ error: 'User email or account number, and amount are required.' });
    }

    const result = dbManager.adminWithdraw(user, {
      bankName: 'Silicon Valley Bank Admin Direct',
      routingNumber: '121000358',
      accountNumber,
      accountHolderName: 'Admin Withdrawal',
      amount: Number(amount),
      note
    });

    res.json({ message: 'Withdrawal processed successfully', updatedUser: result.user, transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process admin withdrawal.' });
  }
});

// Admin: Cancel Transfer / Transaction
app.post('/api/admin/cancel-transaction', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'Transaction ID is required.' });

    const result = dbManager.adminCancelTransaction(user, transactionId);
    res.json({ message: 'Transaction cancelled successfully.', transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel transaction.' });
  }
});

// Admin: Approve Pending Transfer / Transaction (credits recipient with manual sender name)
app.post('/api/admin/approve-transaction', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { transactionId, senderName } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'Transaction ID is required.' });

    const result = dbManager.approveTransaction(user, transactionId, senderName);
    res.json({ message: 'Transaction approved and recipient credited successfully.', transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to approve transaction.' });
  }
});

// Admin: Reject Transfer / Transaction (Refunds user)
app.post('/api/admin/reject-transaction', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const { transactionId, reason } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'Transaction ID is required.' });

    const result = dbManager.rejectTransaction(user, transactionId, reason);
    res.json({ message: 'Transaction rejected and funds returned to user.', transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reject transaction.' });
  }
});

// Admin: Regenerate 4-Digit Code for User
app.post('/api/admin/users/:userId/regenerate-code', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const result = dbManager.regenerateFourDigitCode(user, req.params.userId);
    res.json({ message: '4-Digit Code regenerated successfully.', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to regenerate 4-Digit Code.' });
  }
});

// Admin: Change User Role
app.post('/api/admin/users/:userId/role', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const { role } = req.body;
    const updatedUser = dbManager.updateUserRole(req.params.userId, role, user);
    res.json({ user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update user role.' });
  }
});

export default app;
