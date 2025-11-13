import fs from 'fs/promises';
import crypto from 'crypto';

/**
 * Audit log replay detection
 * 
 * Verifies audit logs for:
 * - Duplicate events (replay attacks)
 * - Tampered hashes
 * - Invalid HMAC signatures
 * - Chronological ordering violations
 */

export type VerificationResult = {
  valid: boolean;
  totalEvents: number;
  errors: VerificationError[];
  warnings: VerificationWarning[];
};

export type VerificationError = {
  line: number;
  type: 'duplicate' | 'tampered_hash' | 'invalid_signature' | 'missing_hash';
  message: string;
  event?: any;
};

export type VerificationWarning = {
  line: number;
  type: 'timestamp_regression' | 'unsigned' | 'missing_timestamp';
  message: string;
};

type VerificationOptions = {
  signKey?: string | Buffer;
  allowDuplicates?: boolean;
  checkTimestamps?: boolean;
};

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map((v) => stableStringify(v)).join(',') + ']';
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

/**
 * Verify audit log integrity
 */
export async function verifyAuditLog(
  filePath: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim());

  const result: VerificationResult = {
    valid: true,
    totalEvents: lines.length,
    errors: [],
    warnings: [],
  };

  const seenHashes = new Set<string>();
  let lastTimestamp: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let event: any;

    try {
      event = JSON.parse(lines[i]);
    } catch {
      result.errors.push({
        line: lineNum,
        type: 'tampered_hash',
        message: 'Invalid JSON',
      });
      result.valid = false;
      continue;
    }

    // Check for hash field
    if (!event.hash) {
      result.errors.push({
        line: lineNum,
        type: 'missing_hash',
        message: 'Event missing hash field',
        event,
      });
      result.valid = false;
      continue;
    }

    // Extract and verify hash
    const hashValue = event.hash.replace(/^sha256-/, '');
    const eventCopy = { ...event };
    delete eventCopy.hash;
    delete eventCopy.sig;
    delete eventCopy.keyId;

    const payloadStr = stableStringify(eventCopy);
    const expectedHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    if (hashValue !== expectedHash) {
      result.errors.push({
        line: lineNum,
        type: 'tampered_hash',
        message: `Hash mismatch: expected ${expectedHash}, got ${hashValue}`,
        event,
      });
      result.valid = false;
      continue;
    }

    // Check for duplicate events (replay detection)
    if (!options.allowDuplicates && seenHashes.has(hashValue)) {
      result.errors.push({
        line: lineNum,
        type: 'duplicate',
        message: 'Duplicate event detected (possible replay attack)',
        event,
      });
      result.valid = false;
    }
    seenHashes.add(hashValue);

    // Verify HMAC signature if present
    if (event.sig) {
      const key = options.signKey ?? process.env.SENTINEL_AUDIT_SIGN_KEY;
      if (!key) {
        result.warnings.push({
          line: lineNum,
          type: 'unsigned',
          message: 'Event has signature but no key provided for verification',
        });
      } else {
        const sigValue = event.sig.replace(/^hmac-sha256-/, '');
        const expectedSig = crypto
          .createHmac('sha256', key as any)
          .update(hashValue)
          .digest('hex');

        if (sigValue !== expectedSig) {
          result.errors.push({
            line: lineNum,
            type: 'invalid_signature',
            message: 'HMAC signature verification failed',
            event,
          });
          result.valid = false;
        }
      }
    } else if (options.signKey) {
      result.warnings.push({
        line: lineNum,
        type: 'unsigned',
        message: 'Event is not signed',
      });
    }

    // Check timestamp ordering
    if (options.checkTimestamps && event.timestamp) {
      const timestamp = new Date(event.timestamp).getTime();
      if (lastTimestamp !== null && timestamp < lastTimestamp) {
        result.warnings.push({
          line: lineNum,
          type: 'timestamp_regression',
          message: `Timestamp regression detected: ${new Date(timestamp).toISOString()} < ${new Date(lastTimestamp).toISOString()}`,
        });
      }
      lastTimestamp = timestamp;
    } else if (options.checkTimestamps && !event.timestamp) {
      result.warnings.push({
        line: lineNum,
        type: 'missing_timestamp',
        message: 'Event missing timestamp field',
      });
    }
  }

  return result;
}

/**
 * Generate audit report summary
 */
export function formatVerificationReport(result: VerificationResult): string {
  const lines: string[] = [];

  lines.push(`Audit Log Verification Report`);
  lines.push(`============================`);
  lines.push(``);
  lines.push(`Total Events: ${result.totalEvents}`);
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(``);

  if (result.errors.length > 0) {
    lines.push(`Errors (${result.errors.length}):`);
    for (const error of result.errors) {
      lines.push(`  Line ${error.line}: [${error.type}] ${error.message}`);
    }
    lines.push(``);
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      lines.push(`  Line ${warning.line}: [${warning.type}] ${warning.message}`);
    }
    lines.push(``);
  }

  if (result.valid && result.errors.length === 0) {
    lines.push(`All events verified successfully!`);
  }

  return lines.join('\n');
}
