import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type CatalogEntry = {
  name: string;
  url: string;
  sha256?: string; // hex
  sig?: string; // base64 ed25519 detached signature over file bytes
};

export type Catalog = {
  rulesets: CatalogEntry[];
  pubkey?: string; // optional PEM-encoded public key (ed25519)
};

async function readFileMaybe(p: string): Promise<Buffer> {
  return fs.readFile(p);
}

async function fetchMaybe(spec: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(spec)) {
    const res = await fetch(spec);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${spec}`);
    const arr = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(arr);
  }
  // treat as path
  const ap = path.resolve(spec);
  return readFileMaybe(ap);
}

export async function loadCatalog(spec: string): Promise<Catalog> {
  const buf = await fetchMaybe(spec);
  const json = JSON.parse(buf.toString('utf8'));
  if (!json || !Array.isArray(json.rulesets)) throw new Error('Invalid catalog format');
  return json as Catalog;
}

async function fetchCatalogSig(spec: string): Promise<Buffer | undefined> {
  // Try sidecar .sig next to the catalog resource
  if (/^https?:\/\//i.test(spec)) {
    const url = new URL(spec);
    const candidate = new URL(url.toString() + '.sig');
    try {
      const res = await fetch(candidate.toString());
      if (res.ok) {
        const arr = new Uint8Array(await res.arrayBuffer());
        return Buffer.from(arr);
      }
    } catch {}
    return undefined;
  }
  const ap = path.resolve(spec + '.sig');
  try {
    return await fs.readFile(ap);
  } catch {
    return undefined;
  }
}

function verifySha256(buf: Buffer, hex?: string) {
  if (!hex) return true;
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  return got.toLowerCase() === hex.toLowerCase();
}

function verifySigEd25519(buf: Buffer, sigB64?: string, pubkeyPem?: string) {
  if (!sigB64 || !pubkeyPem) return true;
  try {
    const keyObj = crypto.createPublicKey(pubkeyPem);
    const sig = Buffer.from(sigB64, 'base64');
    return crypto.verify(null, buf, keyObj, sig);
  } catch {
    return false;
  }
}

export async function installRulesets(opts: {
  catalog: string;
  names: string[];
  cacheDir: string;
  pubkey?: string; // override catalog.pubkey for ruleset item signatures
  requireSigned?: boolean; // require ruleset item signatures
  catalogPubkey?: string; // pubkey for catalog detached signature
  catalogRequireSigned?: boolean; // require catalog to be signed
}): Promise<{ installed: string[]; dir: string }>{
  const { catalog, names, cacheDir, pubkey } = opts;
  // Load raw catalog bytes for optional detached signature verification
  const catBuf = await fetchMaybe(catalog);
  if (opts.catalogRequireSigned) {
    const sigBuf = await fetchCatalogSig(catalog);
    if (!sigBuf) throw new Error('Catalog signature required but missing (.sig not found)');
    const pk = opts.catalogPubkey;
    if (!pk) throw new Error('Catalog signature required but no public key provided');
    const keyObj = crypto.createPublicKey(pk);
    const ok = crypto.verify(null, catBuf, keyObj, sigBuf);
    if (!ok) throw new Error('Catalog signature verification failed');
  }
  const cat = JSON.parse(catBuf.toString('utf8')) as Catalog;
  const pk = pubkey || cat.pubkey;
  try { await fs.mkdir(cacheDir, { recursive: true }); } catch {}
  const map: Record<string, CatalogEntry> = {};
  for (const e of cat.rulesets) map[e.name] = e;
  const done: string[] = [];
  for (const n of names) {
    const ent = map[n];
    if (!ent) throw new Error(`Ruleset not found in catalog: ${n}`);
    const data = await fetchMaybe(ent.url);
    if (!verifySha256(data, ent.sha256)) throw new Error(`SHA256 mismatch for ${n}`);
    if (opts.requireSigned) {
      if (!ent.sig || !pk) throw new Error(`Signature required but missing for ${n}`);
    }
    if (!verifySigEd25519(data, ent.sig, pk)) throw new Error(`Signature verify failed for ${n}`);
    const outPath = path.join(cacheDir, `${n}.ruleset.json`);
    await fs.writeFile(outPath, data);
    done.push(n);
  }
  return { installed: done, dir: cacheDir };
}
