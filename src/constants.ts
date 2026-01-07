/**
 * Application-wide constants
 */

// Concurrency settings
export const DEFAULT_SCAN_CONCURRENCY = 8;
export const DEFAULT_ROTATE_CONCURRENCY = 4;
export const MIN_CONCURRENCY = 1;

// Cache settings
export const CACHE_VERSION = 2;
export const DEFAULT_CACHE_MODE = 'mtime' as const;

// File size limits
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_SECRET_KEY_LENGTH = 255;

// Retry settings
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_INITIAL_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 30000;
export const DEFAULT_BACKOFF_MULTIPLIER = 2;

// Circuit breaker settings
export const DEFAULT_CIRCUIT_THRESHOLD = 5;
export const DEFAULT_CIRCUIT_TIMEOUT_MS = 60000;
export const DEFAULT_CIRCUIT_HALF_OPEN_ATTEMPTS = 1;

// Metrics server
export const DEFAULT_METRICS_PORT = 9095;

// Severity rankings
export const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

// Worker thread settings
export const DEFAULT_WORKER_COUNT = 0; // 0 means no workers

// Timeout settings
export const DEFAULT_ML_TIMEOUT_MS = 5000;
export const DEFAULT_SCAN_TIMEOUT_MS = 30000;

// Regex engine
export const SUPPORTED_REGEX_ENGINES = ['native', 're2'] as const;
export const DEFAULT_REGEX_ENGINE = 'native' as const;
