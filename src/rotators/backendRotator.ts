import path from 'path';
import fs from 'fs/promises';
import { Rotator, Finding } from '../types.js';
import { safeUpdate } from '../fileSafeUpdate.js';

type Provider = {
  name: string;
  put: (key: string, value: string) => Promise<string>; // returns canonical ref suffix (e.g., key or ARN)
  get?: (key: string) => Promise<string | undefined>;
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
  return {
    name: 'file',
    async put(key: string, value: string) {
      // write/update JSON map { key: value }
      let current: Record<string, string> = {};
      try {
        const txt = await fs.readFile(outPath, 'utf8');
        current = JSON.parse(txt || '{}');
      } catch {}
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
  async rotate(finding, options) {
    const ts = Date.now();
    const backendName = (process.env.SENTINEL_BACKEND || 'file').toLowerCase();
    const key = genKey(finding, ts);

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
    try {
      const provider = await getProvider();
      const refSuffix = await provider.put(key, finding.match);
      const ref = buildRef(provider.name, refSuffix);
      if (options?.verify && provider.get) {
        const readBack = await provider.get(key);
        if (readBack !== finding.match) {
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
        (content) => content.replace(finding.match, placeholder)
      );
      if (res.success) return { success: true, message: `Stored secret in ${provider.name} and replaced in ${finding.filePath} (backup: ${res.backupPath})` };
      return { success: false, message: `Failed to update file after storing secret: ${res.error}` };
    } catch (e: any) {
      return { success: false, message: `Failed to store secret: ${e?.message || e}` };
    }
  }
};
