// server/services/notifications.js
// Handles email + WhatsApp (stubbed for Twilio) notifications.
// Config via environment variables:
//   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM  (for WhatsApp)

const nodemailer = require('nodemailer');

// ── Email ─────────────────────────────────────────────────────────────────────

let _transport = null;

function getTransport() {
  if (_transport) return _transport;
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) return null;
  _transport = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return _transport;
}

async function sendEmail(to, subject, text) {
  const transport = getTransport();
  if (!transport) {
    console.warn(`[Email] Not configured — would send to ${to}: ${subject}`);
    return { ok: false, reason: 'not_configured' };
  }
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ── WhatsApp (Twilio stub) ────────────────────────────────────────────────────
// To activate: npm install twilio in the server directory and set env vars.

async function sendWhatsApp(to, text) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+14155238886'

  if (!sid || !token || !from) {
    console.warn(`[WhatsApp] Not configured — would send to ${to}: ${text}`);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // Uncomment once `npm install twilio` is run:
    // const twilio = require('twilio');
    // const client = twilio(sid, token);
    // await client.messages.create({ from, to: `whatsapp:${to}`, body: text });
    console.log(`[WhatsApp] Stub — would send to ${to}: ${text}`);
    return { ok: true, reason: 'stub' };
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function buildMessage({ patientName, title, reminderDate, occurrenceDate, reminderKind, offsetValue, offsetUnit, notes }) {
  const dateStr  = new Date(occurrenceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const remStr   = new Date(reminderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  let timing = '';
  if (reminderKind === 'event_day' || reminderKind === 'same_day') timing = `today (${dateStr})`;
  else if (reminderKind === 'before') timing = `${offsetValue} ${offsetUnit} before — ${dateStr}`;
  else if (reminderKind === 'after')  timing = `${offsetValue} ${offsetUnit} after — ${dateStr}`;

  let body = `Reminder for ${patientName}: ${title} — ${timing}.`;
  if (notes) body += `\n\nNote: ${notes}`;
  return body;
}

async function sendNotification(channel, { to, patientName, title, reminderDate, occurrenceDate, reminderKind, offsetValue, offsetUnit, notes }) {
  const text    = buildMessage({ patientName, title, reminderDate, occurrenceDate, reminderKind, offsetValue, offsetUnit, notes });
  const subject = `StrongFlow Reminder: ${title} — ${patientName}`;

  if (channel === 'email')     return sendEmail(to, subject, text);
  if (channel === 'whatsapp')  return sendWhatsApp(to, text);
  return { ok: false, reason: 'unknown_channel' };
}

module.exports = { sendNotification };
