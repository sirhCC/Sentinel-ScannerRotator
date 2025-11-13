import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAuditLog, formatVerificationReport } from '../src/auditVerify.js';
import { createAuditWriter } from '../src/audit.js';
import fs from 'fs/promises';
import path from 'path';
import * as os from 'os';

describe('Audit Log Replay Detection', () => {
  const testDir = path.join(os.tmpdir(), `sentinel-audit-verify-${Date.now()}`);
  const auditFile = path.join(testDir, 'audit.ndjson');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  it('should verify valid audit log', async () => {
    const writer = await createAuditWriter(auditFile);
    await writer.write({ action: 'scan', file: 'test.txt', timestamp: new Date().toISOString() });
    await writer.write({ action: 'rotate', file: 'test.txt', timestamp: new Date().toISOString() });
    await writer.close();

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect duplicate events (replay attack)', async () => {
    const writer = await createAuditWriter(auditFile);
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    // Duplicate the line manually
    const content = await fs.readFile(auditFile, 'utf8');
    await fs.writeFile(auditFile, content + content, 'utf8');

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('duplicate');
    expect(result.errors[0].message).toContain('replay');
  });

  it('should detect tampered hashes', async () => {
    const writer = await createAuditWriter(auditFile);
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    // Tamper with the event
    const content = await fs.readFile(auditFile, 'utf8');
    const tampered = content.replace('"action":"scan"', '"action":"tampered"');
    await fs.writeFile(auditFile, tampered, 'utf8');

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('tampered_hash');
    expect(result.errors[0].message).toContain('Hash mismatch');
  });

  it('should verify HMAC signatures', async () => {
    const signKey = 'test-key-12345';
    const writer = await createAuditWriter(auditFile, false, { signKey });
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    const result = await verifyAuditLog(auditFile, { signKey });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid HMAC signatures', async () => {
    const signKey = 'test-key-12345';
    const writer = await createAuditWriter(auditFile, false, { signKey });
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    // Tamper with signature
    const content = await fs.readFile(auditFile, 'utf8');
    const tampered = content.replace(/"sig":"hmac-sha256-[^"]+"/,  '"sig":"hmac-sha256-tampered"');
    await fs.writeFile(auditFile, tampered, 'utf8');

    const result = await verifyAuditLog(auditFile, { signKey });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('invalid_signature');
  });

  it('should detect missing hashes', async () => {
    // Manually create event without hash
    const event = { action: 'scan', file: 'test.txt' };
    await fs.writeFile(auditFile, JSON.stringify(event) + '\n', 'utf8');

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('missing_hash');
  });

  it('should warn about timestamp regression', async () => {
    const writer = await createAuditWriter(auditFile);
    const now = new Date();
    const later = new Date(now.getTime() + 10000);
    const earlier = new Date(now.getTime() - 10000);

    await writer.write({ action: 'scan', timestamp: now.toISOString() });
    await writer.write({ action: 'rotate', timestamp: later.toISOString() });
    await writer.write({ action: 'verify', timestamp: earlier.toISOString() }); // Regression
    await writer.close();

    const result = await verifyAuditLog(auditFile, { checkTimestamps: true });

    expect(result.warnings.length).toBeGreaterThan(0);
    const regression = result.warnings.find((w) => w.type === 'timestamp_regression');
    expect(regression).toBeDefined();
  });

  it('should allow duplicates when option is set', async () => {
    const writer = await createAuditWriter(auditFile);
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    // Duplicate the line
    const content = await fs.readFile(auditFile, 'utf8');
    await fs.writeFile(auditFile, content + content, 'utf8');

    const result = await verifyAuditLog(auditFile, { allowDuplicates: true });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should warn about unsigned events when key is provided', async () => {
    const writer = await createAuditWriter(auditFile); // No signing key
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    const result = await verifyAuditLog(auditFile, { signKey: 'test-key' });

    expect(result.warnings.length).toBeGreaterThan(0);
    const unsigned = result.warnings.find((w) => w.type === 'unsigned');
    expect(unsigned).toBeDefined();
    expect(unsigned?.message).toContain('not signed');
  });

  it('should handle invalid JSON lines', async () => {
    await fs.writeFile(auditFile, 'invalid json\n', 'utf8');

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Invalid JSON');
  });

  it('should handle empty audit log', async () => {
    await fs.writeFile(auditFile, '', 'utf8');

    const result = await verifyAuditLog(auditFile);

    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should generate readable verification report', async () => {
    const writer = await createAuditWriter(auditFile);
    await writer.write({ action: 'scan', file: 'test.txt' });
    await writer.close();

    const result = await verifyAuditLog(auditFile);
    const report = formatVerificationReport(result);

    expect(report).toContain('Audit Log Verification Report');
    expect(report).toContain('Total Events: 1');
    expect(report).toContain('✓ VALID');
  });

  it('should report errors in formatted output', async () => {
    await fs.writeFile(auditFile, 'invalid json\n', 'utf8');

    const result = await verifyAuditLog(auditFile);
    const report = formatVerificationReport(result);

    expect(report).toContain('✗ INVALID');
    expect(report).toContain('Errors (1)');
    expect(report).toContain('Invalid JSON');
  });

  it('should detect multiple issues in single log', async () => {
    const signKey = 'test-key';
    const writer = await createAuditWriter(auditFile, false, { signKey });
    await writer.write({ action: 'scan' });
    await writer.write({ action: 'rotate' });
    await writer.close();

    // Tamper with first event and duplicate second
    let content = await fs.readFile(auditFile, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    const tampered = lines[0].replace('"action":"scan"', '"action":"tampered"');
    content = tampered + '\n' + lines[1] + '\n' + lines[1] + '\n';
    await fs.writeFile(auditFile, content, 'utf8');

    const result = await verifyAuditLog(auditFile, { signKey });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2); // Tampered + duplicate
  });

  it('should verify key ID when present', async () => {
    const signKey = 'test-key';
    const keyId = 'key-2024-01';
    const writer = await createAuditWriter(auditFile, false, { signKey, keyId });
    await writer.write({ action: 'scan' });
    await writer.close();

    const content = await fs.readFile(auditFile, 'utf8');
    expect(content).toContain(`"keyId":"${keyId}"`);

    const result = await verifyAuditLog(auditFile, { signKey });
    expect(result.valid).toBe(true);
  });
});
