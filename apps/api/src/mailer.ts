import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST || 'localhost';
const smtpPort = parseInt(process.env.SMTP_PORT || '1025', 10);
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const mailFrom = process.env.MAIL_FROM || 'noreply@campuschat.local';

export const mailer = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
});

export async function sendOtpEmail(to: string, otp: string) {
  await mailer.sendMail({
    from: mailFrom,
    to, // Note: We only send to the actual email, but it won't be logged by Pino unless we specifically log it.
    subject: 'Your Login Code',
    text: `Your one-time login code is: ${otp}\nThis code expires in 10 minutes.`,
  });
}
