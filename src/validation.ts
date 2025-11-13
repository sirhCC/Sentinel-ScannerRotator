/**
 * Input validation and sanitization utilities for security hardening
 */

/**
 * Validate file path to prevent directory traversal attacks
 */
export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path must be a non-empty string' };
  }

  // Check for null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'File path contains null bytes' };
  }

  // Check for directory traversal attempts
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('../') || normalized.includes('/..') || normalized === '..') {
    return { valid: false, error: 'Directory traversal not allowed' };
  }

  // Check for absolute paths trying to escape workspace (Windows drive letters)
  if (/^[a-zA-Z]:[/\\]\.\./.test(filePath)) {
    return { valid: false, error: 'Directory traversal not allowed' };
  }

  return { valid: true };
}

/**
 * Validate secret key name (alphanumeric, dashes, underscores, dots)
 */
export function validateSecretKey(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Key must be a non-empty string' };
  }

  if (key.length > 255) {
    return { valid: false, error: 'Key length exceeds maximum (255 characters)' };
  }

  // Only allow safe characters for secret keys
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
    return { valid: false, error: 'Key contains invalid characters (use only alphanumeric, underscore, dash, dot)' };
  }

  // Prevent reserved names
  const reserved = ['..', '.', 'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
  if (reserved.includes(key.toUpperCase())) {
    return { valid: false, error: 'Key uses reserved name' };
  }

  return { valid: true };
}

/**
 * Validate and sanitize URL
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['http', 'https']): { valid: boolean; error?: string; sanitized?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(url);
    
    if (!allowedProtocols.includes(parsed.protocol.replace(':', ''))) {
      return { valid: false, error: `Protocol ${parsed.protocol} not allowed` };
    }

    // Check for localhost/private IPs in production (potential SSRF)
    const hostname = parsed.hostname.toLowerCase();
    const privatePatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^::1$/,
      /^fe80:/i,
    ];

    const isPrivate = privatePatterns.some(pattern => pattern.test(hostname));
    if (isPrivate && process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'Private/localhost URLs not allowed in production' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch (err) {
    return { valid: false, error: `Invalid URL: ${(err as Error).message}` };
  }
}

/**
 * Validate regex pattern (check for catastrophic backtracking)
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string; warnings?: string[] } {
  if (!pattern || typeof pattern !== 'string') {
    return { valid: false, error: 'Pattern must be a non-empty string' };
  }

  if (pattern.length > 10000) {
    return { valid: false, error: 'Pattern exceeds maximum length (10000 characters)' };
  }

  const warnings: string[] = [];

  // Check for potentially dangerous patterns (ReDoS)
  // Pattern: (x+)+ or (x*)+  or (x+)* etc - nested quantifiers
  if (/\([^)]*[+*]\)[+*]/.test(pattern)) {
    warnings.push('Pattern contains nested quantifiers which may cause catastrophic backtracking');
  }

  // Pattern: *+ or +* or {n,}+
  if (/\*\+|\+\*|\{\d+,\}\+/.test(pattern)) {
    warnings.push('Pattern contains nested quantifiers which may cause catastrophic backtracking');
  }

  if (/\(.*\)\*/.test(pattern) && /\(.*\)+/.test(pattern)) {
    warnings.push('Pattern contains nested groups with multiple quantifiers');
  }

  // Try to compile the regex
  try {
    new RegExp(pattern);
    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  } catch (err) {
    return { valid: false, error: `Invalid regex: ${(err as Error).message}` };
  }
}

/**
 * Sanitize string for safe logging (remove control characters, limit length)
 */
export function sanitizeForLog(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return String(input).slice(0, maxLength);
  }

  // Remove control characters except newline and tab
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '... (truncated)';
  }

  return sanitized;
}

/**
 * Validate integer within range
 */
export function validateInteger(value: any, min?: number, max?: number, name: string = 'value'): { valid: boolean; error?: string; value?: number } {
  const num = Number(value);
  
  if (!Number.isInteger(num)) {
    return { valid: false, error: `${name} must be an integer` };
  }

  if (min !== undefined && num < min) {
    return { valid: false, error: `${name} must be >= ${min}` };
  }

  if (max !== undefined && num > max) {
    return { valid: false, error: `${name} must be <= ${max}` };
  }

  return { valid: true, value: num };
}

/**
 * Validate environment variable name
 */
export function validateEnvVarName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Environment variable name must be a non-empty string' };
  }

  // Must start with letter or underscore, contain only alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return { valid: false, error: 'Invalid environment variable name format' };
  }

  if (name.length > 255) {
    return { valid: false, error: 'Environment variable name too long' };
  }

  return { valid: true };
}

/**
 * Validate HMAC key
 */
export function validateHmacKey(key: string | Buffer): { valid: boolean; error?: string } {
  if (!key) {
    return { valid: false, error: 'HMAC key cannot be empty' };
  }

  const keyLength = typeof key === 'string' ? key.length : key.length;
  
  if (keyLength < 16) {
    return { valid: false, error: 'HMAC key too short (minimum 16 characters/bytes)' };
  }

  return { valid: true };
}
