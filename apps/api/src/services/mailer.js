import { translate } from '@personalitify/localization';
import { getConfig } from '../config/env.js';
import { logger } from '../core/logger.js';

/**
 * Outgoing email.
 *
 * - With SMTP settings: messages are sent through nodemailer.
 * - Without them (the default for local development): messages are written to the API log,
 *   including their action link, so flows such as email verification can be completed by hand.
 * - In tests: messages are collected in memory and can be inspected with `sentMessages`.
 */
const memoryOutbox = [];
let smtpTransport;

async function deliver(message) {
  const config = getConfig();

  if (config.isTest) {
    memoryOutbox.push(message);
    return;
  }

  if (!config.mail.host) {
    logger.info(
      { to: message.to, subject: message.subject, actionUrl: message.actionUrl },
      'Email not sent (SMTP is not configured); showing it here instead',
    );
    return;
  }

  if (!smtpTransport) {
    const { createTransport } = await import('nodemailer');
    smtpTransport = createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    });
  }
  await smtpTransport.sendMail({
    from: config.mail.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

function compose({ language, name, template, actionUrl, expiryParams, extraLines = [] }) {
  const t = (key, params) => translate(language, `emails:${key}`, params);
  const lines = [t('greeting', { name }), '', t(`${template}.intro`)];
  if (actionUrl) {
    lines.push(
      '',
      `${t(`${template}.action`)}: ${actionUrl}`,
      '',
      t(`${template}.expiry`, expiryParams),
    );
  }
  lines.push(...extraLines.map((key) => t(key)), '', t('signature'));
  return { subject: t(`${template}.subject`), text: lines.join('\n') };
}

async function send(to, content, actionUrl) {
  try {
    await deliver({ to, ...content, actionUrl: actionUrl ?? null });
  } catch (error) {
    // Email is best effort: the caller's operation has already succeeded.
    logger.error({ err: error, to, subject: content.subject }, 'Failed to send email');
  }
}

export async function sendVerificationEmail({ to, name, language, token, hours }) {
  const actionUrl = `${getConfig().publicWebUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const content = compose({
    language,
    name,
    template: 'verifyEmail',
    actionUrl,
    expiryParams: { hours },
    extraLines: ['ignore'],
  });
  await send(to, content, actionUrl);
}

export async function sendPasswordResetEmail({ to, name, language, token, minutes }) {
  const actionUrl = `${getConfig().publicWebUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const content = compose({
    language,
    name,
    template: 'resetPassword',
    actionUrl,
    expiryParams: { minutes },
    extraLines: ['ignore'],
  });
  await send(to, content, actionUrl);
}

export async function sendPasswordChangedEmail({ to, name, language }) {
  const content = compose({
    language,
    name,
    template: 'passwordChanged',
    extraLines: ['passwordChanged.warning'],
  });
  await send(to, content);
}

/** Test helper: messages captured since the last `clearSentMessages()`. */
export function sentMessages() {
  return [...memoryOutbox];
}

export function clearSentMessages() {
  memoryOutbox.length = 0;
}
