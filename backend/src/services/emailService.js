import config from '../config/env.js';

export async function sendVerificationEmail(email, code) {
  return sendCodeEmail(email, code, 'verification');
}

export async function sendPasswordResetEmail(email, code) {
  return sendCodeEmail(email, code, 'password reset');
}

async function sendCodeEmail(email, code, purpose) {
  if (!config.email.resendApiKey) {
    throw new Error('Email sending is not configured yet. Add RESEND_API_KEY to the backend environment.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${config.email.fromName} <${config.email.fromAddress}>`,
      to: [email],
      subject: `Your Student Opportunity Finder ${purpose} code`,
      text: `Your Student Opportunity Finder ${purpose} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#172033"><h2>${purpose === 'verification' ? 'Verify your email' : 'Reset your password'}</h2><p>Enter this code in Student Opportunity Finder:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#4338ca">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
    }),
  });

  if (!response.ok) {
    console.error(`[email] Resend rejected mail (HTTP ${response.status}).`);
    if (response.status === 403) {
      throw new Error('Resend sending permission denied. Configure a key with sending access to the verified EMAIL_FROM_ADDRESS domain.');
    }
    throw new Error('Could not send the verification email. Check the Resend domain and sender configuration.');
  }
}

export default { sendVerificationEmail, sendPasswordResetEmail };
