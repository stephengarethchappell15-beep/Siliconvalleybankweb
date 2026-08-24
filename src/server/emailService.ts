import nodemailer from 'nodemailer';
import { EmailConfig, EmailDeliveryLog } from '../types.js';
import { syncEmailLogToFirestore, getEmailConfigFromFirestore } from '../lib/firebase.js';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type?: string;
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

// In-Memory dynamic configuration store
let dynamicConfig: EmailConfig = {
  provider: 'gmail_smtp',
  senderEmail: 'siliconvalleybank51@gmail.com',
  senderName: 'Silicon Valley Bank',
  resendApiKey: process.env.RESEND_API_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  smtpUser: process.env.SMTP_USER || 'siliconvalleybank51@gmail.com',
  smtpPass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || ''
};

// In-memory delivery history log (capped to last 100 entries)
const deliveryLogs: EmailDeliveryLog[] = [];

/**
 * Dynamically resolves the active email configuration by merging:
 * 1. Explicit config override (from request payload)
 * 2. In-memory dynamicConfig
 * 3. Firestore persisted configuration
 * 4. Process environment variables
 */
async function resolveActiveConfig(configOverride?: Partial<EmailConfig>): Promise<EmailConfig> {
  let fsConfig: any = null;
  try {
    fsConfig = await getEmailConfigFromFirestore();
  } catch (e) {
    // Graceful Firestore fallback (e.g. quota limit or offline)
  }

  const merged: EmailConfig = {
    provider: configOverride?.provider || fsConfig?.provider || dynamicConfig.provider || 'gmail_smtp',
    senderEmail: (configOverride?.senderEmail || fsConfig?.senderEmail || dynamicConfig.senderEmail || 'siliconvalleybank51@gmail.com').trim(),
    senderName: (configOverride?.senderName || fsConfig?.senderName || dynamicConfig.senderName || 'Silicon Valley Bank').trim(),
    resendApiKey: (configOverride?.resendApiKey || fsConfig?.resendApiKey || dynamicConfig.resendApiKey || process.env.RESEND_API_KEY || '').trim(),
    brevoApiKey: (configOverride?.brevoApiKey || fsConfig?.brevoApiKey || dynamicConfig.brevoApiKey || process.env.BREVO_API_KEY || '').trim(),
    sendgridApiKey: (configOverride?.sendgridApiKey || fsConfig?.sendgridApiKey || dynamicConfig.sendgridApiKey || process.env.SENDGRID_API_KEY || '').trim(),
    smtpHost: (configOverride?.smtpHost || fsConfig?.smtpHost || dynamicConfig.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    smtpPort: Number(configOverride?.smtpPort || fsConfig?.smtpPort || dynamicConfig.smtpPort || process.env.SMTP_PORT || 587),
    smtpUser: (configOverride?.smtpUser || fsConfig?.smtpUser || dynamicConfig.smtpUser || process.env.SMTP_USER || 'siliconvalleybank51@gmail.com').trim(),
    smtpPass: (configOverride?.smtpPass || fsConfig?.smtpPass || dynamicConfig.smtpPass || process.env.SMTP_PASS || '').trim(),
    gmailAppPassword: (configOverride?.gmailAppPassword || fsConfig?.gmailAppPassword || dynamicConfig.gmailAppPassword || process.env.GMAIL_APP_PASSWORD || '').trim()
  };

  return merged;
}

/**
 * Base SVB HTML Email Template
 */
function renderSvbEmailTemplate(title: string, subtitle: string, bodyContent: string, actionButton?: { text: string; url: string }): string {
  const appUrl = process.env.APP_URL || 'https://www.svb.com';

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
 * Directly executes live external provider APIs:
 * - Brevo API (Sendinblue v3)
 * - Resend API (v1)
 * - SendGrid API (v3)
 * - Nodemailer Gmail / Custom SMTP
 */
export async function sendEmailAsync(payload: EmailPayload, configOverride?: Partial<EmailConfig>): Promise<{ success: boolean; provider?: string; messageId?: string; error?: string }> {
  const { to, subject, html, text, type = 'Transactional Notification' } = payload;
  
  const activeConfig = await resolveActiveConfig(configOverride);

  const senderEmail = (activeConfig.senderEmail || 'siliconvalleybank51@gmail.com').trim();
  const senderName = (activeConfig.senderName || 'Silicon Valley Bank').trim();
  const fullSender = `"${senderName}" <${senderEmail}>`;

  if (!to || !to.includes('@')) {
    const errorMsg = 'Invalid recipient email address';
    recordLog({
      recipient: to || 'unknown',
      subject,
      type,
      provider: 'None',
      status: 'failed',
      error: errorMsg
    });
    return { success: false, error: errorMsg };
  }

  const errors: string[] = [];

  // Determine active provider and credentials
  const targetProvider = activeConfig.provider || 'auto';
  const brevoKey = (activeConfig.brevoApiKey || '').trim();
  const resendKey = (activeConfig.resendApiKey || '').trim();
  const sendgridKey = (activeConfig.sendgridApiKey || '').trim();
  
  const rawGmailPass = (activeConfig.gmailAppPassword || activeConfig.smtpPass || '').trim();
  const activeSmtpPass = rawGmailPass.replace(/[\s-]+/g, ''); // Sanitize whitespace and hyphens
  const smtpHost = (activeConfig.smtpHost || 'smtp.gmail.com').trim();
  const smtpPort = Number(activeConfig.smtpPort) || 587;
  const smtpUser = (activeConfig.smtpUser || senderEmail).trim();

  console.log(`[EmailService] ─── Outbound Dispatch Initiated ───`);
  console.log(`[EmailService] Recipient: "${to}" | Subject: "${subject}" | Type: "${type}"`);
  console.log(`[EmailService] Active Provider Mode: "${targetProvider}" | Sender: ${fullSender}`);
  console.log(`[EmailService] Available Keys: Brevo=${!!brevoKey}, Resend=${!!resendKey}, SendGrid=${!!sendgridKey}, Gmail/SMTP AuthUser="${smtpUser}", PassLength=${activeSmtpPass ? activeSmtpPass.length : 0}`);

  // 1. Try Brevo (Sendinblue) API
  if ((targetProvider === 'auto' || targetProvider === 'brevo') && brevoKey) {
    try {
      console.log(`[EmailService:Brevo] Dispatching email via Brevo v3 API...`);
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text || subject
        })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const messageId = data?.messageId || data?.messageIds?.[0] || `brevo-${Date.now()}`;
        console.log(`[EmailService:Brevo] Successfully delivered email to ${to} (${messageId})`);
        recordLog({
          recipient: to,
          subject,
          type,
          provider: 'Brevo API',
          status: 'delivered',
          messageId
        });
        return { success: true, provider: 'Brevo API', messageId };
      } else {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message || errJson?.code || await res.text().catch(() => 'Unknown Brevo API error');
        const errDetail = `Brevo API HTTP ${res.status}: ${errMsg}`;
        console.warn(`[EmailService:Brevo] Delivery failed:`, errDetail);
        errors.push(errDetail);
      }
    } catch (err: any) {
      const errDetail = `Brevo connection error: ${err.message}`;
      console.warn(`[EmailService:Brevo] Exception:`, errDetail);
      errors.push(errDetail);
    }
  }

  // 2. Try Resend API (Free Tier: 3,000 emails/mo, 100/day)
  if ((targetProvider === 'auto' || targetProvider === 'resend') && resendKey) {
    try {
      console.log(`[EmailService:Resend] Dispatching email via Resend v1 API...`);
      let fromAddress = `${senderName} <${senderEmail}>`;
      
      let res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject,
          html,
          text: text || subject
        })
      });

      // If failed with 403 (domain not verified on Resend free tier), retry with Resend free developer sender
      if (!res.ok && res.status === 403 && !senderEmail.endsWith('@resend.dev')) {
        console.log('[EmailService:Resend] Custom sender not verified on Resend free tier. Retrying with free developer sender <onboarding@resend.dev>...');
        fromAddress = `${senderName} <onboarding@resend.dev>`;
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [to],
            subject,
            html,
            text: text || subject
          })
        });
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const messageId = data?.id || `resend-${Date.now()}`;
        console.log(`[EmailService:Resend] Successfully delivered email to ${to} (${messageId}) via ${fromAddress}`);
        recordLog({
          recipient: to,
          subject,
          type,
          provider: 'Resend API (Free Tier)',
          status: 'delivered',
          messageId
        });
        return { success: true, provider: 'Resend API (Free Tier)', messageId };
      } else {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message || await res.text().catch(() => 'Unknown Resend API error');
        const errDetail = `Resend API HTTP ${res.status}: ${errMsg}`;
        console.warn(`[EmailService:Resend] Delivery failed:`, errDetail);
        errors.push(errDetail);
      }
    } catch (err: any) {
      const errDetail = `Resend connection error: ${err.message}`;
      console.warn(`[EmailService:Resend] Exception:`, errDetail);
      errors.push(errDetail);
    }
  }

  // 3. Try SendGrid API
  if ((targetProvider === 'auto' || targetProvider === 'sendgrid') && sendgridKey) {
    try {
      console.log(`[EmailService:SendGrid] Dispatching email via SendGrid v3 API...`);
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: senderEmail, name: senderName },
          subject,
          content: [
            { type: 'text/html', value: html },
            { type: 'text/plain', value: text || subject }
          ]
        })
      });

      if (res.status >= 200 && res.status < 300) {
        const messageId = res.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
        console.log(`[EmailService:SendGrid] Successfully delivered email to ${to} (${messageId})`);
        recordLog({
          recipient: to,
          subject,
          type,
          provider: 'SendGrid API',
          status: 'delivered',
          messageId
        });
        return { success: true, provider: 'SendGrid API', messageId };
      } else {
        const errMsg = await res.text().catch(() => 'Unknown SendGrid error');
        const errDetail = `SendGrid HTTP ${res.status}: ${errMsg}`;
        console.warn(`[EmailService:SendGrid] Delivery failed:`, errDetail);
        errors.push(errDetail);
      }
    } catch (err: any) {
      const errDetail = `SendGrid connection error: ${err.message}`;
      console.warn(`[EmailService:SendGrid] Exception:`, errDetail);
      errors.push(errDetail);
    }
  }

  // 4. Try Gmail App Password / Nodemailer SMTP
  const hasGmailAppPass = !!activeSmtpPass;
  const hasCustomSmtp = !!(smtpHost && activeSmtpPass);

  if ((targetProvider === 'auto' || targetProvider === 'gmail_smtp' || targetProvider === 'custom_smtp') && (hasGmailAppPass || hasCustomSmtp)) {
    const providerLabel = (targetProvider === 'gmail_smtp' || hasGmailAppPass) ? 'Gmail SMTP' : 'Custom SMTP';
    const authUser = (smtpUser || senderEmail).trim();
    
    let smtpSuccess = false;
    let lastSmtpError = '';

    const transporterConfigs = [];

    if (targetProvider === 'gmail_smtp' || authUser.includes('@gmail.com') || senderEmail.includes('@gmail.com')) {
      // 1. Primary: Direct standard Port 587 with STARTTLS (recommended for Gmail SMTP)
      transporterConfigs.push({
        name: 'Gmail SMTP Port 587 (STARTTLS)',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: authUser, pass: activeSmtpPass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: false }
      });
      // 2. Secondary: Direct Nodemailer service preset
      transporterConfigs.push({
        name: 'Gmail Service Transporter',
        service: 'gmail',
        auth: { user: authUser, pass: activeSmtpPass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });
      // 3. Fallback: Port 465 with direct SSL
      transporterConfigs.push({
        name: 'Gmail SSL Port 465',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: authUser, pass: activeSmtpPass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: false }
      });
    } else {
      // Custom SMTP configuration
      transporterConfigs.push({
        name: `Custom SMTP (${smtpHost}:${smtpPort})`,
        host: smtpHost || 'smtp.gmail.com',
        port: smtpPort || 587,
        secure: smtpPort === 465,
        auth: { user: authUser, pass: activeSmtpPass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: false }
      });
    }

    for (const tConfig of transporterConfigs) {
      try {
        console.log(`[EmailService:${providerLabel}] Initializing transport via "${tConfig.name}" (AuthUser: "${authUser}", PassLength: ${activeSmtpPass.length})...`);
        const transporter = nodemailer.createTransport(tConfig);
        
        const info = await transporter.sendMail({
          from: fullSender,
          to,
          subject,
          html,
          text: text || subject
        });

        const messageId = info.messageId || `smtp-${Date.now()}`;
        console.log(`[EmailService:${providerLabel}] Successfully dispatched email to ${to} (${messageId}) using ${tConfig.name}`);
        recordLog({
          recipient: to,
          subject,
          type,
          provider: providerLabel,
          status: 'delivered',
          messageId
        });
        smtpSuccess = true;
        return { success: true, provider: providerLabel, messageId };
      } catch (err: any) {
        lastSmtpError = err.message || 'Unknown SMTP error';
        console.error(`[EmailService:Nodemailer Error] Attempt with ${tConfig.name} failed:`, {
          message: err.message,
          code: err.code,
          response: err.response,
          responseCode: err.responseCode,
          command: err.command
        });
        if (lastSmtpError.includes('535') || lastSmtpError.includes('BadCredentials') || lastSmtpError.includes('Username and Password not accepted') || (err as any)?.responseCode === 535) {
          lastSmtpError = `Gmail SMTP Authentication Failed (535 Bad Credentials). Google rejected the App Password for '${authUser}' (password length: ${activeSmtpPass.length} chars). Please verify that 2-Step Verification is active on '${authUser}' and generate a fresh 16-character App Password at https://myaccount.google.com/apppasswords.`;
          break; // Stop cycling other ports if Google rejected the password
        }
      }
    }

    if (!smtpSuccess) {
      const errDetail = `SMTP Authentication / Delivery error: ${lastSmtpError}`;
      errors.push(errDetail);
    }
  } else if (targetProvider === 'gmail_smtp' || targetProvider === 'custom_smtp') {
    const noPassMsg = `Cannot dispatch via ${targetProvider}: No App Password or SMTP password found. Please enter your 16-character Google App Password in the Email Service settings.`;
    console.error(`[EmailService] ${noPassMsg}`);
    errors.push(noPassMsg);
  }

  // If no credentials were configured or all providers returned errors
  const finalError = errors.length > 0
    ? `Live delivery failed: ${errors.join(' | ')}`
    : 'No active email provider credentials configured. Please enter your 16-character Gmail App Password or API Key in Email Service settings.';

  console.error(`[EmailService] ─── Final Delivery Failure for ${to} ───`);
  console.error(`[EmailService] Error Detail: ${finalError}`);

  recordLog({
    recipient: to,
    subject,
    type,
    provider: (targetProvider !== 'auto' && targetProvider !== 'gmail_smtp') ? targetProvider : 'Gmail SMTP',
    status: 'failed',
    error: finalError
  });

  return {
    success: false,
    provider: targetProvider !== 'auto' ? targetProvider : 'Gmail SMTP',
    error: finalError
  };
}

function recordLog(log: Omit<EmailDeliveryLog, 'id' | 'timestamp'>) {
  const newEntry: EmailDeliveryLog = {
    id: `emlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...log
  };
  deliveryLogs.unshift(newEntry);
  if (deliveryLogs.length > 100) {
    deliveryLogs.pop();
  }
  try {
    syncEmailLogToFirestore(newEntry).catch(e => console.warn('syncEmailLogToFirestore failed:', e));
  } catch (e) {}
}

/**
 * High-Level Banking Event Notification Functions
 * All functions are non-blocking and bulletproof (will never throw)
 */
export const emailService = {
  /**
   * Configure Runtime Email Credentials
   */
  configure(config: Partial<EmailConfig>): EmailConfig {
    dynamicConfig = {
      ...dynamicConfig,
      ...config,
      updatedAt: new Date().toISOString()
    };
    return dynamicConfig;
  },

  /**
   * Get Active Runtime Configuration
   */
  getConfig(): EmailConfig {
    return dynamicConfig;
  },

  /**
   * Get Recent Email Delivery Audit Logs
   */
  getDeliveryLogs(): EmailDeliveryLog[] {
    return deliveryLogs;
  },

  /**
   * 1. Account Creation / Welcome Email
   */
  async sendWelcomeEmail(user: UserEmailData, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: user.email,
        subject: 'Welcome to Silicon Valley Bank — Account Details & Access',
        html,
        type: 'Account Welcome'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendWelcomeEmail:', err.message);
    }
  },

  /**
   * 2. Deposit Submitted / Under Review
   */
  async sendDepositSubmittedEmail(data: TransactionEmailData, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Notification: Deposit Received (${formattedAmount}) - Ref #${data.reference}`,
        html,
        type: 'Deposit Pending'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendDepositSubmittedEmail:', err.message);
    }
  },

  /**
   * 3. Deposit Approved & Available Balance Credited
   */
  async sendDepositApprovedEmail(data: TransactionEmailData, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Settlement Advice: Deposit Cleared (+${formattedAmount}) - Ref #${data.reference}`,
        html,
        type: 'Deposit Approved'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendDepositApprovedEmail:', err.message);
    }
  },

  /**
   * 4. Transaction / Deposit Rejected & Refunded
   */
  async sendTransactionRejectedEmail(data: TransactionEmailData, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Notice: Transaction Rejected (${formattedAmount}) - Ref #${data.reference}`,
        html,
        type: 'Transaction Rejected'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendTransactionRejectedEmail:', err.message);
    }
  },

  /**
   * 5. Wire / Transfer Sent (Debit Advice)
   */
  async sendTransferDebitEmail(data: TransactionEmailData, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: data.userEmail,
        subject: `SVB Debit Advice: Outbound Wire (-${formattedAmount}) - Ref #${data.reference}`,
        html,
        type: 'Wire Debit'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendTransferDebitEmail:', err.message);
    }
  },

  /**
   * 6. Security Alert / Code Generation / Password Reset
   */
  async sendSecurityAlertEmail(userEmail: string, title: string, message: string, code?: string, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: userEmail,
        subject: `SVB Security Alert: ${title}`,
        html,
        type: 'Security Alert'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendSecurityAlertEmail:', err.message);
    }
  },

  /**
   * 7. Custom Direct Notice from Admin to User
   */
  async sendCustomAdminNoticeEmail(userEmail: string, adminEmail: string, title: string, message: string, configOverride?: Partial<EmailConfig>): Promise<any> {
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

      return await sendEmailAsync({
        to: userEmail,
        subject: `SVB Notice: ${title}`,
        html,
        type: 'Admin Operations Notice'
      }, configOverride);
    } catch (err: any) {
      console.error('[EmailService] Error in sendCustomAdminNoticeEmail:', err.message);
    }
  }
};
