import net from 'node:net';
import { elapsed, errorMessage, type Checker } from './types.js';

export function tcpConnect(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      const ms = elapsed(start);
      socket.destroy();
      resolve(ms);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out after ${timeoutMs} ms`));
    });
    socket.once('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

export const tcpChecker: Checker = async ({ config, timeoutMs }) => {
  try {
    const latencyMs = await tcpConnect(String(config.host), Number(config.port), timeoutMs);
    return { ok: true, latencyMs, message: `Port ${config.port} open` };
  } catch (err) {
    return { ok: false, latencyMs: null, message: errorMessage(err) };
  }
};
