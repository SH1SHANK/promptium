export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

const PREFIX = '[Promptium]';

function write(level: LogLevel, scope: string, message: string, details?: unknown): void {
  const entry = `${PREFIX}[${scope}] ${message}`;
  const output = details === undefined ? [entry] : [entry, details];

  if (level === 'debug') {
    console.debug(...output);
    return;
  }

  if (level === 'info') {
    console.info(...output);
    return;
  }

  if (level === 'warn') {
    console.warn(...output);
    return;
  }

  console.error(...output);
}

export function createLogger(scope: string): Logger {
  const safeScope = String(scope || 'Core').replace(/[^\w:-]/g, '');
  return {
    debug: (message, details) => write('debug', safeScope, message, details),
    info: (message, details) => write('info', safeScope, message, details),
    warn: (message, details) => write('warn', safeScope, message, details),
    error: (message, details) => write('error', safeScope, message, details),
  };
}
