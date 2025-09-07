import path from 'path';
import fs from 'fs/promises';
import { Rotator, Finding } from '../types.js';
import { safeUpdate } from '../fileSafeUpdate.js';

type Provider = {
  name: string;
  put: (key: string, value: string) => Promise<string>; // returns canonical ref suffix (e.g., key or ARN)
  get?: (key: string) => Promise<string | undefined>;
  delete?: (key: string) => Promise<void>;
};

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function genKey(finding: Finding, ts: number) {
  const base = sanitize(path.basename(finding.filePath));
  return `${base}_${finding.line}_${ts}`;
}

async function ensureDir(p: string) {
  try { await fs.mkdir(p, { recursive: true }); } catch {}
}

function fileProvider(): Provider {
  const outPath = process.env.SENTINEL_BACKEND_FILE || path.join(process.cwd(), '.sentinel_secrets.json');
  const histPath = (outPath.endsWith('.json') ? outPath.replace(/\.json$/i, '.history.ndjson') : `${outPath}.history.ndjson`);
  return {
    name: 'file',
    async put(key: string, value: string) {
      // write/update JSON map { key: value }
      let current: Record<string, string> = {};
      try {
        const txt = await fs.readFile(outPath, 'utf8');
        current = JSON.parse(txt || '{}');
      } catch {}
      const prev = current[key];
      if (prev !== undefined && prev !== value) {
        // append history event
        try {
          await ensureDir(path.dirname(histPath));
          const evt = { ts: Date.now(), key, prev, next: value };
          await fs.appendFile(histPath, JSON.stringify(evt) + '\n', 'utf8');
        } catch {}
      }
      current[key] = value;
      await ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, JSON.stringify(current, null, 2), 'utf8');
      return key;
    },
    async get(key: string) {
      try {
        const txt = await fs.readFile(outPath, 'utf8');
        const current = JSON.parse(txt || '{}');
        return current[key];
      } catch {
        return undefined;
      }
    }
    ,
    async delete(key: string) {
      try {
        const txt = await fs.readFile(outPath, 'utf8');
        const current = JSON.parse(txt || '{}');
        if (key in current) {
          delete current[key];
          await fs.writeFile(outPath, JSON.stringify(current, null, 2), 'utf8');
        }
      } catch {
        // ignore
      }
    }
  };
}

async function awsProvider(): Promise<Provider> {
  // Lazy load AWS SDK v3 client if available
  try {
    const awsSdkModule: any = '@aws-sdk/client-secrets-manager';
    const mod: any = await import(awsSdkModule);
    const { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand } = mod;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const client = new SecretsManagerClient({ region });
  return {
      name: 'aws',
      async put(key: string, value: string) {
        // create or update secret named key (optionally with prefix)
        const prefix = process.env.SENTINEL_BACKEND_PREFIX || '';
        const name = prefix ? `${prefix}${key}` : key;
        try {
          await client.send(new CreateSecretCommand({ Name: name, SecretString: value }));
    } catch {
          // If already exists, update value
          await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));
        }
  return name; // return secret name as ref suffix
      }
  };
  } catch {
    throw new Error("AWS Secrets Manager SDK not available. Install '@aws-sdk/client-secrets-manager' or set SENTINEL_BACKEND=file.");
  }
}

async function vaultProvider(): Promise<Provider> {
  // Minimal Vault KV v2 client via fetch
  const addr = process.env.VAULT_ADDR || '';
  const token = process.env.VAULT_TOKEN || '';
  if (!addr || !token) {
    throw new Error('Vault provider requires VAULT_ADDR and VAULT_TOKEN');
  }
  const mount = process.env.SENTINEL_VAULT_MOUNT || 'secret';
  const basePath = process.env.SENTINEL_VAULT_PATH || 'sentinel';
  const baseUrl = addr.replace(/\/$/, '');
  const kvWriteUrl = (fullKey: string) => `${baseUrl}/v1/${mount}/data/${fullKey}`;
  const kvReadUrl = (fullKey: string) => `${baseUrl}/v1/${mount}/data/${fullKey}`;
  const ns = process.env.VAULT_NAMESPACE || '';

  async function doPut(fullKey: string, value: string) {
    const body = JSON.stringify({ data: { value } });
    const res = await fetch(kvWriteUrl(fullKey), {
      method: 'POST',
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json'
      , ...(ns ? { 'X-Vault-Namespace': ns } as any : {})
      },
      body,
    } as any);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Vault write failed: ${res.status} ${txt}`);
    }
  }

  async function doGet(fullKey: string): Promise<string | undefined> {
    const res = await fetch(kvReadUrl(fullKey), {
      method: 'GET',
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json'
      , ...(ns ? { 'X-Vault-Namespace': ns } as any : {})
      },
    } as any);
    if (!res.ok) return undefined;
    try {
      const json: any = await res.json();
      return json?.data?.data?.value;
    } catch {
      return undefined;
    }
  }

  return {
    name: 'vault',
    async put(key: string, value: string) {
      const fullKey = `${basePath}/${key}`;
      await doPut(fullKey, value);
      return fullKey;
    },
    async get(key: string) {
      const fullKey = `${basePath}/${key}`;
      return doGet(fullKey);
    },
    async delete(key: string) {
      // Best-effort soft delete: write empty value or ignore
      try {
        const fullKey = `${basePath}/${key}`;
        await doPut(fullKey, '');
      } catch {
        // ignore
      }
    }
  };
}

async function getProvider(): Promise<Provider> {
  const which = (process.env.SENTINEL_BACKEND || 'file').toLowerCase();
  if (which === 'aws') return awsProvider();
  if (which === 'vault') return vaultProvider();
  return fileProvider();
}

function buildRef(providerName: string, refSuffix: string) {
  return `secretref://${providerName}/${refSuffix}`;
}

export const backendRotator: Rotator = {
  name: 'backend',
  async rotateFile(filePath, findings, options) {
    if (!Array.isArray(findings) || !findings.length) return [];
    const ts = Date.now();
    const backendName = (process.env.SENTINEL_BACKEND || 'file').toLowerCase();
    if (options?.dryRun) {
      // Derive refs for each finding and preview a single-file replacement
      return findings.map((f) => {
        const key = process.env.SENTINEL_BACKEND_KEY_OVERRIDE || `${path.basename(f.filePath)}_${f.line}_${ts}`;
        const ref = `secretref://${backendName}/${key}`;
        const placeholder = options?.template
          ? options.template
              .replace(/\{\{match\}\}/g, f.match)
              .replace(/\{\{timestamp\}\}/g, String(ts))
              .replace(/\{\{file\}\}/g, f.filePath)
              .replace(/\{\{ref\}\}/g, ref)
          : ref;
        return { success: true, message: `Would store secret and replace with ${placeholder} in ${filePath}:${f.line}` };
      });
    }
    const provider = await getProvider();
    // Write secrets first; optionally verify; then replace in a single safe update
    const records = [] as Array<{ raw: string; key: string; ref: string }>;
    for (const f of findings) {
      const key = process.env.SENTINEL_BACKEND_KEY_OVERRIDE || genKey(f, ts);
      const refSuffix = await provider.put(key, f.match);
      if (options?.verify && provider.get) {
        const readBack = await provider.get(key);
        if (readBack !== f.match) {
          try { await provider.delete?.(key); } catch {}
          return [{ success: false, message: `Verification failed for ${provider.name}:${key}` }];
        }
      }
      const ref = buildRef(provider.name, refSuffix);
      records.push({ raw: f.match, key, ref });
    }
    // Perform one file write
    const res = await safeUpdate(filePath, (content) => {
      let out = content;
      for (const r of records) {
        const esc = r.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const placeholder = options?.template
          ? options.template
              .replace(/\{\{match\}\}/g, r.raw)
              .replace(/\{\{timestamp\}\}/g, String(ts))
              .replace(/\{\{file\}\}/g, filePath)
              .replace(/\{\{ref\}\}/g, r.ref)
          : r.ref;
        out = out.replace(new RegExp(esc, 'g'), placeholder);
      }
      return out;
    });
    if (res.success) return [{ success: true, message: `Stored secret in ${provider.name} and replaced in ${filePath} (backup: ${res.backupPath})` }];
    // Rollback all keys best-effort
    for (const r of records) { try { await provider.delete?.(r.key); } catch {} }
    return [{ success: false, message: `Failed to update file after storing secret(s): ${res.error}` }];
  },
  async rotate(finding, options) {
    const ts = Date.now();
    const backendName = (process.env.SENTINEL_BACKEND || 'file').toLowerCase();
  const key = process.env.SENTINEL_BACKEND_KEY_OVERRIDE || genKey(finding, ts);

    if (options?.dryRun) {
      const ref = buildRef(backendName, key);
  const placeholder = options?.template
        ? options.template
            .replace(/\{\{match\}\}/g, finding.match)
            .replace(/\{\{timestamp\}\}/g, String(ts))
            .replace(/\{\{file\}\}/g, finding.filePath)
            .replace(/\{\{ref\}\}/g, ref)
        : ref;
      return { success: true, message: `Would store secret and replace with ${placeholder} in ${finding.filePath}:${finding.line}` };
    }
  let provider: Provider | undefined;
  try {
    provider = await getProvider();
    const refSuffix = await provider.put(key, finding.match);
      const ref = buildRef(provider.name, refSuffix);
      if (options?.verify && provider.get) {
        const readBack = await provider.get(key);
        if (readBack !== finding.match) {
      // cleanup
      try { await provider.delete?.(key); } catch {}
      return { success: false, message: `Verification failed for ${provider.name}:${key}` };
        }
      }
      const placeholder = options?.template
        ? options.template
            .replace(/\{\{match\}\}/g, finding.match)
            .replace(/\{\{timestamp\}\}/g, String(ts))
            .replace(/\{\{file\}\}/g, finding.filePath)
            .replace(/\{\{ref\}\}/g, ref)
        : ref;
      const res = await safeUpdate(
        finding.filePath,
        (content) => {
          if (!finding.match) return content;
          const esc = finding.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return content.replace(new RegExp(esc, 'g'), placeholder);
        }
      );
    if (res.success) return { success: true, message: `Stored secret in ${provider.name} and replaced in ${finding.filePath} (backup: ${res.backupPath})` };
    // rollback provider on failure
    try { await provider.delete?.(key); } catch {}
    return { success: false, message: `Failed to update file after storing secret: ${res.error}` };
    } catch (e: any) {
      return { success: false, message: `Failed to store secret: ${e?.message || e}` };
    }
  }
};
