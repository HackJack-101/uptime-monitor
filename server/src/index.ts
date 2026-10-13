import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { config } from './config.js';
import { resolveMasterSecret } from './crypto.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { secret, generated } = resolveMasterSecret(config.appSecret, config.dataDir);

const { app } = await buildApp({
  databasePath: config.databasePath,
  masterSecret: secret,
  logger: {
    level: config.logLevel,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  },
  staticDir: config.staticDir || path.resolve(here, '../../web/dist'),
  bootstrap: config.bootstrap,
});

if (generated) {
  app.log.warn(`APP_SECRET not set: generated an encryption key in ${path.join(config.dataDir, 'secret.key')}. Back it up — without it, stored secrets cannot be decrypted.`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

await app.listen({ host: config.host, port: config.port });
