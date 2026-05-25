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
const appName = () => process.env.FROM_NAME || 'AI Social Manager';

// ── Shared layout wrapper ──────────────────────────────────────────────────────

function emailLayout({ preheader, accentColor = '#4f46e5', body, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Email</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body { margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  .wrapper { width:100%;background:#f1f5f9;padding:32px 16px; }
  .card { max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .header { background:${accentColor};padding:28px 36px; }
  .header-logo { color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.01em; }
  .body { padding:32px 36px; }
  .footer { padding:20px 36px;background:#f8fafc;border-top:1px solid #e2e8f0; }
  h1 { margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3; }
  p { margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6; }
  .badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;text-transform:capitalize; }
  .receipt { width:100%;border-collapse:collapse;margin:20px 0; }
  .receipt td { padding:12px 0;font-size:14px;border-bottom:1px solid #e2e8f0; }
  .receipt tr:last-child td { border-bottom:none; }
  .receipt .label { color:#64748b; }
  .receipt .value { font-weight:600;color:#0f172a;text-align:right; }
  .btn { display:inline-block;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;color:#ffffff !important;background:${accentColor};text-decoration:none;letter-spacing:-0.01em; }
  .steps { padding:0;margin:0 0 20px;list-style:none; }
  .step { display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;font-size:14px;color:#334155; }
  .step-num { flex-shrink:0;width:22px;height:22px;border-radius:50%;background:${accentColor};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center; }
  .footer p { margin:0;font-size:12px;color:#94a3b8;line-height:1.5; }
  .divider { height:1px;background:#e2e8f0;margin:20px 0; }
  @media (max-width:600px) {
    .body { padding:24px 20px; }
    .header { padding:20px 20px; }
    .footer { padding:16px 20px; }
    h1 { font-size:20px; }
  }
</style>
</head>
<body>
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="header-logo">${appName()}</div>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>${footerNote}</p>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">&copy; ${new Date().getFullYear()} ${appName()}. All rights reserved.</p>
</div>
</body>
</html>`;
}

// ── Welcome ───────────────────────────────────────────────────────────────────

function sendWelcomeEmail({ to, tenantName, plan }) {
  const planColors = { starter: '#0891b2', growth: '#4f46e5', agency: '#7c3aed' };
  const accent = planColors[plan?.toLowerCase()] || '#4f46e5';

  const html = emailLayout({
    preheader: `Your ${plan} account is ready — start managing your social media with AI.`,
    accentColor: accent,
    body: `
      <h1>Welcome aboard, ${tenantName}!</h1>
      <p>Your <span class="badge" style="background:${accent}1a;color:${accent};">${plan}</span> account is all set. Here's how to get started:</p>
      <ul class="steps">
        <li class="step">
          <span class="step-num" style="background:${accent};">1</span>
          <span>Connect your social accounts under <strong>Settings → Integrations</strong></span>
        </li>
        <li class="step">
          <span class="step-num" style="background:${accent};">2</span>
          <span>Set your brand voice and colours under <strong>Settings → Brand</strong></span>
        </li>
        <li class="step">
          <span class="step-num" style="background:${accent};">3</span>
          <span>Generate your first post in <strong>Content Studio</strong> and watch the AI go</span>
        </li>
      </ul>
      <a href="${dashboardUrl()}/dashboard" class="btn" style="background:${accent};">Open your dashboard →</a>
    `,
    footerNote: `You're receiving this because you just created an ${appName()} account. Questions? Reply to this email.`,
  });

  return sendEmail({
    to,
    subject: `Welcome to ${appName()} — you're on the ${plan} plan 🎉`,
    html,
  });
}

// ── Billing confirmation ───────────────────────────────────────────────────────

function sendBillingConfirmationEmail({ to, tenantName, plan, amountFormatted }) {
  const html = emailLayout({
    preheader: `Payment of ${amountFormatted} received for the ${plan} plan.`,
    accentColor: '#059669',
    body: `
      <h1>Payment confirmed</h1>
      <p>Hi <strong>${tenantName}</strong>, we've received your payment. Here's your receipt:</p>
      <table class="receipt">
        <tr>
          <td class="label">Product</td>
          <td class="value">${appName()}</td>
        </tr>
        <tr>
          <td class="label">Plan</td>
          <td class="value" style="text-transform:capitalize;">${plan}</td>
        </tr>
        <tr>
          <td class="label">Amount paid</td>
          <td class="value">${amountFormatted}</td>
        </tr>
        <tr>
          <td class="label">Status</td>
          <td class="value"><span class="badge" style="background:#d1fae5;color:#065f46;">Paid</span></td>
        </tr>
      </table>
      <p style="font-size:13px;color:#64748b;">Your subscription is active and all features are available.</p>
      <div class="divider"></div>
      <a href="${dashboardUrl()}/dashboard/settings/billing" class="btn" style="background:#059669;">View billing history →</a>
    `,
    footerNote: `You're receiving this because you have an active ${appName()} subscription. If you didn't make this payment, contact support immediately.`,
  });

  return sendEmail({
    to,
    subject: `Payment confirmed — ${plan} plan`,
    html,
  });
}

// ── Plan changed ───────────────────────────────────────────────────────────────

function sendPlanChangedEmail({ to, tenantName, oldPlan, newPlan }) {
  const isUpgrade = ['starter', 'growth', 'agency'].indexOf(newPlan?.toLowerCase()) >
                    ['starter', 'growth', 'agency'].indexOf(oldPlan?.toLowerCase());
  const accent = isUpgrade ? '#4f46e5' : '#f59e0b';
  const heading = isUpgrade ? `You've been upgraded to ${newPlan}` : `Plan changed to ${newPlan}`;
  const intro = isUpgrade
    ? `Great news, <strong>${tenantName}</strong>! Your plan has been upgraded from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>. You now have access to all the features included in ${newPlan}.`
    : `Hi <strong>${tenantName}</strong>, your plan has been changed from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.`;

  const html = emailLayout({
    preheader: `Your ${appName()} plan has changed from ${oldPlan} to ${newPlan}.`,
    accentColor: accent,
    body: `
      <h1>${heading}</h1>
      <p>${intro}</p>
      <table class="receipt">
        <tr>
          <td class="label">Previous plan</td>
          <td class="value" style="text-transform:capitalize;">${oldPlan}</td>
        </tr>
        <tr>
          <td class="label">New plan</td>
          <td class="value"><span class="badge" style="background:${accent}1a;color:${accent};text-transform:capitalize;">${newPlan}</span></td>
        </tr>
        <tr>
          <td class="label">Effective</td>
          <td class="value">Immediately</td>
        </tr>
      </table>
      <a href="${dashboardUrl()}/dashboard/settings/billing" class="btn" style="background:${accent};">View your plan →</a>
    `,
    footerNote: `You're receiving this because your ${appName()} subscription plan changed. If you didn't request this change, please contact support immediately.`,
  });

  return sendEmail({
    to,
    subject: isUpgrade ? `You've been upgraded to ${newPlan} 🚀` : `Your plan has been updated to ${newPlan}`,
    html,
  });
}

module.exports = { sendEmail, sendWelcomeEmail, sendBillingConfirmationEmail, sendPlanChangedEmail };
