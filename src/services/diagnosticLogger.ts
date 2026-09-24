export type DiagnosticLevel = 'info' | 'warn' | 'error';

export type DiagnosticEntry = {
  timestamp: string;
  level: DiagnosticLevel;
  scope: string;
  message: string;
  details?: unknown;
};

const STORAGE_KEY = 'gestao360_diagnostic_logs';
const MAX_ENTRIES = 100;
const SENSITIVE_KEY = /password|senha|token|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|credential/i;
const SENSITIVE_VALUE = /bearer\s+[a-z0-9._-]+|(?:password|senha|token|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;

function redactString(value: string) {
  return value.replace(SENSITIVE_VALUE, '[REDACTED]');
}

export function safeSerialize(value: unknown, seen = new WeakSet<object>(), key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: redactString(value.name),
      message: redactString(value.message),
      stack: redactString(value.stack || ''),
    };
  }

  if (Array.isArray(value)) return value.map(item => safeSerialize(item, seen));

  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    safeSerialize(entryValue, seen, entryKey),
  ]));
}

export const diagnosticLogger = {
  log(level: DiagnosticLevel, scope: string, message: string, details?: unknown) {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope: redactString(scope),
      message: redactString(message),
      details: details === undefined ? undefined : safeSerialize(details),
    };

    try {
      const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DiagnosticEntry[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...previous, entry].slice(-MAX_ENTRIES)));
    } catch {
      // Logging must never interrupt the application flow.
    }

    const output = `[${entry.scope}] ${entry.message}`;
    if (level === 'error') console.error(output, entry.details ?? '');
    else if (level === 'warn') console.warn(output, entry.details ?? '');
    else console.info(output, entry.details ?? '');
  },

  info(scope: string, message: string, details?: unknown) {
    this.log('info', scope, message, details);
  },

  warn(scope: string, message: string, details?: unknown) {
    this.log('warn', scope, message, details);
  },

  error(scope: string, message: string, details?: unknown) {
    this.log('error', scope, message, details);
  },

  getEntries(): DiagnosticEntry[] {
    try {
      const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DiagnosticEntry[];
      return entries.map(entry => ({
        ...entry,
        scope: redactString(String(entry.scope || '')),
        message: redactString(String(entry.message || '')),
        details: entry.details === undefined ? undefined : safeSerialize(entry.details),
      }));
    } catch {
      return [];
    }
  },
};

export function installGlobalDiagnosticLogging() {
  window.addEventListener('error', (event) => {
    diagnosticLogger.error('global-error', event.message || 'Erro não tratado na janela', {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    diagnosticLogger.error('unhandled-rejection', 'Promise rejeitada sem tratamento', event.reason);
  });

  diagnosticLogger.info('diagnostics', 'Diagnóstico global iniciado', { userAgent: navigator.userAgent });
}

export const DIAGNOSTIC_STORAGE_KEY = STORAGE_KEY;
