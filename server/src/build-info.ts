import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function packageVersion(): string {
  try {
    return (JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

/** Commit SHA baked into the image by CI (GIT_COMMIT), or read from git in local development. */
function commitSha(): string | null {
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) return /^[0-9a-f]{7,40}$/i.test(fromEnv) ? fromEnv.toLowerCase() : null;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim();
  } catch {
    return null;
  }
}

const sha = commitSha();
const sourceUrl = (process.env.SOURCE_URL ?? '').replace(/\/$/, '');

export const buildInfo = {
  /** Release tag (e.g. v1.2.0) when built from a tag, otherwise the package version. */
  version: (process.env.APP_VERSION || packageVersion()).replace(/^v/, ''),
  commit: sha,
  shortCommit: sha ? sha.slice(0, 7) : null,
  commitUrl: sha && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(sourceUrl) ? `${sourceUrl}/commit/${sha}` : null,
};
