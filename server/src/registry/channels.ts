import type { TypeDef } from './fields.js';

export const channelTypes: TypeDef[] = [
  {
    type: 'email',
    label: 'Email',
    description: 'Send an email through the SMTP server configured with environment variables.',
    fields: [
      { key: 'to', label: 'Recipients', kind: 'text', required: true, placeholder: 'ops@example.com, me@example.com' },
    ],
  },
  {
    type: 'discord',
    label: 'Discord',
    description: 'Post to a Discord channel with an incoming webhook.',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', kind: 'secret', required: true, help: 'Channel settings → Integrations → Webhooks.' },
      { key: 'username', label: 'Bot display name', kind: 'text', placeholder: 'Uptime Monitor' },
    ],
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Post to Slack with an incoming webhook.',
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', kind: 'secret', required: true }],
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: 'Send a message with a Telegram bot (free).',
    fields: [
      { key: 'botToken', label: 'Bot token', kind: 'secret', required: true, help: 'Create a bot with @BotFather.' },
      { key: 'chatId', label: 'Chat ID', kind: 'text', required: true },
    ],
  },
  {
    type: 'signal',
    label: 'Signal',
    description: 'Send a Signal message through a self-hosted signal-cli-rest-api instance (free).',
    fields: [
      { key: 'apiUrl', label: 'signal-cli-rest-api URL', kind: 'url', required: true, placeholder: 'http://signal-api:8080' },
      { key: 'number', label: 'Sender number', kind: 'text', required: true, placeholder: '+33600000000' },
      { key: 'recipients', label: 'Recipients', kind: 'text', required: true, placeholder: '+33611111111, group.xxxx' },
    ],
  },
  {
    type: 'ntfy',
    label: 'ntfy',
    description: 'Push notifications to your phone with ntfy.sh or a self-hosted ntfy server.',
    fields: [
      { key: 'serverUrl', label: 'Server URL', kind: 'url', default: 'https://ntfy.sh', required: true },
      { key: 'topic', label: 'Topic', kind: 'text', required: true },
      { key: 'token', label: 'Access token', kind: 'secret', help: 'Optional, for protected topics.' },
    ],
  },
  {
    type: 'gotify',
    label: 'Gotify',
    description: 'Push to a self-hosted Gotify server.',
    fields: [
      { key: 'serverUrl', label: 'Server URL', kind: 'url', required: true },
      { key: 'appToken', label: 'Application token', kind: 'secret', required: true },
    ],
  },
  {
    type: 'webhook',
    label: 'Generic webhook',
    description: 'POST a JSON payload to any URL.',
    fields: [
      { key: 'url', label: 'URL', kind: 'url', required: true },
      { key: 'authHeader', label: 'Authorization header value', kind: 'secret', help: 'Optional, sent as the Authorization header.' },
    ],
  },
];

export function getChannelType(type: string): TypeDef | undefined {
  return channelTypes.find((t) => t.type === type);
}
