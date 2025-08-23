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

  log(l: LogLevel, message: string, meta?: Record<string, any>) {
    if (!this.shouldLog(l)) return;
    if (this.json) {
      const out = { ts: new Date().toISOString(), level: l, message, ...meta };
      console.log(JSON.stringify(out));
    } else {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`[${l.toUpperCase()}] ${message}${metaStr}`);
    }
  }

  error(msg: string, meta?: Record<string, any>) { this.log('error', msg, meta); }
  warn(msg: string, meta?: Record<string, any>) { this.log('warn', msg, meta); }
  info(msg: string, meta?: Record<string, any>) { this.log('info', msg, meta); }
  debug(msg: string, meta?: Record<string, any>) { this.log('debug', msg, meta); }
}

export function createLogger(opts?: { json?: boolean; level?: LogLevel }) {
  return new Logger(opts);
}
