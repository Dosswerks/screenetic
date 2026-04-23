/**
 * EmailService — Abstraction for transactional email delivery.
 * Best-effort, non-blocking. Retries up to 3 times with exponential backoff.
 */
import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface EmailResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
}

const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

// Create transporter based on provider
function createTransporter() {
  // For development: use ethereal or console logging
  if (process.env.NODE_ENV !== 'production') {
    return {
      async sendMail(opts: any): Promise<{ messageId: string }> {
        console.log(`[EMAIL] To: ${opts.to} | Subject: ${opts.subject}`);
        console.log(`[EMAIL] Body preview: ${opts.html?.slice(0, 200)}...`);
        return { messageId: `dev-${Date.now()}` };
      },
    };
  }

  // Production: use SMTP (SendGrid, Postmark, SES, etc.)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.EMAIL_API_KEY,
    },
  });
}

const transporter = createTransporter();

async function sendWithRetry(options: EmailOptions, attempt = 0): Promise<EmailResult> {
  try {
    const result = await transporter.sendMail({
      from: `${process.env.EMAIL_FROM_NAME || 'Screenetic'} <${process.env.EMAIL_FROM || 'noreply@screenetic.io'}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return { success: true, messageId: result.messageId, error: null };
  } catch (err: any) {
    if (attempt < RETRY_DELAYS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      return sendWithRetry(options, attempt + 1);
    }
    console.error(`Email delivery failed after ${attempt + 1} attempts:`, err.message);
    return { success: false, messageId: null, error: err.message };
  }
}

// Public API — fire-and-forget (non-blocking)
export function sendEmail(options: EmailOptions): void {
  sendWithRetry(options).catch(err => console.error('Email send error:', err));
}

// Template helpers
export function sendVerificationEmail(to: string, token: string): void {
  const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify?token=${token}`;
  sendEmail({
    to,
    subject: 'Verify your Screenetic account',
    html: `<p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export function sendPasswordResetEmail(to: string, token: string): void {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset?token=${token}`;
  sendEmail({
    to,
    subject: 'Reset your Screenetic password',
    html: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
  });
}

export function sendAccountDeletedEmail(to: string): void {
  sendEmail({
    to,
    subject: 'Your Screenetic account has been deleted',
    html: `<p>Your Screenetic account and all associated data have been permanently deleted.</p>`,
  });
}
