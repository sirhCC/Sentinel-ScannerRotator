# API Documentation

> **For Plugin Authors & Integrators**

This document provides comprehensive API documentation for extending SecretSentinel with custom scanners, rotators, and rules.

## Table of Contents

- [Core Types](#core-types)
- [Writing Custom Rotators](#writing-custom-rotators)
- [Writing Custom Scanners](#writing-custom-scanners)
- [Writing Custom Rules](#writing-custom-rules)
- [Error Handling Utilities](#error-handling-utilities)
- [Configuration API](#configuration-api)
- [Metrics & Monitoring](#metrics--monitoring)
- [Audit Logging](#audit-logging)

---

## Core Types

### Finding

Represents a detected secret in a file.

```typescript
type Finding = {
  line: number;        // Line number (1-indexed)
  match: string;       // The matched secret
  rule: string;        // Rule ID that matched
  file: string;        // Absolute file path
  severity: 'low' | 'medium' | 'high';
};
```

### ScanResult

Result of scanning a single file.

```typescript
type ScanResult = {
  file: string;        // Absolute file path
  findings: Finding[]; // Array of findings
};
```

### Rotator Interface

The core interface all rotators must implement.

```typescript
interface Rotator {
  name: string;        // Unique rotator name (e.g., "apply", "backend")
  
  /**
   * Rotate a single finding
   * @param finding - The finding to rotate
   * @param options - Additional options (file content, config, etc.)
   * @returns Promise that resolves when rotation completes
   */
  rotate(finding: Finding, options?: any): Promise<void>;
}
```

---

## Writing Custom Rotators

Rotators handle what happens when a secret is found. Examples: replace in file, store in vault, log to SIEM.

### Basic Rotator

```typescript
// examples/rotators/customRotator.ts
import { defineRotator } from '../src/rotators/schema.js';
import { Finding } from '../src/types.js';

export default defineRotator({
  name: 'custom-logger',
  
  async rotate(finding: Finding) {
    console.log(`[CUSTOM] Found secret at ${finding.file}:${finding.line}`);
    console.log(`[CUSTOM] Rule: ${finding.rule}, Severity: ${finding.severity}`);
    // Your custom logic here
  },
});
```

### Advanced Rotator with Options

```typescript
import { defineRotator } from '../src/rotators/schema.js';
import { Finding } from '../src/types.js';
import fs from 'fs/promises';

export default defineRotator({
  name: 'custom-vault',
  
  async rotate(finding: Finding, options?: { 
    fileContent?: string;
    dryRun?: boolean;
  }) {
    const { fileContent, dryRun = false } = options || {};
    
    if (dryRun) {
      console.log(`[DRY-RUN] Would store: ${finding.match}`);
      return;
    }
    
    // Store in custom vault
    await storeInVault(finding.match, {
      source: finding.file,
      line: finding.line,
      rule: finding.rule,
    });
    
    // Replace in file if fileContent provided
    if (fileContent) {
      const newContent = fileContent.replace(
        finding.match,
        `{{VAULT:${generateVaultKey()}}}`
      );
      await fs.writeFile(finding.file, newContent, 'utf8');
    }
  },
});

async function storeInVault(secret: string, metadata: any): Promise<void> {
  // Your vault implementation
}

function generateVaultKey(): string {
  return `secret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

### Using Error Handling Utilities

```typescript
import { defineRotator } from '../src/rotators/schema.js';
import { withRetry, maskError } from '../src/errorHandling.js';
import { Finding } from '../src/types.js';

export default defineRotator({
  name: 'resilient-rotator',
  
  async rotate(finding: Finding) {
    // Wrap network calls with retry logic
    await withRetry(
      async () => {
        const response = await fetch('https://api.vault.example.com/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            secret: finding.match,
            metadata: { file: finding.file, line: finding.line }
          }),
        });
        
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          (error as any).statusCode = response.status;
          throw error;
        }
        
        return response.json();
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        onRetry: (err, attempt) => {
          const masked = maskError(err);
          console.warn(`Retry ${attempt}: ${masked.message}`);
        },
      }
    );
  },
});
```

### Loading Custom Rotators

```powershell
# Load from custom directory
sentinel --rotators-dir ./my-rotators --rotator custom-logger

# List available rotators (including custom ones)
sentinel --rotators-dir ./my-rotators --list-rotators
```

---

## Writing Custom Scanners

Scanners detect patterns in files. The plugin system allows adding support for new file formats.

### Scanner Plugin Interface

```typescript
type ScannerPlugin = {
  name: string;           // Plugin name (e.g., "yaml-scanner")
  priority: number;       // Higher = checked first (default: 10)
  
  /**
   * Test if this scanner can handle the file
   * @param filePath - Absolute path to file
   * @returns true if scanner can process this file
   */
  canHandle(filePath: string): boolean | Promise<boolean>;
  
  /**
   * Scan the file for secrets
   * @param filePath - Absolute path to file
   * @param rules - Array of rules to match against
   * @param options - Additional options (logger, metrics, etc.)
   * @returns Array of findings
   */
  scan(
    filePath: string,
    rules: Rule[],
    options?: ScanOptions
  ): Promise<Finding[]>;
};
```

### Example: Custom YAML Scanner

```typescript
// src/plugins/customYamlScanner.ts
import { ScannerPlugin, Finding } from '../types.js';
import fs from 'fs/promises';
import yaml from 'js-yaml';

export const yamlScanner: ScannerPlugin = {
  name: 'yaml-scanner',
  priority: 15, // Higher priority than default text scanner
  
  canHandle(filePath: string): boolean {
    return /\.(yaml|yml)$/i.test(filePath);
  },
  
  async scan(filePath, rules, options) {
    const findings: Finding[] = [];
    const content = await fs.readFile(filePath, 'utf8');
    
    try {
      const parsed = yaml.load(content) as any;
      
      // Recursively scan YAML values
      function scanObject(obj: any, path: string = '') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'string') {
            // Test against all rules
            for (const rule of rules) {
              const regex = new RegExp(rule.pattern, rule.flags || 'g');
              const matches = value.matchAll(regex);
              
              for (const match of matches) {
                findings.push({
                  line: 0, // YAML line numbers require more complex parsing
                  match: match[0],
                  rule: rule.id,
                  file: filePath,
                  severity: rule.severity || 'medium',
                });
              }
            }
          } else if (typeof value === 'object' && value !== null) {
            scanObject(value, currentPath);
          }
        }
      }
      
      scanObject(parsed);
    } catch (err) {
      options?.logger?.warn(`Failed to parse YAML: ${filePath}`);
    }
    
    return findings;
  },
};

// Register the plugin
import { getScannerPlugins } from './plugins/scanners.js';
getScannerPlugins().push(yamlScanner);
```

---

## Writing Custom Rules

Rules define patterns to match secrets. They can be added via configuration or curated rulesets.

### Rule Definition

```typescript
type RuleDef = {
  id: string;                    // Unique rule ID
  description: string;           // Human-readable description
  pattern: string;               // Regex pattern to match
  severity?: 'low' | 'medium' | 'high';  // Severity level (default: medium)
  flags?: string;                // Regex flags (default: 'gi')
};

type Rule = {
  id: string;
  regex: RegExp;                 // Compiled regex
  severity: 'low' | 'medium' | 'high';
};
```

### Custom Rules in Config

```json
{
  "patterns": [
    {
      "id": "custom-api-key",
      "description": "Custom API Key Pattern",
      "pattern": "CUSTOM_KEY_[A-Za-z0-9]{32}",
      "severity": "high",
      "flags": "g"
    },
    {
      "id": "internal-token",
      "description": "Internal System Token",
      "pattern": "INT_TKN_[A-F0-9]{16}",
      "severity": "medium"
    }
  ]
}
```

### Curated Ruleset

Create a signed ruleset for marketplace distribution:

```json
{
  "name": "custom-cloud-secrets",
  "version": "1.0.0",
  "description": "Detect custom cloud provider secrets",
  "author": "Your Organization",
  "rules": [
    {
      "id": "custom-cloud-access-key",
      "description": "Custom Cloud Access Key",
      "pattern": "CC_[A-Z0-9]{20}",
      "severity": "high"
    },
    {
      "id": "custom-cloud-secret",
      "description": "Custom Cloud Secret Key",
      "pattern": "CS_[A-Za-z0-9+/]{40}",
      "severity": "high"
    }
  ],
  "tags": ["cloud", "custom"],
  "license": "MIT"
}
```

Save as `.sentinel_rulesets/custom-cloud-secrets.ruleset.json` and use:

```powershell
sentinel --rulesets custom-cloud-secrets
```

---

## Error Handling Utilities

### withRetry

Retry a function with exponential backoff.

```typescript
import { withRetry } from './errorHandling.js';

const result = await withRetry(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  {
    maxRetries: 3,              // Number of retries (default: 3)
    initialDelayMs: 1000,       // Initial delay (default: 1000)
    maxDelayMs: 30000,          // Max delay (default: 30000)
    backoffMultiplier: 2,       // Backoff multiplier (default: 2)
    retryableErrors: [          // Custom retryable errors
      'ETIMEDOUT',
      'ECONNRESET',
    ],
    onRetry: (err, attempt) => {
      console.warn(`Retry ${attempt}: ${err.message}`);
    },
  }
);
```

### CircuitBreaker

Prevent cascading failures with circuit breaker pattern.

```typescript
import { CircuitBreaker } from './errorHandling.js';

const breaker = new CircuitBreaker(
  5,      // Failure threshold
  60000   // Reset timeout (ms)
);

try {
  const result = await breaker.execute(async () => {
    return await callUnreliableService();
  });
} catch (err) {
  if (err.message === 'Circuit breaker is open') {
    // Service is unavailable, use fallback
    return fallbackData;
  }
  throw err;
}
```

### maskError

Remove secrets from error messages for safe logging.

```typescript
import { maskError } from './errorHandling.js';

try {
  await storeSecret('AKIA1234567890ABCDEF');
} catch (err) {
  const masked = maskError(err as Error);
  console.error(masked.message); // Secrets replaced with ***REDACTED***
}
```

Masks the following secret patterns:
- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_...`, `ghs_...`)
- JWT tokens (`eyJ...`)
- Stripe keys (`sk_live_...`)
- Generic long alphanumeric strings (20+ chars)

### withTimeout

Timeout wrapper for long-running operations.

```typescript
import { withTimeout } from './errorHandling.js';

try {
  const result = await withTimeout(
    async () => {
      return await slowOperation();
    },
    5000,  // Timeout in ms
    'Operation took too long'  // Custom error message
  );
} catch (err) {
  console.error(err.message); // "Operation took too long"
}
```

### safeJsonParse

Safe JSON parsing with validation.

```typescript
import { safeJsonParse } from './errorHandling.js';

const data = safeJsonParse(
  jsonString,
  { default: 'fallback' },  // Fallback value
  (parsed) => {              // Optional validator
    return typeof parsed === 'object' && 'version' in parsed;
  }
);
```

---

## Configuration API

### Loading Configuration

```typescript
import { loadConfig } from './config.js';

const config = await loadConfig('/path/to/config.json');
```

### Configuration Schema

```typescript
type PatternDef = {
  id: string;
  description: string;
  pattern: string;
  severity?: 'low' | 'medium' | 'high';
  flags?: string;
};

type Config = {
  patterns: PatternDef[];
  // ... other config fields
};
```

### Policy Schema

```typescript
type Policy = {
  failOnFindings?: boolean;           // Exit non-zero if findings exist
  failThreshold?: number;             // Exit non-zero if findings > N
  failThresholdHigh?: number;         // Per-severity thresholds
  failThresholdMedium?: number;
  failThresholdLow?: number;
  minSeverity?: 'low' | 'medium' | 'high';  // Minimum severity to count
  ignore?: string[];                  // Ignore patterns (glob)
  rotator?: string;                   // Default rotator to use
  rotatorOptions?: Record<string, any>;  // Rotator-specific options
};
```

---

## Metrics & Monitoring

### Metrics Type

```typescript
type Metrics = {
  scanDurationMs: number;           // Total scan duration
  filesScanned: number;             // Number of files scanned
  findingsTotal: number;            // Total findings
  findingsHigh: number;             // High severity findings
  findingsMedium: number;           // Medium severity findings
  findingsLow: number;              // Low severity findings
  rotationsTotal: number;           // Total rotations performed
  rotationsSuccess: number;         // Successful rotations
  rotationsFailure: number;         // Failed rotations
  cacheHits: number;                // Cache hits
  cacheMisses: number;              // Cache misses
  mlEnrichments?: number;           // ML enrichments (if enabled)
  mlTimeoutMs?: number;             // ML timeout duration
};
```

### Creating Metrics

```typescript
import { newMetrics } from './metrics.js';

const metrics = newMetrics();
metrics.filesScanned = 100;
metrics.findingsTotal = 5;
```

### Prometheus Server

```typescript
import { startMetricsServer } from './server.js';

const server = startMetricsServer(
  9095,     // Port
  metrics   // Metrics object
);

// Later: close the server
server.close();
```

### Metrics Output Format

```prometheus
# Prometheus format
sentinel_scan_duration_ms 1234
sentinel_files_scanned 100
sentinel_findings_total 5
sentinel_findings_high 2
sentinel_findings_medium 3
sentinel_findings_low 0
sentinel_rotations_total 5
sentinel_rotations_success 5
sentinel_rotations_failure 0
sentinel_cache_hits 50
sentinel_cache_misses 50
```

---

## Audit Logging

### Audit Event

```typescript
type AuditEvent = Record<string, any>;
```

Typical audit event structure:

```json
{
  "timestamp": "2025-11-13T12:34:56.789Z",
  "event": "rotation",
  "rotator": "backend",
  "file": "/path/to/file.txt",
  "line": 42,
  "rule": "aws-access-key",
  "severity": "high",
  "success": true
}
```

### Writing Audit Events

```typescript
import { writeAuditEvent } from './audit.js';

await writeAuditEvent('/path/to/audit.ndjson', {
  timestamp: new Date().toISOString(),
  event: 'rotation',
  rotator: 'custom-vault',
  file: finding.file,
  line: finding.line,
  rule: finding.rule,
  severity: finding.severity,
  success: true,
});
```

### HMAC Signing

Enable HMAC signing for audit events:

```powershell
export SENTINEL_AUDIT_KEY="your-secret-key"
sentinel --audit audit.ndjson
```

Audit events will include `hmac` field with SHA-256 signature.

---

## Best Practices

### 1. Error Handling

- Always wrap network calls with `withRetry`
- Use `maskError` before logging errors
- Implement fallback strategies with `withFallback`
- Set reasonable timeouts with `withTimeout`

### 2. Performance

- Use streaming for large files
- Implement caching where appropriate
- Batch operations when possible
- Use worker threads for CPU-intensive tasks

### 3. Security

- Never log raw secrets - use `maskError`
- Validate all external inputs
- Use atomic file operations for writes
- Implement proper access controls for vault integrations

### 4. Testing

- Write unit tests for all custom plugins
- Test error paths and retry logic
- Verify secret masking works correctly
- Test with various file sizes and formats

### 5. Documentation

- Document all configuration options
- Provide usage examples
- List all required dependencies
- Document breaking changes in migrations

---

## Examples

See the `examples/` directory for complete working examples:

- `examples/rotators/` - Custom rotator implementations
- `examples/ml/` - Machine learning integration examples
- `examples/nbext/` - Jupyter Notebook extension

For more information, see:
- [README.md](./README.md) - Usage guide
- [SECURITY.md](./SECURITY.md) - Security policy
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [MIGRATION.md](./MIGRATION.md) - Migration guides
