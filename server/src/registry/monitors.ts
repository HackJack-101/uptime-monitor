import type { TypeDef } from './fields.js';

const certExpiry = {
  key: 'certExpiryDays',
  label: 'Certificate expiry warning (days)',
  kind: 'number',
  default: 14,
  min: 0,
  max: 365,
  help: 'Emit a "certificate expiring" event when the TLS certificate expires within this many days. 0 disables it.',
} as const;

export const monitorTypes: TypeDef[] = [
  {
    type: 'http',
    label: 'HTTP(S)',
    description: 'Request a URL and check the response code, optional keyword and authentication.',
    fields: [
      { key: 'url', label: 'URL', kind: 'url', required: true, placeholder: 'https://example.com/health' },
      {
        key: 'method',
        label: 'Method',
        kind: 'select',
        default: 'GET',
        options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => ({ value: m, label: m })),
      },
      {
        key: 'expectedStatus',
        label: 'Accepted status codes',
        kind: 'text',
        default: '200-299',
        placeholder: '200-299,301',
        help: 'Comma-separated codes or ranges.',
      },
      {
        key: 'auth',
        label: 'Authentication',
        kind: 'select',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'basic', label: 'Basic auth' },
          { value: 'bearer', label: 'Bearer token' },
          { value: 'header', label: 'Custom header (API key)' },
        ],
      },
      { key: 'username', label: 'Username', kind: 'text', required: true, showIf: { field: 'auth', in: ['basic'] } },
      { key: 'password', label: 'Password', kind: 'secret', required: true, showIf: { field: 'auth', in: ['basic'] } },
      { key: 'token', label: 'Bearer token', kind: 'secret', required: true, showIf: { field: 'auth', in: ['bearer'] } },
      {
        key: 'headerName',
        label: 'Header name',
        kind: 'text',
        required: true,
        placeholder: 'X-API-Key',
        showIf: { field: 'auth', in: ['header'] },
      },
      { key: 'headerValue', label: 'Header value', kind: 'secret', required: true, showIf: { field: 'auth', in: ['header'] } },
      { key: 'headers', label: 'Extra headers (non-secret)', kind: 'headers' },
      {
        key: 'body',
        label: 'Request body',
        kind: 'textarea',
        showIf: { field: 'method', in: ['POST', 'PUT', 'PATCH', 'DELETE'] },
      },
      {
        key: 'keyword',
        label: 'Keyword',
        kind: 'text',
        help: 'Optional text that must (or must not) appear in the response body.',
      },
      {
        key: 'keywordMode',
        label: 'Keyword mode',
        kind: 'select',
        default: 'contains',
        options: [
          { value: 'contains', label: 'Body must contain keyword' },
          { value: 'not_contains', label: 'Body must NOT contain keyword' },
        ],
      },
      { key: 'followRedirects', label: 'Follow redirects', kind: 'boolean', default: true },
      {
        key: 'ignoreTls',
        label: 'Ignore TLS errors',
        kind: 'boolean',
        default: false,
        help: 'Accept self-signed or expired certificates. Not recommended.',
      },
      certExpiry,
    ],
  },
  {
    type: 'tcp',
    label: 'TCP port',
    description: 'Open a TCP connection to a host and port.',
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true, placeholder: 'db.internal' },
      { key: 'port', label: 'Port', kind: 'number', required: true, min: 1, max: 65535 },
    ],
  },
  {
    type: 'ping',
    label: 'Ping (ICMP)',
    description: 'Classic ICMP echo request.',
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true, placeholder: '192.168.1.10' },
      { key: 'count', label: 'Packets', kind: 'number', default: 1, min: 1, max: 10 },
    ],
  },
  {
    type: 'ssh',
    label: 'SSH',
    description: 'Connect and authenticate over SSH, optionally run a command and check its output.',
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true },
      { key: 'port', label: 'Port', kind: 'number', default: 22, min: 1, max: 65535 },
      { key: 'username', label: 'Username', kind: 'text', required: true },
      {
        key: 'authMethod',
        label: 'Authentication',
        kind: 'select',
        default: 'password',
        options: [
          { value: 'password', label: 'Password' },
          { value: 'key', label: 'Private key' },
          { value: 'none', label: 'None (banner check only)' },
        ],
      },
      { key: 'password', label: 'Password', kind: 'secret', required: true, showIf: { field: 'authMethod', in: ['password'] } },
      {
        key: 'privateKey',
        label: 'Private key (PEM / OpenSSH)',
        kind: 'secret-textarea',
        required: true,
        showIf: { field: 'authMethod', in: ['key'] },
      },
      { key: 'passphrase', label: 'Key passphrase', kind: 'secret', showIf: { field: 'authMethod', in: ['key'] } },
      {
        key: 'hostKeySha256',
        label: 'Host key fingerprint (SHA256)',
        kind: 'text',
        placeholder: 'SHA256:AbC...',
        help: 'Recommended. When set, the connection fails if the server key does not match.',
      },
      {
        key: 'command',
        label: 'Command',
        kind: 'text',
        placeholder: 'systemctl is-active nginx',
        showIf: { field: 'authMethod', in: ['password', 'key'] },
        help: 'Optional. The check fails if the command exits with a non-zero code.',
      },
      {
        key: 'expectedOutput',
        label: 'Expected output contains',
        kind: 'text',
        showIf: { field: 'authMethod', in: ['password', 'key'] },
      },
    ],
  },
  {
    type: 'dns',
    label: 'DNS',
    description: 'Resolve a DNS record and optionally verify its value.',
    fields: [
      { key: 'hostname', label: 'Hostname', kind: 'text', required: true, placeholder: 'example.com' },
      {
        key: 'recordType',
        label: 'Record type',
        kind: 'select',
        default: 'A',
        options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((t) => ({ value: t, label: t })),
      },
      { key: 'resolver', label: 'Resolver IP', kind: 'text', placeholder: '1.1.1.1', help: 'Leave empty to use the system resolver.' },
      { key: 'expectedValue', label: 'Expected value', kind: 'text', help: 'Optional. One of the answers must contain this value.' },
    ],
  },
  {
    type: 'tls',
    label: 'TLS certificate',
    description: 'Check that a TLS endpoint presents a valid certificate that is not about to expire.',
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true, placeholder: 'example.com' },
      { key: 'port', label: 'Port', kind: 'number', default: 443, min: 1, max: 65535 },
      { ...certExpiry, help: 'The check is marked DOWN when the certificate expires within this many days.' },
    ],
  },
];

export function getMonitorType(type: string): TypeDef | undefined {
  return monitorTypes.find((t) => t.type === type);
}
