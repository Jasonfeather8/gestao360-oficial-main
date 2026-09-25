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
const SENSITIVE_KEY = /(password|senha|token|secret|authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)/i;

function redactString(value: string) {
  return value
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/((?:password|senha|token|secret|authorization|api[-_ ]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

function serialize(details: unknown) {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: redactString(details.message),
      stack: details.stack ? redactString(details.stack) : undefined,
    };
  }
  try {
    return JSON.parse(JSON.stringify(details, (key, value) => {
      if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
      if (typeof value === 'string') return redactString(value);
      if (value instanceof Error) {
        return { name: value.name, message: redactString(value.message), stack: value.stack ? redactString(value.stack) : undefined };
      }
      return value;
    }));
  } catch {
    return redactString(String(details));
  }
}

export const diagnosticLogger = {
  log(level: DiagnosticLevel, scope: string, message: string, details?: unknown) {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message: redactString(message),
      details: details === undefined ? undefined : serialize(details),
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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DiagnosticEntry[];
    } catch {
      return [];
    }
  },

  clearEntries() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Logging must never interrupt the application flow.
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
