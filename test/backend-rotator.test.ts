import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('backend rotator (file provider)', () => {
  it('stores secret in file backend and replaces with ref', async () => {
    // isolate tmp dirs and backend output
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    const backendFile = path.join(process.cwd(), `.sentinel_secrets_${Date.now()}.json`);
    process.env.SENTINEL_BACKEND = 'file';
    process.env.SENTINEL_BACKEND_FILE = backendFile;

    const f = 'tmp-backend.txt';
    fs.writeFileSync(f, 'before AKIAABCDEFGHIJKLMNOP after');
    const { backendRotator } = await import('../src/rotators/backendRotator');
    const res = await backendRotator.rotate(
      { filePath: f, line: 1, column: 8, match: 'AKIAABCDEFGHIJKLMNOP' } as any,
      {},
    );
    expect(res.success).toBe(true);
    const txt = fs.readFileSync(f, 'utf8');
    expect(txt).toMatch(/secretref:\/\/file\//);
    const map = JSON.parse(fs.readFileSync(backendFile, 'utf8'));
    const values = Object.values(map as any);
    expect(values).toContain('AKIAABCDEFGHIJKLMNOP');

    // cleanup
    try {
      fs.rmSync(uniqueTmp, { recursive: true, force: true });
    } catch {}
    try {
      fs.unlinkSync(f);
    } catch {}
    try {
      fs.unlinkSync(backendFile);
    } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    delete process.env.SENTINEL_BACKEND;
    delete process.env.SENTINEL_BACKEND_FILE;
  });

  it('verify mode reads back stored secret (file backend)', async () => {
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    const backendFile = path.join(process.cwd(), `.sentinel_secrets_${Date.now()}.json`);
    process.env.SENTINEL_BACKEND = 'file';
    process.env.SENTINEL_BACKEND_FILE = backendFile;
    const f = 'tmp-backend-verify.txt';
    fs.writeFileSync(f, 'abc AKIAABCDEFGHIJKLMNOP def');
    const { backendRotator } = await import('../src/rotators/backendRotator');
    const res = await backendRotator.rotate(
      { filePath: f, line: 1, column: 5, match: 'AKIAABCDEFGHIJKLMNOP' } as any,
      { verify: true },
    );
    expect(res.success).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toMatch(/secretref:\/\/file\//);
    const map = JSON.parse(fs.readFileSync(backendFile, 'utf8'));
    const values = Object.values(map as any);
    expect(values).toContain('AKIAABCDEFGHIJKLMNOP');
    try {
      fs.rmSync(uniqueTmp, { recursive: true, force: true });
    } catch {}
    try {
      fs.unlinkSync(f);
    } catch {}
    try {
      fs.unlinkSync(backendFile);
    } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    delete process.env.SENTINEL_BACKEND;
    delete process.env.SENTINEL_BACKEND_FILE;
  });

  it('dry-run reports would replace with ref', async () => {
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    process.env.SENTINEL_BACKEND = 'file';
    const f = 'tmp-backend-dry.txt';
    fs.writeFileSync(f, 'xx AKIAABCDEFGHIJKLMNOP yy');
    const { backendRotator } = await import('../src/rotators/backendRotator');
    const res = await backendRotator.rotate(
      { filePath: f, line: 1, column: 5, match: 'AKIAABCDEFGHIJKLMNOP' } as any,
      { dryRun: true },
    );
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/Would store secret and replace/);
    const txt = fs.readFileSync(f, 'utf8');
    expect(txt).toContain('AKIAABCDEFGHIJKLMNOP');
    try {
      fs.rmSync(uniqueTmp, { recursive: true, force: true });
    } catch {}
    try {
      fs.unlinkSync(f);
    } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    delete process.env.SENTINEL_BACKEND;
  });

  it('vault provider dry-run includes ref token without network', async () => {
    const uniqueTmp = `.sentinel_tmp_${Date.now()}_${Math.random()}`;
    process.env.SENTINEL_TMP_DIR = uniqueTmp;
    process.env.SENTINEL_BACKEND = 'vault';
    const f = 'tmp-backend-vault-dry.txt';
    fs.writeFileSync(f, 'xx AKIAABCDEFGHIJKLMNOP yy');
    const { backendRotator } = await import('../src/rotators/backendRotator');
    const res = await backendRotator.rotate(
      { filePath: f, line: 1, column: 5, match: 'AKIAABCDEFGHIJKLMNOP' } as any,
      { dryRun: true, template: '__REF_{{ref}}__' },
    );
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/Would store secret and replace/);
    try {
      fs.rmSync(uniqueTmp, { recursive: true, force: true });
    } catch {}
    try {
      fs.unlinkSync(f);
    } catch {}
    delete process.env.SENTINEL_TMP_DIR;
    delete process.env.SENTINEL_BACKEND;
  });
});
