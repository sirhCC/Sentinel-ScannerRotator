import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function tmpDir(name: string) {
  const d = path.join(process.cwd(), name);
  try {
    fs.mkdirSync(d);
  } catch {}
  return d;
}

describe('ruleset marketplace signatures', () => {
  it('enforces per-item ed25519 signatures when required (happy path)', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const { listRulesets } = await import('../src/rules/library');

    const work = tmpDir('tmp-market-signed');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    // Create a simple ruleset file
    const rs = [{ name: 'SIGNED_RULE', regex: 'SR_[0-9]{6}', severity: 'low' }];
    const rsPath = path.join(work, 'signed.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'signed', rules: rs }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    // Generate ed25519 keypair and sign ruleset bytes
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const sig = crypto.sign(null, data, privateKey).toString('base64');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // Create catalog that includes signature and sha256
    const catalog = { rulesets: [{ name: 'signed', url: rsPath, sha256, sig }] };
    const catPath = path.join(work, 'catalog.json');
    fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2));

    // Install requiring signatures
    const { installed, dir } = await installRulesets({
      catalog: catPath,
      names: ['signed'],
      cacheDir: cache,
      pubkey: pubPem,
      requireSigned: true,
    });
    expect(installed).toContain('signed');
    expect(fs.existsSync(path.join(dir, 'signed.ruleset.json'))).toBe(true);

    // Listing should include the newly installed ruleset when pointing at cache dir
    const names = await listRulesets([cache]);
    expect(names).toContain('signed');

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });

  it('fails when signature is required but missing', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const work = tmpDir('tmp-market-sig-missing');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rsPath = path.join(work, 'nosig.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'nosig', rules: [] }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const catalog = { rulesets: [{ name: 'nosig', url: rsPath, sha256 }] };
    const catPath = path.join(work, 'catalog.json');
    fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2));

    await expect(
      installRulesets({
        catalog: catPath,
        names: ['nosig'],
        cacheDir: cache,
        pubkey: pubPem,
        requireSigned: true,
      }),
    ).rejects.toThrow(/Signature required but missing/);

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });

  it('fails when signature does not verify with provided pubkey', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const work = tmpDir('tmp-market-sig-bad');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rsPath = path.join(work, 'bad.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'bad', rules: [] }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    // Sign with key A
    const { privateKey: privA } = crypto.generateKeyPairSync('ed25519');
    const sig = crypto.sign(null, data, privA).toString('base64');
    // Provide pubkey B
    const { publicKey: pubB } = crypto.generateKeyPairSync('ed25519');
    const pubPemB = pubB.export({ type: 'spki', format: 'pem' }).toString();

    const catalog = { rulesets: [{ name: 'bad', url: rsPath, sha256, sig }] };
    const catPath = path.join(work, 'catalog.json');
    fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2));

    await expect(
      installRulesets({
        catalog: catPath,
        names: ['bad'],
        cacheDir: cache,
        pubkey: pubPemB,
        requireSigned: true,
      }),
    ).rejects.toThrow(/Signature verify failed/);

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });

  it('requires and verifies catalog detached signature when enabled', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const work = tmpDir('tmp-market-catalog-signed');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rsPath = path.join(work, 'cat1.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'cat1', rules: [] }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const catalog = { rulesets: [{ name: 'cat1', url: rsPath, sha256 }] };
    const catPath = path.join(work, 'catalog.json');
    const catBuf = Buffer.from(JSON.stringify(catalog, null, 2));
    fs.writeFileSync(catPath, catBuf);

    // Sign the catalog bytes and write sidecar .sig
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const catSig = crypto.sign(null, catBuf, privateKey);
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    // Sidecar .sig is raw signature bytes
    fs.writeFileSync(catPath + '.sig', catSig);

    const { installed } = await installRulesets({
      catalog: catPath,
      names: ['cat1'],
      cacheDir: cache,
      catalogRequireSigned: true,
      catalogPubkey: pubPem,
    });
    expect(installed).toContain('cat1');

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });

  it('errors if catalog signature is required but missing', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const work = tmpDir('tmp-market-catalog-missing');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rsPath = path.join(work, 'cat2.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'cat2', rules: [] }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const catalog = { rulesets: [{ name: 'cat2', url: rsPath, sha256 }] };
    const catPath = path.join(work, 'catalog.json');
    fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2));

    await expect(
      installRulesets({
        catalog: catPath,
        names: ['cat2'],
        cacheDir: cache,
        catalogRequireSigned: true,
        catalogPubkey: crypto
          .generateKeyPairSync('ed25519')
          .publicKey.export({ type: 'spki', format: 'pem' })
          .toString(),
      }),
    ).rejects.toThrow(/Catalog signature required but missing/);

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });

  it('errors if catalog detached signature verification fails', async () => {
    const { installRulesets } = await import('../src/rules/marketplace');
    const work = tmpDir('tmp-market-catalog-bad');
    const cache = path.join(work, 'cache');
    try {
      fs.mkdirSync(cache);
    } catch {}

    const rsPath = path.join(work, 'cat3.ruleset.json');
    fs.writeFileSync(rsPath, JSON.stringify({ name: 'cat3', rules: [] }, null, 2));
    const data = fs.readFileSync(rsPath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const catalog = { rulesets: [{ name: 'cat3', url: rsPath, sha256 }] };
    const catPath = path.join(work, 'catalog.json');
    const catBuf = Buffer.from(JSON.stringify(catalog, null, 2));
    fs.writeFileSync(catPath, catBuf);

    // Sign with key A but provide key B
    const { privateKey: privA } = crypto.generateKeyPairSync('ed25519');
    const sigA = crypto.sign(null, catBuf, privA).toString('base64');
    fs.writeFileSync(catPath + '.sig', sigA);
    const { publicKey: pubB } = crypto.generateKeyPairSync('ed25519');
    const pubPemB = pubB.export({ type: 'spki', format: 'pem' }).toString();

    await expect(
      installRulesets({
        catalog: catPath,
        names: ['cat3'],
        cacheDir: cache,
        catalogRequireSigned: true,
        catalogPubkey: pubPemB,
      }),
    ).rejects.toThrow(/Catalog signature verification failed/);

    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {}
  });
});
