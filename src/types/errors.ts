/**
 * Type-safe error handling utilities
 */

/**
 * Type guard to check if a value is an Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Convert unknown error to Error instance
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  if (typeof error === 'object' && error !== null) {
    return new Error(JSON.stringify(error));
  }
  return new Error(String(error));
}

/**
 * Safely get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Node.js system error with code
 */
export interface NodeError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
}

/**
 * Type guard for Node.js system errors
 */
export function isNodeError(error: unknown): error is NodeError {
  return isError(error) && 'code' in error;
}

/**
 * HTTP response error
 */
export interface HttpError extends Error {
  statusCode?: number;
  response?: {
    status: number;
    statusText: string;
    data?: unknown;
  };
}

/**
 * Type guard for HTTP errors
 */
export function isHttpError(error: unknown): error is HttpError {
  return isError(error) && ('statusCode' in error || 'response' in error);
}
