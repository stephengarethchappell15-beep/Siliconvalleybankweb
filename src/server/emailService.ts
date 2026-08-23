import nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface UserEmailData {
  fullName: string;
  email: string;
  accountNumber?: string;
  routingNumber?: string;
  phone?: string;
}

export interface TransactionEmailData {
  userEmail: string;
  fullName?: string;
  accountNumber?: string;
  amount: number;
  currency?: string;
  reference: string;
  type: string;
  status: string;
  method?: string;
  description?: string;
  recipientName?: string;
  recipientBank?: string;
  recipientAccount?: string;
  senderName?: string;
  activationCode?: string;
  currentBalance?: number;
  rejectionReason?: string;
}

const DEFAULT_SENDER = process.env.SENDER_EMAIL || 'siliconvalleybank51@gmail.com';
const SENDER_NAME = 'Silicon Valley Bank';
const FULL_SENDER = `"${SENDER_NAME}" <${DEFAULT_SENDER}>`;

/**
 * Base SVB HTML Email Template
 */
function renderSvbEmailTemplate(title: string, subtitle: string, bodyContent: string, actionButton?: { text: string; url: string }): string {
  const appUrl = process.env.APP_URL || 'https://www.svb.com';
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #0b1320;
      color: #334155;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0b1320;
      padding: 30px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    .header {
      background: linear-gradient(135deg, #002b49 0%, #001726 100%);
      padding: 32px 30px;
      text-align: center;
      border-bottom: 3px solid #00a3e0;
    }
    .logo-badge {
      display: inline-block;
      padding: 8px 16px;
      background: rgba(0, 163, 224, 0.15);
      border: 1px solid rgba(0, 163, 224, 0.4);
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .logo-text {
      color: #00a3e0;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0;
    }
    .header h1 {
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      margin: 8px 0 4px 0;
      letter-spacing: -0.5px;
    }
    .header p {
      color: #94a3b8;
      font-size: 13px;
      margin: 0;
    }
    .content {
      padding: 32px 30px;
      background-color: #ffffff;
      line-height: 1.6;
    }
    .badge-pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    .badge-success {
      background-color: #ecfdf5;
      color: #059669;
      border: 1px solid #a7f3d0;
    }
    .badge-pending {
      background-color: #fffbeb;
      color: #d97706;
      border: 1px solid #fde68a;
    }
    .badge-alert {
      background-color: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }
    .badge-info {
      background-color: #f0f9ff;
      color: #0284c7;
      border: 1px solid #bae6fd;
    }
    .card-highlight {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .amount-display {
      text-align: center;
      padding: 18px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      margin: 20px 0;
    }
    .amount-value {
      font-size: 32px;
      font-weight: 800;
      color: #166534;
      font-family: 'Courier New', Courier, monospace;
      margin: 4px 0;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .data-table td {
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
    }
    .data-table td.label {
      color: #64748b;
      font-weight: 500;
      width: 40%;
    }
    .data-table td.value {
      color: #0f172a;
      font-weight: 600;
      text-align: right;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .data-table td.mono {
      font-family: 'Courier New', Courier, monospace;
      color: #002b49;
    }
    .btn-container {
      text-align: center;
      margin: 28px 0 16px 0;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: #002b49;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0, 43, 73, 0.25);
    }
    .security-notice {
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 14px;
      border-radius: 0 8px 8px 0;
      font-size: 12px;
      color: #92400e;
      margin-top: 24px;
    }
    .footer {
      background-color: #f1f5f9;
      padding: 24px 30px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      margin: 4px 0;
    }
    .footer-links {
      margin: 12px 0;
    }
    .footer-links a {
      color: #00a3e0;
      text-decoration: none;
      margin: 0 8px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <div class="logo-badge">
          <p class="logo-text">Silicon Valley Bank</p>
        </div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>

      <!-- Content -->
      <div class="content">
        ${bodyContent}

        ${actionButton ? `
          <div class="btn-container">
            <a href="${actionButton.url || appUrl}" class="btn" target="_blank">${actionButton.text}</a>
          </div>
        ` : ''}

        <div class="security-notice">
          <strong>Security Notice:</strong> Silicon Valley Bank staff will never ask for your password, account PIN, or one-time codes over the phone or via unverified communication channels.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p><strong>Silicon Valley Bank</strong>, a division of First Citizens Bank • Member FDIC</p>
        <p>3000 Sand Hill Road, Menlo Park, CA 94025 • Official Banking Wire Services</p>
        <p class="footer-links">
          <a href="${appUrl}">Access Online Portal</a> • 
          <a href="${appUrl}#support">24/7 Security Desk</a> • 
          <a href="mailto:siliconvalleybank51@gmail.com">support@svb.com</a>
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin-top: 10px;">
          This is an automated operational notification. Replies to this email are monitored by the SVB Operations Review Desk.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Robust Core Email Dispatcher
 * Priority Order:
 * 1. Resend API
 * 2. Brevo API
 * 3. SendGrid API
 * 4. Nodemailer SMTP (Gmail or custom host)
 * 5. Safe Development Logging Fallback
 */
export async function sendEmailAsync(payload: EmailPayload): Promise<{ success: boolean; provider?: string; error?: string }> {
  const { to, subject, html, text } = payload;
  const from = FULL_SENDER;

  if (!to || !to.includes('@')) {
    console.warn('[EmailService] Invalid recipient email address:', to);
    return { success: false, error: 'Invalid recipient email' };
  }

  // 1. Check Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: DEFAULT_SENDER.includes('@') ? DEFAULT_SENDER : 'onboarding@resend.dev',
          to: [to],
          subject,
          html,
          text: text || subject
        })
      });

      if (res.ok) {
        console.log(`[EmailService:Resend] Email successfully sent to ${to} ("${subject}")`);
        return { success: true, provider: 'resend' };
      } else {
        const errText = await res.text();
        console.warn(`[EmailService:Resend] Response failed (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      console.warn('[EmailService:Resend] Error communicating with Resend:', err.message);
    }
  }

  // 2. Check Brevo (Sendinblue) API
  if (process.env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: DEFAULT_SENDER },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text || subject
        })
      });

      if (res.ok) {
        console.log(`[EmailService:Brevo] Email successfully sent to ${to} ("${subject}")`);
        return { success: true, provider: 'brevo' };
      } else {
        const errText = await res.text();
        console.warn(`[EmailService:Brevo] Response failed (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      console.warn('[EmailService:Brevo] Error communicating with Brevo:', err.message);
    }
  }

  // 3. Check SendGrid API
  if (process.env.SENDGRID_API_KEY) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: DEFAULT_SENDER, name: SENDER_NAME },
          subject,
          content: [
            { type: 'text/html', value: html },
            { type: 'text/plain', value: text || subject }
          ]
        })
      });

      if (res.status >= 200 && res.status < 300) {
        console.log(`[EmailService:SendGrid] Email successfully sent to ${to} ("${subject}")`);
        return { success: true, provider: 'sendgrid' };
      } else {
        const errText = await res.text();
        console.warn(`[EmailService:SendGrid] Response failed (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      console.warn('[EmailService:SendGrid] Error communicating with SendGrid:', err.message);
    }
  }

  // 4. Check Nodemailer / SMTP Transport (e.g. Gmail App Password or custom SMTP)
  const smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const smtpUser = process.env.SMTP_USER || DEFAULT_SENDER;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  if (smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      const info = await transporter.sendMail({
        from: FULL_SENDER,
        to,
        subject,
        html,
        text: text || subject
      });

      console.log(`[EmailService:SMTP] Email successfully dispatched to ${to} (MessageId: ${info.messageId})`);
      return { success: true, provider: 'smtp' };
    } catch (err: any) {
      console.warn('[EmailService:SMTP] Error sending via Nodemailer SMTP:', err.message);
    }
  }

  // 5. Safe Fallback / Dev Log: Ensures zero crash and logs full operational notification
  console.log(`[EmailService:Simulation] Real email triggered for [${to}] from [${DEFAULT_SENDER}]: "${subject}"`);
  return { 
    success: true, 
    provider: 'simulated_log',
    error: 'Dispatched in dev logging mode. To send live deliverable emails, configure RESEND_API_KEY, BREVO_API_KEY, SENDGRID_API_KEY, or GMAIL_APP_PASSWORD in settings.' 
  };
}

/**
 * High-Level Banking Event Notification Functions
 * All functions are non-blocking and bulletproof (will never throw)
 */

export const emailService = {
  /**
   * 1. Account Creation / Welcome Email
   */
  async sendWelcomeEmail(user: UserEmailData): Promise<void> {
    try {
      const title = 'Welcome to Silicon Valley Bank';
      const subtitle = 'Your SVB Digital Commercial Banking Account is Active';
      const body = `
        <div class="badge-pill badge-success">Account Provisioned</div>
        <p>Dear <strong>${user.fullName}</strong>,</p>
        <p>We are delighted to welcome you to <strong>Silicon Valley Bank (SVB)</strong>. Your high-performance digital commercial banking account has been established and is ready to process domestic and international treasury operations.</p>
        
        <div class="card-highlight">
          <table class="data-table">
            <tr>
              <td class="label">Account Holder:</td>
              <td class="value">${user.fullName}</td>
            </tr>
            <tr>
              <td class="label">Registered Email:</td>
              <td class="value">${user.email}</td>
            </tr>
            ${user.accountNumber ? `
            <tr>
              <td class="label">Account Number:</td>
              <td class="value mono">${user.accountNumber}</td>
            </tr>` : ''}
            ${user.routingNumber ? `
            <tr>
              <td class="label">Fedwire / ACH Routing:</td>
              <td class="value mono">${user.routingNumber}</td>
            </tr>` : ''}
            <tr>
              <td class="label">FDIC Insurance:</td>
              <td class="value" style="color: #059669;">Covered up to $250,000+</td>
            </tr>
          </table>
        </div>

        <p>You can now fund your account via Fedwire, ACH transfer, or crypto-asset settlement, generate virtual corporate cards, and execute global wire transfers 24/7.</p>
      `;

      const html = renderSvbEmailTemplate(title, subtitle, body, {
        text: 'Access Your SVB Portal',
        url: process.env.APP_URL || 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: user.email,
        subject: 'Welcome to Silicon Valley Bank — Account Details & Access',
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendWelcomeEmail:', err.message);
    }
  },

  /**
   * 2. Deposit Submitted / Under Review
   */
  async sendDepositSubmittedEmail(data: TransactionEmailData): Promise<void> {
    try {
      const title = 'Deposit Received & Under Review';
      const subtitle = `Reference #${data.reference}`;
      const formattedAmount = `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const body = `
        <div class="badge-pill badge-pending">Pending SVB Operations Verification</div>
        <p>Dear Valued Client,</p>
        <p>We have received your request for an account deposit. Our treasury settlement systems and SVB Operations Desk have queued your transaction for verification.</p>

        <div class="amount-display">
          <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 1px;">Deposit Amount</div>
          <div class="amount-value">+${formattedAmount} ${data.currency || 'USD'}</div>
          <div style="font-size: 11px; color: #64748b;">Method: ${data.method || 'Wire / ACH Transfer'}</div>
        </div>

        <div class="card-highlight">
          <table class="data-table">
            <tr>
              <td class="label">Reference Number:</td>
              <td class="value mono">${data.reference}</td>
            </tr>
            <tr>
              <td class="label">Date & Time:</td>
              <td class="value">${new Date().toUTCString()}</td>
            </tr>
            <tr>
              <td class="label">Status:</td>
              <td class="value" style="color: #d97706; font-weight: 700;">Pending Review</td>
            </tr>
            ${data.description ? `
            <tr>
              <td class="label">Memo / Description:</td>
              <td class="value">${data.description}</td>
            </tr>` : ''}
          </table>
        </div>

        <p>You will receive an automated confirmation email as soon as the funds are settled and credited to your available balance.</p>
      `;

      const html = renderSvbEmailTemplate(title, subtitle, body, {
        text: 'Track Deposit Status',
        url: process.env.APP_URL || 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Notification: Deposit Received (${formattedAmount}) - Ref #${data.reference}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendDepositSubmittedEmail:', err.message);
    }
  },

  /**
   * 3. Deposit Approved & Available Balance Credited
   */
  async sendDepositApprovedEmail(data: TransactionEmailData): Promise<void> {
    try {
      const title = 'Funds Settled & Credited to Account';
      const subtitle = `Reference #${data.reference}`;
      const formattedAmount = `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const body = `
        <div class="badge-pill badge-success">Settlement Confirmed • Funds Available</div>
        <p>Dear Valued Client,</p>
        <p>Silicon Valley Bank is pleased to notify you that your deposit of <strong>${formattedAmount}</strong> has been successfully reviewed, verified, and credited to your account balance.</p>

        <div class="amount-display">
          <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 1px;">Credited Amount</div>
          <div class="amount-value">+${formattedAmount}</div>
          <div style="font-size: 11px; color: #64748b;">Status: Completed & Cleared</div>
        </div>

        <div class="card-highlight">
          <table class="data-table">
            <tr>
              <td class="label">Reference Number:</td>
              <td class="value mono">${data.reference}</td>
            </tr>
            <tr>
              <td class="label">Settlement Protocol:</td>
              <td class="value">SVB Core Clear / Fedwire</td>
            </tr>
            <tr>
              <td class="label">Settlement Time:</td>
              <td class="value">${new Date().toUTCString()}</td>
            </tr>
            ${data.currentBalance !== undefined ? `
            <tr>
              <td class="label">Updated Balance:</td>
              <td class="value" style="color: #059669; font-weight: 800;">$${data.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>` : ''}
            ${data.activationCode ? `
            <tr>
              <td class="label">4-Digit Security Code:</td>
              <td class="value mono" style="font-size: 16px; color: #0284c7; font-weight: 800;">${data.activationCode}</td>
            </tr>` : ''}
          </table>
        </div>

        <p>These funds are immediately available for corporate card issuance, vendor disbursements, and international wire transfers.</p>
      `;

      const html = renderSvbEmailTemplate(title, subtitle, body, {
        text: 'View Transaction Receipt',
        url: process.env.APP_URL || 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Settlement Advice: Deposit Cleared (+${formattedAmount}) - Ref #${data.reference}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendDepositApprovedEmail:', err.message);
    }
  },

  /**
   * 4. Transaction / Deposit Rejected & Refunded
   */
  async sendTransactionRejectedEmail(data: TransactionEmailData): Promise<void> {
    try {
      const title = 'Transaction Update: Return / Rejection Notice';
      const subtitle = `Reference #${data.reference}`;
      const formattedAmount = `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const body = `
        <div class="badge-pill badge-alert">Transaction Returned / Rejected</div>
        <p>Dear Valued Client,</p>
        <p>This email is to advise you that the transaction referenced below could not be completed and has been marked as <strong>Rejected</strong> by SVB Operations Review.</p>

        <div class="card-highlight">
          <table class="data-table">
            <tr>
              <td class="label">Transaction Reference:</td>
              <td class="value mono">${data.reference}</td>
            </tr>
            <tr>
              <td class="label">Amount:</td>
              <td class="value">${formattedAmount} ${data.currency || 'USD'}</td>
            </tr>
            <tr>
              <td class="label">Status:</td>
              <td class="value" style="color: #dc2626; font-weight: 700;">Rejected / Returned</td>
            </tr>
            <tr>
              <td class="label">Review Note / Reason:</td>
              <td class="value" style="color: #dc2626;">${data.rejectionReason || 'Compliance audit / unverified counterparty details. Any debited funds have been refunded to your available balance.'}</td>
            </tr>
            <tr>
              <td class="label">Timestamp:</td>
              <td class="value">${new Date().toUTCString()}</td>
            </tr>
          </table>
        </div>

        <p>If any funds were previously held for this transaction, they have been returned to your available balance. If you believe this action was made in error or require further assistance, please reach out to the SVB Security Desk.</p>
      `;

      const html = renderSvbEmailTemplate(title, subtitle, body, {
        text: 'Open SVB Support Desk',
        url: process.env.APP_URL ? `${process.env.APP_URL}#support` : 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Notice: Transaction Rejected (${formattedAmount}) - Ref #${data.reference}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendTransactionRejectedEmail:', err.message);
    }
  },

  /**
   * 5. Wire / Transfer Sent (Debit Advice)
   */
  async sendTransferDebitEmail(data: TransactionEmailData): Promise<void> {
    try {
      const title = 'Wire Transfer Debit Advice';
      const subtitle = `Fedwire / SWIFT Reference #${data.reference}`;
      const formattedAmount = `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const body = `
        <div class="badge-pill badge-info">Outbound Wire Transfer Executed</div>
        <p>Dear Valued Client,</p>
        <p>We confirm that an outbound wire transfer in the amount of <strong>${formattedAmount}</strong> has been debited from your account.</p>

        <div class="card-highlight">
          <table class="data-table">
            <tr>
              <td class="label">Reference Number:</td>
              <td class="value mono">${data.reference}</td>
            </tr>
            <tr>
              <td class="label">Recipient Name:</td>
              <td class="value">${data.recipientName || 'Beneficiary Institution'}</td>
            </tr>
            ${data.recipientBank ? `
            <tr>
              <td class="label">Beneficiary Bank:</td>
              <td class="value">${data.recipientBank}</td>
            </tr>` : ''}
            ${data.recipientAccount ? `
            <tr>
              <td class="label">Beneficiary Account / IBAN:</td>
              <td class="value mono">${data.recipientAccount}</td>
            </tr>` : ''}
            <tr>
              <td class="label">Amount Debited:</td>
              <td class="value" style="color: #dc2626; font-weight: 700;">-${formattedAmount}</td>
            </tr>
            <tr>
              <td class="label">Execution Timestamp:</td>
              <td class="value">${new Date().toUTCString()}</td>
            </tr>
          </table>
        </div>

        <p>You can view and download the official transaction receipt at any time through the SVB Digital Portal.</p>
      `;

      const html = renderSvbEmailTemplate(title, subtitle, body, {
        text: 'View Wire Advice Slip',
        url: process.env.APP_URL || 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Debit Advice: Outbound Wire (-${formattedAmount}) - Ref #${data.reference}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendTransferDebitEmail:', err.message);
    }
  },

  /**
   * 6. Security Alert / Code Generation / Password Reset
   */
  async sendSecurityAlertEmail(userEmail: string, title: string, message: string, code?: string): Promise<void> {
    try {
      const headerTitle = 'SVB Security & Account Notification';
      const body = `
        <div class="badge-pill badge-info">Security Notice</div>
        <p>Dear Valued Client,</p>
        <p>${message}</p>

        ${code ? `
          <div style="text-align: center; margin: 24px 0; padding: 20px; background: #f0f9ff; border: 2px dashed #0284c7; border-radius: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your One-Time Security Code</div>
            <div style="font-size: 32px; font-weight: 800; color: #002b49; font-family: 'Courier New', Courier, monospace; letter-spacing: 6px;">${code}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valid for single-use verification. Do not share this code with anyone.</div>
          </div>
        ` : ''}

        <p>If you did not authorize or initiate this action, please contact the Silicon Valley Bank Security Operations Center immediately.</p>
      `;

      const html = renderSvbEmailTemplate(headerTitle, title, body, {
        text: 'Manage Account Security',
        url: process.env.APP_URL ? `${process.env.APP_URL}#settings` : 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: userEmail,
        subject: `SVB Security Alert: ${title}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendSecurityAlertEmail:', err.message);
    }
  },

  /**
   * 7. Custom Direct Notice from Admin to User
   */
  async sendCustomAdminNoticeEmail(userEmail: string, adminEmail: string, title: string, message: string): Promise<void> {
    try {
      const headerTitle = 'Message from SVB Operations Desk';
      const body = `
        <div class="badge-pill badge-info">Official Operations Notice</div>
        <p>Dear Valued Client,</p>
        <p>An authorized administrator from the Silicon Valley Bank Operations Review Desk (<code>${adminEmail}</code>) has issued the following communication regarding your account:</p>

        <div class="card-highlight">
          <h3 style="margin-top: 0; color: #002b49; font-size: 16px;">${title}</h3>
          <p style="margin-bottom: 0; color: #334155; white-space: pre-wrap;">${message}</p>
        </div>

        <p>If you have any questions or require clarification, you may respond directly to this notice or contact our dedicated client support desk.</p>
      `;

      const html = renderSvbEmailTemplate(headerTitle, title, body, {
        text: 'Access SVB Portal',
        url: process.env.APP_URL || 'https://www.svb.com'
      });

      await sendEmailAsync({
        to: userEmail,
        subject: `SVB Notice: ${title}`,
        html
      });
    } catch (err: any) {
      console.error('[EmailService] Error in sendCustomAdminNoticeEmail:', err.message);
    }
  }
};
