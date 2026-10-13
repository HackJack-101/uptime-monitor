import tls from 'node:tls';
import { daysUntil, elapsed, errorMessage, type Checker, type CheckOutcome } from './types.js';

export const tlsChecker: Checker = ({ config, timeoutMs }) =>
  new Promise<CheckOutcome>((resolve) => {
    const host = String(config.host);
    const start = process.hrtime.bigint();
    const socket = tls.connect({ host, port: Number(config.port ?? 443), servername: host, rejectUnauthorized: false });
    const done = (o: CheckOutcome) => {
      socket.destroy();
      resolve(o);
    };
    socket.setTimeout(timeoutMs, () => done({ ok: false, latencyMs: null, message: `Timed out after ${timeoutMs} ms` }));
    socket.once('error', (err) => done({ ok: false, latencyMs: null, message: errorMessage(err) }));
    socket.once('secureConnect', () => {
      const latencyMs = elapsed(start);
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return done({ ok: false, latencyMs, message: 'No certificate presented' });
      const days = daysUntil(new Date(cert.valid_to));
      if (!socket.authorized) {
        return done({ ok: false, latencyMs, message: `Invalid certificate: ${socket.authorizationError}`, certDaysRemaining: days });
      }
      const threshold = Number(config.certExpiryDays ?? 14);
      if (days < threshold) {
        return done({ ok: false, latencyMs, message: `Certificate expires in ${days} day(s)`, certDaysRemaining: days });
      }
      done({ ok: true, latencyMs, message: `Certificate valid for ${days} day(s)`, certDaysRemaining: days });
    });
  });
