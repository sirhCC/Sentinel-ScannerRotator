import { describe, it, expect, beforeEach } from 'vitest';
import { scanPath } from '../src/scanner';
import fs from 'fs/promises';
import path from 'path';

describe('env and docker scanners', () => {
  const tmpDir = path.join(process.cwd(), '.sentinel_tmp', 'env-docker');

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
  });

  it('detects sensitive values in .env files', async () => {
    const envPath = path.join(tmpDir, '.env');
    await fs.writeFile(envPath, 'API_KEY=AKIAABCDEFGHIJKLMNOP\nPASSWORD=supersecretvalue');
    const results = await scanPath(tmpDir);
    expect(results.length).toBeGreaterThan(0);
  });

  it('detects sensitive values in Dockerfile ENV/ARG', async () => {
    const dockerPath = path.join(tmpDir, 'Dockerfile');
    await fs.writeFile(
      dockerPath,
      'FROM alpine\nENV SECRET_TOKEN=myreallylongsecrettoken\nARG ACCESS_KEY=AKIAABCDEFGHIJKLMNOP',
    );
    const results = await scanPath(tmpDir);
    expect(results.length).toBeGreaterThan(0);
  });
});
