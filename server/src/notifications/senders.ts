import nodemailer, { type Transporter } from 'nodemailer';
import { config, smtpConfigured } from '../config.js';

export type EventKind = 'down' | 'up' | 'degraded' | 'cert_expiring' | 'test';

export interface NotificationMessage {
  event: EventKind;
  title: string;
  text: string;
  monitor?: { id: number; name: string; type: string; status: string };
  project: { id: number; name: string };
  url?: string;
  timestamp: string;
}

export interface ChannelInstance {
  type: string;
  config: Record<string, any>;
  secrets: Record<string, string>;
}

const COLORS: Record<EventKind, number> = {
  down: 0xef4444,
  up: 0x22c55e,
  degraded: 0xf59e0b,
  cert_expiring: 0xf59e0b,
  test: 0x6366f1,
};

const EMOJI: Record<EventKind, string> = {
  down: '🔴',
  up: '🟢',
  degraded: '🟠',
  cert_expiring: '🔐',
  test: '🔔',
};

const TIMEOUT_MS = 10_000;

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}

let transporter: Transporter | undefined;
function mailer(): Transporter {
  if (!smtpConfigured()) throw new Error('SMTP is not configured (set SMTP_HOST and SMTP_FROM)');
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  return transporter;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const senders: Record<string, (c: ChannelInstance, m: NotificationMessage) => Promise<void>> = {
  async email({ config: c }, m) {
    const color = `#${COLORS[m.event].toString(16).padStart(6, '0')}`;
    await mailer().sendMail({
      from: config.smtp.from,
      to: splitList(String(c.to)),
      subject: `${EMOJI[m.event]} ${m.title}`,
      text: `${m.text}${m.url ? `\n\n${m.url}` : ''}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
        <div style="border-left:4px solid ${color};padding:12px 16px;background:#f8fafc;border-radius:8px">
          <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(m.title)}</h2>
          <p style="margin:0;white-space:pre-line;color:#334155">${escapeHtml(m.text)}</p>
          ${m.url ? `<p style="margin:12px 0 0"><a href="${escapeHtml(m.url)}">Open in Uptime Monitor</a></p>` : ''}
        </div></div>`,
    });
  },
  async discord({ config: c, secrets }, m) {
    await post(secrets.webhookUrl!, {
      username: c.username || 'Uptime Monitor',
      embeds: [
        {
          title: `${EMOJI[m.event]} ${m.title}`,
          description: m.text,
          url: m.url,
          color: COLORS[m.event],
          timestamp: m.timestamp,
          footer: { text: m.project.name },
        },
      ],
    });
  },
  async slack({ secrets }, m) {
    await post(secrets.webhookUrl!, {
      text: `${EMOJI[m.event]} *${m.title}*\n${m.text}${m.url ? `\n<${m.url}|Open>` : ''}`,
    });
  },
  async telegram({ config: c, secrets }, m) {
    const text = `${EMOJI[m.event]} <b>${escapeHtml(m.title)}</b>\n${escapeHtml(m.text)}${m.url ? `\n<a href="${escapeHtml(m.url)}">Open</a>` : ''}`;
    await post(`https://api.telegram.org/bot${encodeURIComponent(secrets.botToken!)}/sendMessage`, {
      chat_id: c.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  },
  async signal({ config: c }, m) {
    await post(`${String(c.apiUrl).replace(/\/$/, '')}/v2/send`, {
      number: c.number,
      recipients: splitList(String(c.recipients)),
      message: `${EMOJI[m.event]} ${m.title}\n${m.text}${m.url ? `\n${m.url}` : ''}`,
    });
  },
  async ntfy({ config: c, secrets }, m) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secrets.token) headers.authorization = `Bearer ${secrets.token}`;
    await post(
      String(c.serverUrl).replace(/\/$/, ''),
      {
        topic: c.topic,
        title: m.title,
        message: m.text,
        priority: m.event === 'down' ? 5 : 3,
        tags: [m.event === 'down' ? 'rotating_light' : m.event === 'up' ? 'white_check_mark' : 'warning'],
        click: m.url,
      },
      headers,
    );
  },
  async gotify({ config: c, secrets }, m) {
    await post(
      `${String(c.serverUrl).replace(/\/$/, '')}/message`,
      { title: m.title, message: m.text, priority: m.event === 'down' ? 8 : 4 },
      { 'x-gotify-key': secrets.appToken! },
    );
  },
  async webhook({ config: c, secrets }, m) {
    await post(String(c.url), m, secrets.authHeader ? { authorization: secrets.authHeader } : {});
  },
};

export async function sendNotification(channel: ChannelInstance, message: NotificationMessage): Promise<void> {
  const sender = senders[channel.type];
  if (!sender) throw new Error(`Unsupported channel type: ${channel.type}`);
  await sender(channel, message);
}
