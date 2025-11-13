import { describe, it, expect } from 'vitest';
import {
  validateFilePath,
  validateSecretKey,
  validateUrl,
  validateRegexPattern,
  sanitizeForLog,
  validateInteger,
  validateEnvVarName,
  validateHmacKey,
} from '../src/validation.js';

describe('Input Validation', () => {
  describe('validateFilePath', () => {
    it('should accept valid file paths', () => {
      expect(validateFilePath('src/index.ts').valid).toBe(true);
      expect(validateFilePath('test/data/file.txt').valid).toBe(true);
      expect(validateFilePath('./config.json').valid).toBe(true);
    });

    it('should reject directory traversal attempts', () => {
      expect(validateFilePath('../../../etc/passwd').valid).toBe(false);
      expect(validateFilePath('src/../../../etc/passwd').valid).toBe(false);
      expect(validateFilePath('..').valid).toBe(false);
    });

    it('should reject null bytes', () => {
      expect(validateFilePath('file\0.txt').valid).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(validateFilePath(null as any).valid).toBe(false);
      expect(validateFilePath(undefined as any).valid).toBe(false);
      expect(validateFilePath(123 as any).valid).toBe(false);
    });
  });

  describe('validateSecretKey', () => {
    it('should accept valid keys', () => {
      expect(validateSecretKey('my-secret-key').valid).toBe(true);
      expect(validateSecretKey('secret_123').valid).toBe(true);
      expect(validateSecretKey('api.key.prod').valid).toBe(true);
    });

    it('should reject keys with invalid characters', () => {
      expect(validateSecretKey('key with spaces').valid).toBe(false);
      expect(validateSecretKey('key/with/slashes').valid).toBe(false);
      expect(validateSecretKey('key@special').valid).toBe(false);
    });

    it('should reject empty keys', () => {
      expect(validateSecretKey('').valid).toBe(false);
      expect(validateSecretKey(null as any).valid).toBe(false);
    });

    it('should reject keys exceeding max length', () => {
      const longKey = 'a'.repeat(256);
      expect(validateSecretKey(longKey).valid).toBe(false);
    });

    it('should reject reserved names', () => {
      expect(validateSecretKey('..').valid).toBe(false);
      expect(validateSecretKey('.').valid).toBe(false);
      expect(validateSecretKey('CON').valid).toBe(false);
      expect(validateSecretKey('NUL').valid).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTP(S) URLs', () => {
      expect(validateUrl('https://example.com').valid).toBe(true);
      expect(validateUrl('http://api.example.com/v1').valid).toBe(true);
    });

    it('should reject non-HTTP(S) protocols by default', () => {
      expect(validateUrl('ftp://example.com').valid).toBe(false);
      expect(validateUrl('file:///etc/passwd').valid).toBe(false);
    });

    it('should allow custom protocols', () => {
      const result = validateUrl('ftp://example.com', ['ftp']);
      expect(result.valid).toBe(true);
    });

    it('should reject private IPs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(validateUrl('http://localhost:8080').valid).toBe(false);
      expect(validateUrl('http://127.0.0.1').valid).toBe(false);
      expect(validateUrl('http://192.168.1.1').valid).toBe(false);
      expect(validateUrl('http://10.0.0.1').valid).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow private IPs in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(validateUrl('http://localhost:8080').valid).toBe(true);
      expect(validateUrl('http://127.0.0.1').valid).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should sanitize URLs', () => {
      const result = validateUrl('https://example.com/path/../other');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not a url').valid).toBe(false);
      expect(validateUrl('').valid).toBe(false);
    });
  });

  describe('validateRegexPattern', () => {
    it('should accept valid regex patterns', () => {
      expect(validateRegexPattern('[a-z]+').valid).toBe(true);
      expect(validateRegexPattern('\\d{3}-\\d{4}').valid).toBe(true);
    });

    it('should reject invalid regex patterns', () => {
      expect(validateRegexPattern('[unclosed').valid).toBe(false);
      expect(validateRegexPattern('(missing paren').valid).toBe(false);
    });

    it('should warn about catastrophic backtracking', () => {
      const result = validateRegexPattern('(a+)+b');
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('catastrophic backtracking');
    });

    it('should reject patterns exceeding max length', () => {
      const longPattern = 'a'.repeat(10001);
      expect(validateRegexPattern(longPattern).valid).toBe(false);
    });
  });

  describe('sanitizeForLog', () => {
    it('should remove control characters', () => {
      const input = 'hello\x00\x01world\x7F';
      const sanitized = sanitizeForLog(input);
      expect(sanitized).toBe('helloworld');
      expect(sanitized).not.toContain('\x00');
    });

    it('should preserve newlines and tabs', () => {
      const input = 'line1\nline2\ttab';
      const sanitized = sanitizeForLog(input);
      expect(sanitized).toContain('\n');
      expect(sanitized).toContain('\t');
    });

    it('should truncate long strings', () => {
      const input = 'a'.repeat(2000);
      const sanitized = sanitizeForLog(input, 1000);
      expect(sanitized.length).toBeLessThan(input.length);
      expect(sanitized).toContain('truncated');
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeForLog(123 as any)).toBe('123');
      expect(sanitizeForLog(null as any)).toBe('null');
    });
  });

  describe('validateInteger', () => {
    it('should accept valid integers', () => {
      expect(validateInteger(42).valid).toBe(true);
      expect(validateInteger('100').valid).toBe(true);
      expect(validateInteger(0).valid).toBe(true);
    });

    it('should reject non-integers', () => {
      expect(validateInteger(3.14).valid).toBe(false);
      expect(validateInteger('abc').valid).toBe(false);
      expect(validateInteger(NaN).valid).toBe(false);
    });

    it('should enforce min/max bounds', () => {
      expect(validateInteger(5, 1, 10).valid).toBe(true);
      expect(validateInteger(0, 1, 10).valid).toBe(false);
      expect(validateInteger(15, 1, 10).valid).toBe(false);
    });

    it('should include field name in error message', () => {
      const result = validateInteger(3.14, undefined, undefined, 'port');
      expect(result.error).toContain('port');
    });

    it('should return parsed value', () => {
      const result = validateInteger('42');
      expect(result.value).toBe(42);
    });
  });

  describe('validateEnvVarName', () => {
    it('should accept valid environment variable names', () => {
      expect(validateEnvVarName('PATH').valid).toBe(true);
      expect(validateEnvVarName('MY_VAR_123').valid).toBe(true);
      expect(validateEnvVarName('_UNDERSCORE').valid).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(validateEnvVarName('123VAR').valid).toBe(false); // starts with number
      expect(validateEnvVarName('VAR-NAME').valid).toBe(false); // contains dash
      expect(validateEnvVarName('VAR.NAME').valid).toBe(false); // contains dot
      expect(validateEnvVarName('VAR NAME').valid).toBe(false); // contains space
    });

    it('should reject empty names', () => {
      expect(validateEnvVarName('').valid).toBe(false);
      expect(validateEnvVarName(null as any).valid).toBe(false);
    });

    it('should reject names exceeding max length', () => {
      const longName = 'A'.repeat(256);
      expect(validateEnvVarName(longName).valid).toBe(false);
    });
  });

  describe('validateHmacKey', () => {
    it('should accept valid HMAC keys', () => {
      expect(validateHmacKey('my-secret-key-1234').valid).toBe(true);
      expect(validateHmacKey(Buffer.from('secret-key-bytes')).valid).toBe(true);
    });

    it('should reject short keys', () => {
      expect(validateHmacKey('short').valid).toBe(false);
      expect(validateHmacKey(Buffer.from('short')).valid).toBe(false);
    });

    it('should reject empty keys', () => {
      expect(validateHmacKey('').valid).toBe(false);
      expect(validateHmacKey(Buffer.from('')).valid).toBe(false);
    });
  });
});
