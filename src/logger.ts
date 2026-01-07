export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
  private json: boolean;
  private levelPriority: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
  private currentLevel: LogLevel;

  constructor(opts?: { json?: boolean; level?: LogLevel }) {
    this.json = !!opts?.json;
    this.currentLevel = opts?.level || 'info';
  }

  private shouldLog(l: LogLevel) {
    return this.levelPriority[l] <= this.levelPriority[this.currentLevel];
  }

  log(l: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog(l)) return;
    if (this.json) {
      const out = { ts: new Date().toISOString(), level: l, message, ...meta };
      console.log(JSON.stringify(out));
    } else {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`[${l.toUpperCase()}] ${message}${metaStr}`);
    }
  }

  error(msg: string, meta?: Record<string, unknown>) {
    this.log('error', msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.log('warn', msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.log('info', msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>) {
    this.log('debug', msg, meta);
  }

  /**
   * Update logger configuration at runtime
   */
  configure(opts: { json?: boolean; level?: LogLevel }) {
    if (opts.json !== undefined) this.json = opts.json;
    if (opts.level !== undefined) this.currentLevel = opts.level;
  }
}

export function createLogger(opts?: { json?: boolean; level?: LogLevel }) {
  return new Logger(opts);
}

// Global logger instance for convenience
let globalLogger: Logger | undefined;

/**
 * Get or create the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    const debugMode = process.env.SENTINEL_DEBUG === 'true';
    globalLogger = new Logger({
      level: debugMode ? 'debug' : 'info',
      json: false,
    });
  }
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setLogger(logger: Logger) {
  globalLogger = logger;
}
