import crypto from 'node:crypto';

/** Official OVHcloud API endpoints. */
export const OVH_ENDPOINTS = {
  'ovh-eu': { label: 'OVHcloud Europe', url: 'https://eu.api.ovh.com/1.0' },
  'ovh-ca': { label: 'OVHcloud Canada', url: 'https://ca.api.ovh.com/1.0' },
  'ovh-us': { label: 'OVHcloud US', url: 'https://api.us.ovhcloud.com/1.0' },
} as const;

export type OvhEndpoint = keyof typeof OVH_ENDPOINTS;

export interface OvhCredentials {
  endpoint: OvhEndpoint;
  applicationKey: string;
  applicationSecret: string;
  consumerKey: string;
}

export interface OvhRecord {
  id: number;
  subDomain: string;
  fieldType: string;
  target: string;
  ttl: number;
}

export class OvhError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
/** Record types that can point a hostname at a web service. */
export const HOST_RECORD_TYPES = ['A', 'AAAA', 'CNAME'] as const;

/**
 * Minimal signed client for the OVHcloud API (read-only calls only).
 * Signature: "$1$" + SHA1(AS + "+" + CK + "+" + METHOD + "+" + URL + "+" + BODY + "+" + TIMESTAMP)
 */
export class OvhClient {
  private readonly baseUrl: string;
  private timeDelta: number | undefined;

  constructor(
    private readonly creds: OvhCredentials,
    baseUrlOverride?: string,
  ) {
    this.baseUrl = baseUrlOverride ?? OVH_ENDPOINTS[creds.endpoint].url;
  }

  private async serverTimeDelta(): Promise<number> {
    if (this.timeDelta !== undefined) return this.timeDelta;
    try {
      const res = await fetch(`${this.baseUrl}/auth/time`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const serverTime = Number(await res.text());
      this.timeDelta = Number.isFinite(serverTime) ? serverTime - Math.floor(Date.now() / 1000) : 0;
    } catch {
      this.timeDelta = 0;
    }
    return this.timeDelta;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timestamp = String(Math.floor(Date.now() / 1000) + (await this.serverTimeDelta()));
    const toSign = [this.creds.applicationSecret, this.creds.consumerKey, 'GET', url, '', timestamp].join('+');
    const signature = `$1$${crypto.createHash('sha1').update(toSign).digest('hex')}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-ovh-application': this.creds.applicationKey,
          'x-ovh-consumer': this.creds.consumerKey,
          'x-ovh-timestamp': timestamp,
          'x-ovh-signature': signature,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (err) {
      throw new OvhError(0, `Cannot reach the OVH API: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new OvhError(res.status, humanize(res.status, body.message));
    }
    return (await res.json()) as T;
  }

  listZones(): Promise<string[]> {
    return this.get<string[]>('/domain/zone');
  }

  /** Fetch every A / AAAA / CNAME record of a zone. */
  async hostRecords(zone: string, concurrency = 8): Promise<OvhRecord[]> {
    const z = encodeURIComponent(zone);
    const ids = (
      await Promise.all(HOST_RECORD_TYPES.map((t) => this.get<number[]>(`/domain/zone/${z}/record?fieldType=${t}`)))
    ).flat();
    const records: OvhRecord[] = [];
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++]!;
        const r = await this.get<OvhRecord>(`/domain/zone/${z}/record/${id}`);
        records.push({ id: r.id, subDomain: r.subDomain ?? '', fieldType: r.fieldType, target: r.target, ttl: r.ttl });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
    return records.sort((a, b) => a.subDomain.localeCompare(b.subDomain) || a.fieldType.localeCompare(b.fieldType));
  }
}

function humanize(status: number, message?: string): string {
  if (status === 401 || status === 403) {
    if (message && /not been granted/i.test(message)) {
      return 'The consumer key is not allowed to read DNS zones. Create one with GET rights on /domain/zone and /domain/zone/*.';
    }
    return `OVH rejected the credentials${message ? `: ${message}` : ''}`;
  }
  if (status === 404) return message ?? 'Zone not found on this OVH account';
  return `OVH API error ${status}${message ? `: ${message}` : ''}`;
}
