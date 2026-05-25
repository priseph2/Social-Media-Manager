'use strict';

const logger = require('../utils/logger');

const RESEND_API = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('[TransactionalEmail] RESEND_API_KEY not set — email skipped', { to, subject });
    return { success: false, reason: 'not_configured' };
  }

  const from = process.env.FROM_EMAIL
    ? `${process.env.FROM_NAME || 'AI Social Manager'} <${process.env.FROM_EMAIL}>`
    : 'AI Social Manager <noreply@yourdomain.com>';

  try {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend ${res.status}: ${body}`);
    }
    logger.info('[TransactionalEmail] Sent', { to, subject });
    return { success: true };
  } catch (err) {
    logger.error('[TransactionalEmail] Failed', { to, subject, error: err.message });
    return { success: false, error: err.message };
  }
}

const dashboardUrl = () => process.env.DASHBOARD_URL || 'http://localhost:3001';

function sendWelcomeEmail({ to, tenantName, plan }) {
  return sendEmail({
    to,
    subject: `Welcome to AI Social Manager — you're on the ${plan} plan`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;line-height:1.6">
  <h2 style="color:#4f46e5;margin-bottom:8px">Welcome, ${tenantName}!</h2>
  <p>Your account is set up and ready on the <strong>${plan}</strong> plan.</p>
  <p>Here's what to do next:</p>
  <ol>
    <li>Connect your social accounts in <strong>Settings → Integrations</strong></li>
    <li>Set your brand voice in <strong>Settings → Brand</strong></li>
    <li>Generate your first content in <strong>Content Studio</strong></li>
  </ol>
  <a href="${dashboardUrl()}/dashboard"
     style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">
    Go to dashboard →
  </a>
  <p style="margin-top:32px;font-size:12px;color:#94a3b8">
    You're receiving this because you created an AI Social Manager account.
  </p>
</div>`,
  });
}

function sendBillingConfirmationEmail({ to, tenantName, plan, amountFormatted }) {
  return sendEmail({
    to,
    subject: `Payment confirmed — ${plan} plan`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;line-height:1.6">
  <h2 style="margin-bottom:8px">Payment confirmed</h2>
  <p>Hi ${tenantName}, your payment for the <strong>${plan}</strong> plan has been received.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Plan</td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;text-align:right;text-transform:capitalize">${plan}</td>
    </tr>
    <tr>
      <td style="padding:10px 0;color:#64748b">Amount paid</td>
      <td style="padding:10px 0;font-weight:600;text-align:right">${amountFormatted}</td>
    </tr>
  </table>
  <a href="${dashboardUrl()}/dashboard/settings/billing"
     style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
    View billing →
  </a>
  <p style="margin-top:32px;font-size:12px;color:#94a3b8">
    You're receiving this because you have an active AI Social Manager subscription.
  </p>
</div>`,
  });
}

function sendPlanChangedEmail({ to, tenantName, oldPlan, newPlan }) {
  return sendEmail({
    to,
    subject: `Your plan has been updated to ${newPlan}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;line-height:1.6">
  <h2 style="margin-bottom:8px">Plan updated</h2>
  <p>Hi ${tenantName}, your plan has changed from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.</p>
  <a href="${dashboardUrl()}/dashboard/settings/billing"
     style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
    View billing →
  </a>
  <p style="margin-top:16px;font-size:12px;color:#94a3b8">
    If you didn't request this change, please contact support immediately.
  </p>
</div>`,
  });
}

module.exports = { sendEmail, sendWelcomeEmail, sendBillingConfirmationEmail, sendPlanChangedEmail };
