import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProvider } from '../src/rotators/backendRotator.js';

/**
 * HashiCorp Vault Integration Tests
 * 
 * These tests verify integration with HashiCorp Vault KV v2 secrets engine.
 * 
 * Prerequisites:
 * - Vault server running and accessible
 * - KV v2 secrets engine mounted at 'secret/'
 * - Valid Vault token with read/write permissions
 * 
 * Environment Variables:
 * - VAULT_ADDR: Vault server address (e.g., http://127.0.0.1:8200)
 * - VAULT_TOKEN: Vault authentication token
 * - VAULT_NAMESPACE: (Optional) Vault namespace
 * - SENTINEL_TEST_VAULT: Set to 'true' to enable these tests
 * 
 * Quick Setup with Vault Dev Server:
 * ```bash
 * # Start Vault in dev mode (insecure, for testing only)
 * vault server -dev
 * 
 * # In another terminal, set environment
 * export VAULT_ADDR='http://127.0.0.1:8200'
 * export VAULT_TOKEN='<root-token-from-dev-server>'
 * export SENTINEL_TEST_VAULT=true
 * 
 * # Run tests
 * npm test -- vault-integration
 * ```
 * 
 * Run with: SENTINEL_TEST_VAULT=true npm test -- vault-integration
 */

const SKIP_TESTS = process.env.SENTINEL_TEST_VAULT !== 'true';
const TEST_PREFIX = `sentinel-test-${Date.now()}`;

describe.skipIf(SKIP_TESTS)('HashiCorp Vault Integration', () => {
  let provider: Awaited<ReturnType<typeof getProvider>>;
  const testSecrets: string[] = [];

  beforeAll(async () => {
    if (SKIP_TESTS) return;

    // Verify Vault configuration
    if (!process.env.VAULT_ADDR) {
      throw new Error(
        'VAULT_ADDR not set. Example: export VAULT_ADDR=http://127.0.0.1:8200'
      );
    }

    if (!process.env.VAULT_TOKEN) {
      throw new Error(
        'VAULT_TOKEN not set. Set to your Vault authentication token.'
      );
    }

    // Initialize provider
    provider = await getProvider('vault');
  });

  afterAll(async () => {
    if (SKIP_TESTS || !provider) return;

    // Cleanup test secrets
    for (const secretId of testSecrets) {
      try {
        // Vault uses HTTP DELETE to remove secrets
        const vaultAddr = process.env.VAULT_ADDR!;
        const vaultToken = process.env.VAULT_TOKEN!;
        const namespace = process.env.VAULT_NAMESPACE || '';

        const url = `${vaultAddr}/v1/secret/data/${secretId}`;
        const headers: Record<string, string> = {
          'X-Vault-Token': vaultToken,
        };
        if (namespace) {
          headers['X-Vault-Namespace'] = namespace;
        }

        await fetch(url, { method: 'DELETE', headers });
        console.log(`Cleaned up test secret: ${secretId}`);
      } catch (err) {
        console.warn(`Failed to cleanup ${secretId}:`, (err as Error).message);
      }
    }
  });

  it('should create a new secret', async () => {
    const secretId = `${TEST_PREFIX}/create-test`;
    testSecrets.push(secretId);

    const secretValue = `test-secret-${Math.random()}`;

    await provider.put(secretId, secretValue);

    // Verify secret was created by reading it back
    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });

  it('should update an existing secret', async () => {
    const secretId = `${TEST_PREFIX}/update-test`;
    testSecrets.push(secretId);

    // Create initial secret
    const initialValue = 'initial-value';
    await provider.put(secretId, initialValue);

    // Update secret
    const updatedValue = 'updated-value';
    await provider.put(secretId, updatedValue);

    // Verify update
    const stored = await provider.get(secretId);
    expect(stored).toBe(updatedValue);
  });

  it('should handle secrets with special characters', async () => {
    const secretId = `${TEST_PREFIX}/special-chars`;
    testSecrets.push(secretId);

    const secretValue = 'secret!@#$%^&*()_+-={}[]|\\:";\'<>?,./';

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });

  it('should handle large secret values', async () => {
    const secretId = `${TEST_PREFIX}/large-secret`;
    testSecrets.push(secretId);

    // Vault KV v2 supports large values (limited by max_request_size)
    const secretValue = 'a'.repeat(50000);

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });

  it('should handle paths with multiple slashes', async () => {
    const secretId = `${TEST_PREFIX}/nested/path/secret`;
    testSecrets.push(secretId);

    const secretValue = 'nested-secret-value';

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });

  it('should handle concurrent secret creation', async () => {
    const secretIds = Array.from(
      { length: 5 },
      (_, i) => `${TEST_PREFIX}/concurrent-${i}`
    );
    testSecrets.push(...secretIds);

    const secretValues = secretIds.map((id) => `${id}-value`);

    // Create all secrets concurrently
    await Promise.all(
      secretIds.map((id, i) => provider.put(id, secretValues[i]))
    );

    // Verify all secrets
    const stored = await Promise.all(secretIds.map((id) => provider.get(id)));
    expect(stored).toEqual(secretValues);
  });

  it('should handle retries on rate limiting (HTTP 429)', async () => {
    const secretId = `${TEST_PREFIX}/rate-limit-test`;
    testSecrets.push(secretId);

    // Make multiple rapid requests to potentially trigger rate limiting
    const requests = Array.from({ length: 20 }, async (_, i) => {
      await provider.put(secretId, `value-${i}`);
    });

    // Should complete without throwing errors (retries handle 429)
    await expect(Promise.all(requests)).resolves.not.toThrow();

    // Verify final value
    const stored = await provider.get(secretId);
    expect(stored).toMatch(/^value-\d+$/);
  });

  it('should handle empty secret values', async () => {
    const secretId = `${TEST_PREFIX}/empty-secret`;
    testSecrets.push(secretId);

    const secretValue = '';

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });

  it('should handle secret retrieval for non-existent secret', async () => {
    const nonExistentId = `${TEST_PREFIX}/does-not-exist`;

    await expect(provider.get(nonExistentId)).rejects.toThrow();
  });

  it('should preserve secret versioning', async () => {
    const secretId = `${TEST_PREFIX}/versioning-test`;
    testSecrets.push(secretId);

    // Create secret
    await provider.put(secretId, 'version-1');

    // Update multiple times
    await provider.put(secretId, 'version-2');
    await provider.put(secretId, 'version-3');

    // Vault KV v2 keeps version history
    // Latest version should be returned
    const stored = await provider.get(secretId);
    expect(stored).toBe('version-3');

    // Verify we can access version history via Vault API
    const vaultAddr = process.env.VAULT_ADDR!;
    const vaultToken = process.env.VAULT_TOKEN!;
    const namespace = process.env.VAULT_NAMESPACE || '';

    const url = `${vaultAddr}/v1/secret/metadata/${secretId}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': vaultToken,
    };
    if (namespace) {
      headers['X-Vault-Namespace'] = namespace;
    }

    const response = await fetch(url, { headers });
    const metadata = await response.json();

    expect(metadata.data.current_version).toBeGreaterThanOrEqual(3);
  });

  it('should handle secrets with JSON values', async () => {
    const secretId = `${TEST_PREFIX}/json-secret`;
    testSecrets.push(secretId);

    const secretValue = JSON.stringify({
      username: 'admin',
      password: 'super-secret',
      apiKey: 'abcd1234',
    });

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);

    // Verify it's valid JSON
    const parsed = JSON.parse(stored);
    expect(parsed.username).toBe('admin');
  });

  it('should handle unicode characters', async () => {
    const secretId = `${TEST_PREFIX}/unicode-secret`;
    testSecrets.push(secretId);

    const secretValue = 'Hello 世界 🌍 Привет мир';

    await provider.put(secretId, secretValue);

    const stored = await provider.get(secretId);
    expect(stored).toBe(secretValue);
  });
});

describe('Vault Error Handling', () => {
  it('should provide helpful error when VAULT_ADDR not set', async () => {
    const originalAddr = process.env.VAULT_ADDR;
    delete process.env.VAULT_ADDR;

    try {
      const provider = await getProvider('vault');
      await provider.put('test', 'value');
      expect.fail('Should have thrown error');
    } catch (err) {
      expect((err as Error).message).toContain('VAULT_ADDR');
    } finally {
      if (originalAddr) process.env.VAULT_ADDR = originalAddr;
    }
  });

  it('should provide helpful error when VAULT_TOKEN not set', async () => {
    const originalToken = process.env.VAULT_TOKEN;
    const originalAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    
    process.env.VAULT_ADDR = originalAddr;
    delete process.env.VAULT_TOKEN;

    try {
      const provider = await getProvider('vault');
      await provider.put('test', 'value');
      expect.fail('Should have thrown error');
    } catch (err) {
      expect((err as Error).message).toMatch(/token|authentication/i);
    } finally {
      if (originalToken) process.env.VAULT_TOKEN = originalToken;
    }
  });

  it('should handle invalid Vault server address', async () => {
    const originalAddr = process.env.VAULT_ADDR;
    process.env.VAULT_ADDR = 'http://invalid.vault.server:8200';
    process.env.VAULT_TOKEN = 'test-token';

    try {
      const provider = await getProvider('vault');
      await provider.put('test', 'value');
      expect.fail('Should have thrown network error');
    } catch (err) {
      expect((err as Error).message).toMatch(/ENOTFOUND|ECONNREFUSED|fetch failed/i);
    } finally {
      if (originalAddr) {
        process.env.VAULT_ADDR = originalAddr;
      } else {
        delete process.env.VAULT_ADDR;
      }
    }
  });

  it('should handle 403 Forbidden (insufficient permissions)', async () => {
    if (!process.env.VAULT_ADDR) return;

    const originalToken = process.env.VAULT_TOKEN;
    process.env.VAULT_TOKEN = 'invalid-token';

    try {
      const provider = await getProvider('vault');
      await provider.put('test', 'value');
      expect.fail('Should have thrown 403 error');
    } catch (err) {
      const message = (err as Error).message;
      // Accept either 403, forbidden, permission denied, or fetch failed (network error)
      expect(message).toMatch(/403|forbidden|permission denied|fetch failed/i);
    } finally {
      if (originalToken) {
        process.env.VAULT_TOKEN = originalToken;
      } else {
        delete process.env.VAULT_TOKEN;
      }
    }
  });
});
