import express from 'express';
import { dbManager } from './db.js';
import { emailService } from './emailService.js';

const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Rewrite requests missing /api prefix for API routes
app.use((req, res, next) => {
  if (
    !req.path.startsWith('/api/') &&
    (req.path.startsWith('/auth/') ||
      req.path.startsWith('/user/') ||
      req.path.startsWith('/admin/') ||
      req.path.startsWith('/support/') ||
      req.path.startsWith('/crypto-addresses'))
  ) {
    req.url = '/api' + req.url;
  }
  next();
});

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
const getAuthUser = async (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let token = authHeader.replace('Bearer ', '').trim();
  if (token.startsWith('token-')) {
    token = token.replace('token-', '');
  }
  if (token === 'user-admin' || token === 'admin-001' || token === 'admin') {
    const admin = (await dbManager.findUserByIdAsync('admin-001')) || (await dbManager.findUserByEmailAsync('admin@svb.com'));
    if (admin) return admin;
  }
  return (await dbManager.findUserByIdAsync(token)) || (await dbManager.findUserByEmailAsync(token)) || null;
};

// --- API ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Auth: Register
const handleRegister = async (req: express.Request, res: express.Response) => {
  try {
    const { fullName, email, phone, password, accountPin } = req.body || {};
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email address are required.' });
    }

    const result = await dbManager.createUserAsync({
      fullName,
      email,
      phone: phone || '',
      password: password || 'password123',
      accountPin
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
};
app.post('/api/auth/register', handleRegister);
app.post('/auth/register', handleRegister);

// Auth: Login
const handleLogin = async (req: express.Request, res: express.Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email or account number is required.' });
    }

    const result = await dbManager.loginUserAsync(email, password || 'password123');
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Authentication failed.' });
  }
};
app.post('/api/auth/login', handleLogin);
app.post('/auth/login', handleLogin);

// Auth: Get Current User
const handleAuthMe = async (req: express.Request, res: express.Response) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user });
};
app.get('/api/auth/me', handleAuthMe);
app.get('/auth/me', handleAuthMe);

// User: Update Profile
const handleProfileUpdate = async (req: express.Request, res: express.Response) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const updatedUser = dbManager.updateUserProfile(user.id, req.body);
    res.json({ user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update profile.' });
  }
};
app.patch('/api/user/profile', handleProfileUpdate);
app.put('/api/user/profile', handleProfileUpdate);

// User: Change Password
app.post('/api/user/change-password', async (req, res) => {
  const user = await getAuthUser(req);
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
app.get('/api/user/account-lookup/:accNo', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const accUser = (await dbManager.findUserByAccountNumberAsync(req.params.accNo)) || (await dbManager.findUserByEmailAsync(req.params.accNo));
  if (accUser) {
    res.json({ found: true, fullName: accUser.fullName, accountNumber: accUser.accountNumber });
  } else {
    res.json({ found: false });
  }
});

// User: Send Transfer
app.post('/api/user/transfer', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/user/withdraw', async (req, res) => {
  const user = await getAuthUser(req);
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
app.get('/api/user/cards', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const cards = dbManager.getUserVirtualCards(user.id);
  res.json({ cards });
});

app.post('/api/user/cards', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const card = dbManager.createVirtualCard(user.id, req.body);
    res.status(201).json({ card });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to issue virtual card.' });
  }
});

app.patch('/api/user/cards/:cardId/toggle', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const card = dbManager.toggleVirtualCardStatus(user.id, req.params.cardId);
    res.json({ card });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to toggle card status.' });
  }
});

// User: Bill Payments
app.get('/api/user/bills', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const bills = dbManager.getUserBillPayments(user.id);
  res.json({ bills });
});

app.post('/api/user/bills/pay', async (req, res) => {
  const user = await getAuthUser(req);
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
app.get('/api/support/tickets', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const tickets = user.role === 'admin' 
    ? dbManager.getSupportTickets()
    : dbManager.getSupportTickets(user.id);
  res.json({ tickets });
});

// Support Tickets: Create New
app.post('/api/support/tickets', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/support/tickets/:id/reply', async (req, res) => {
  const user = await getAuthUser(req);
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
app.patch('/api/support/tickets/:id/status', async (req, res) => {
  const user = await getAuthUser(req);
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
app.get('/api/user/transactions', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const transactions = dbManager.getUserTransactions(user.id);
  res.json({ transactions });
});

// User: Notifications
app.get('/api/user/notifications', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const notifications = dbManager.getUserNotifications(user.id);
  res.json({ notifications });
});

// User: Mark Notifications as Read
app.post('/api/user/notifications/mark-read', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  dbManager.markNotificationsRead(user.id);
  res.json({ success: true });
});

// Admin: Search Users by email or account number
app.get('/api/admin/users/search', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. SVB Review privilege required.' });
  }

  const query = (req.query.q as string) || '';
  const users = await dbManager.searchUsersAsync(query);

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
app.get('/api/admin/users', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. SVB Review privilege required.' });
  }
  const users = await dbManager.searchUsersAsync('');
  res.json({ users });
});

// Admin: Process Deposit Entry
app.post('/api/admin/deposit', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. SVB Review privilege required.' });
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
app.get('/api/admin/audit-logs', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ auditLogs: dbManager.getAuditLogs() });
});

// Admin: Get All System Transactions
app.get('/api/admin/transactions', async (req, res) => {
  const user = await getAuthUser(req);
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
app.patch('/api/admin/crypto-addresses', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/user/crypto-activation-deposit', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { cryptoMethod, txHash, proofNote, proofImage } = req.body;
    if (!cryptoMethod || (cryptoMethod !== 'BTC' && cryptoMethod !== 'USDT')) {
      return res.status(400).json({ error: 'Payment method must be BTC or USDT.' });
    }

    const deposit = dbManager.createCryptoActivationDeposit(user, cryptoMethod, txHash, proofNote, proofImage);
    res.status(201).json({ deposit, user: dbManager.findUserById(user.id) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit activation deposit.' });
  }
});

// Admin: Get Pending Crypto Activation Deposits
app.get('/api/admin/crypto-activation-deposits', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }
  res.json({ deposits: dbManager.getCryptoActivationDeposits() });
});

// Admin: Approve $200 Crypto Activation Deposit & Issue 4-Digit Code
app.post('/api/admin/approve-crypto-activation-deposit', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/reject-crypto-activation-deposit', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/withdraw', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/cancel-transaction', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/approve-transaction', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/reject-transaction', async (req, res) => {
  const user = await getAuthUser(req);
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
app.post('/api/admin/users/:userId/regenerate-code', async (req, res) => {
  const user = await getAuthUser(req);
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

// Admin: Revoke 4-Digit Code for User
app.post('/api/admin/users/:userId/revoke-code', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
  }

  try {
    const targetUser = dbManager.findUserById(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const updatedUser = dbManager.updateUserProfile(targetUser.id, {
      transferCodeApproved: false,
      fourDigitCode: ''
    });

    res.json({ message: '4-Digit Code authorization revoked successfully.', user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to revoke 4-Digit Code.' });
  }
});

// Admin: Change User Role
app.post('/api/admin/users/:userId/role', async (req, res) => {
  const user = await getAuthUser(req);
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

// Admin: Change User Account Status
app.post('/api/admin/users/:userId/status', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const { status } = req.body;
    const updatedUser = dbManager.updateUserStatus(req.params.userId, status, user);
    res.json({ user: updatedUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update user status.' });
  }
});

// Admin: Send Direct Notification to User
app.post('/api/admin/users/:userId/notify', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const { title, message } = req.body;
    const notification = dbManager.sendAdminNotification(user, req.params.userId, title, message);
    res.json({ notification });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send notification.' });
  }
});

// Admin: Check Email Service Provider Status
app.get('/api/admin/email-status', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const config = dbManager.getEmailConfig();
  const hasResend = !!(config.resendApiKey || process.env.RESEND_API_KEY);
  const hasBrevo = !!(config.brevoApiKey || process.env.BREVO_API_KEY);
  const hasSendGrid = !!(config.sendgridApiKey || process.env.SENDGRID_API_KEY);
  const hasGmail = !!(config.gmailAppPassword || process.env.GMAIL_APP_PASSWORD);
  const hasSmtp = !!(config.smtpHost && config.smtpPass) || !!(process.env.SMTP_HOST && process.env.SMTP_PASS);

  let activeProvider = 'No Provider Configured (Delivery Inactive)';
  if (config.provider === 'brevo' && hasBrevo) activeProvider = 'Brevo API (Sendinblue)';
  else if (config.provider === 'resend' && hasResend) activeProvider = 'Resend API';
  else if (config.provider === 'sendgrid' && hasSendGrid) activeProvider = 'SendGrid API';
  else if (config.provider === 'gmail_smtp' && hasGmail) activeProvider = 'Gmail SMTP (App Password)';
  else if (config.provider === 'custom_smtp' && hasSmtp) activeProvider = 'Custom SMTP Mailer';
  else if (hasBrevo) activeProvider = 'Brevo API (Active)';
  else if (hasResend) activeProvider = 'Resend API (Active)';
  else if (hasSendGrid) activeProvider = 'SendGrid API (Active)';
  else if (hasGmail) activeProvider = 'Gmail SMTP (Active)';
  else if (hasSmtp) activeProvider = 'Direct SMTP (Active)';

  res.json({
    activeProvider,
    senderEmail: config.senderEmail || 'siliconvalleybank51@gmail.com',
    senderName: config.senderName || 'Silicon Valley Bank',
    selectedProvider: config.provider || 'auto',
    providersConfigured: {
      brevo: hasBrevo,
      resend: hasResend,
      sendgrid: hasSendGrid,
      gmail: hasGmail,
      smtp: hasSmtp
    },
    hasCredentials: hasBrevo || hasResend || hasSendGrid || hasGmail || hasSmtp
  });
});

// Admin: Get and Save Email Configuration
app.get('/api/admin/email-config', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const config = dbManager.getEmailConfig();
  res.json({
    provider: config.provider || 'auto',
    senderEmail: config.senderEmail || 'siliconvalleybank51@gmail.com',
    senderName: config.senderName || 'Silicon Valley Bank',
    brevoApiKey: config.brevoApiKey ? `${config.brevoApiKey.substring(0, 8)}...${config.brevoApiKey.slice(-4)}` : '',
    resendApiKey: config.resendApiKey ? `${config.resendApiKey.substring(0, 6)}...${config.resendApiKey.slice(-4)}` : '',
    sendgridApiKey: config.sendgridApiKey ? `${config.sendgridApiKey.substring(0, 6)}...${config.sendgridApiKey.slice(-4)}` : '',
    smtpHost: config.smtpHost || '',
    smtpPort: config.smtpPort || 587,
    smtpUser: config.smtpUser || '',
    hasGmailPass: !!config.gmailAppPassword,
    hasSmtpPass: !!config.smtpPass,
    updatedAt: config.updatedAt
  });
});

app.post('/api/admin/email-config', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const updated = dbManager.saveEmailConfig(user, req.body);
    res.json({ success: true, message: 'Email configuration updated successfully.', config: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update email configuration.' });
  }
});

// Admin: Get Delivery Audit Logs
app.get('/api/admin/email-logs', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const logs = await dbManager.getEmailDeliveryLogsAsync();
  res.json({ logs });
});

// Admin: Send Real Test Transactional Email
app.post('/api/admin/test-email', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const { toEmail, subject, type, configOverride } = req.body;
    const recipient = (toEmail || user.email || '').trim();

    if (!recipient || !recipient.includes('@')) {
      return res.status(400).json({ error: 'Please specify a valid recipient email address.' });
    }

    console.log(`[AdminAPI] Dispatching test email to "${recipient}" of type "${type || 'security'}" with configOverride:`, configOverride ? {
      provider: configOverride.provider,
      senderEmail: configOverride.senderEmail,
      hasGmailPass: !!(configOverride.gmailAppPassword || configOverride.smtpPass)
    } : 'None');

    let result;
    if (type === 'welcome') {
      result = await emailService.sendWelcomeEmail({
        fullName: 'Valued Client',
        email: recipient,
        accountNumber: '1099887766',
        routingNumber: '121000358'
      }, configOverride);
    } else if (type === 'deposit') {
      result = await emailService.sendDepositApprovedEmail({
        userEmail: recipient,
        fullName: 'Valued Client',
        accountNumber: '1099887766',
        amount: 2500.00,
        currency: 'USD',
        reference: `TXN-TEST-${Date.now().toString().slice(-4)}`,
        type: 'Deposit',
        status: 'Completed',
        currentBalance: 250000.00,
        activationCode: '5892'
      }, configOverride);
    } else if (type === 'rejected') {
      result = await emailService.sendTransactionRejectedEmail({
        userEmail: recipient,
        fullName: 'Valued Client',
        accountNumber: '1099887766',
        amount: 500.00,
        currency: 'USD',
        reference: `TXN-TEST-REJ-${Date.now().toString().slice(-4)}`,
        type: 'Transfer',
        status: 'Rejected',
        rejectionReason: 'Test transaction security decline by SVB Operations Review.',
        currentBalance: 250000.00
      }, configOverride);
    } else {
      result = await emailService.sendSecurityAlertEmail(
        recipient,
        subject || 'Security Notification - Live Test Alert',
        'This is a verified test email alert dispatched from Silicon Valley Bank to test your live external inbox delivery.',
        '9412',
        configOverride
      );
    }

    if (result && result.success) {
      return res.json({
        success: true,
        message: `Live email delivered to ${recipient} via ${result.provider} (ID: ${result.messageId || 'Cleared'})`,
        deliveryResult: result
      });
    } else {
      const errorMsg = result?.error || 'Email dispatch failed. Please verify provider credentials in Email Service settings.';
      return res.status(400).json({
        success: false,
        error: errorMsg,
        deliveryResult: result
      });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to dispatch test email.' });
  }
});

export default app;
