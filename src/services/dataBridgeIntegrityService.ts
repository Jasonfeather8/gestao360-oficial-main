import { supabase } from '@/integrations/supabase/client';
import { diagnosticLogger } from './diagnosticLogger';

export type IntegrityStrategy = 'direct' | 'nested' | 'raw';
export type IntegrityFailureCategory =
  | 'Falha de Tipagem'
  | 'Linhas bloqueadas por RLS'
  | 'Cache de Schema dessincronizado'
  | 'Erro de consulta';

export type IntegrityTrace = {
  scanId: string;
  entityId: string;
  strategy: IntegrityStrategy;
  table: 'profiles';
  select: string;
  filters: Record<string, string>;
  options?: { count?: 'exact'; head?: boolean };
  timestamp: string;
};

export type IntegrityFailure = {
  category: IntegrityFailureCategory;
  message: string;
  code?: string;
};

export type IntegrityStrategyResult = {
  strategy: IntegrityStrategy;
  trace: IntegrityTrace;
  durationMs: number;
  count: number | null;
  status: 'success' | 'error';
  result: unknown;
  error?: IntegrityFailure;
};

export type MismatchReport = {
  databaseCount: number | null;
  databaseCountSource: 'direct' | 'raw' | 'unavailable';
  uiCount: number | null;
  mismatch: boolean;
  severity: 'normal' | 'warning' | 'critical';
  message: string;
  countsByStrategy: Record<IntegrityStrategy, number | null>;
};

export type DataBridgeIntegrityResult = {
  scanId: string;
  entityId: string;
  startedAt: string;
  finishedAt: string;
  strategies: IntegrityStrategyResult[];
  mismatchReport: MismatchReport;
  connectionStatus: 'connected' | 'partial' | 'failed';
  permissionStatus: 'validated' | 'blocked' | 'unknown';
};

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const SCOPE = 'data-bridge-integrity';
const DIRECT_SELECT = 'id,nome,email,role,status';
const NESTED_SELECT = 'id,nome,email,role,status,auditoria_logs(id,acao,tabela_afetada,registro_id,data_hora)';

function safeErrorMessage(error: SupabaseErrorLike | unknown) {
  const value = error && typeof error === 'object' ? error as SupabaseErrorLike : { message: String(error) };
  const message = value.message || 'Erro sem mensagem retornado pela consulta';
  return message
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/((?:password|senha|token|secret|authorization|cookie|credential|api[-_ ]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

function classifyError(error: SupabaseErrorLike | unknown): IntegrityFailure {
  const value = error && typeof error === 'object' ? error as SupabaseErrorLike : {};
  const searchable = `${value.code || ''} ${value.message || ''} ${value.details || ''} ${value.hint || ''}`.toLocaleLowerCase();
  let category: IntegrityFailureCategory = 'Erro de consulta';

  if (/42501|permission denied|row level security|rls/.test(searchable)) {
    category = 'Linhas bloqueadas por RLS';
  } else if (/relationship|schema cache|column .*not found|column .*does not exist|could not find|foreign key/.test(searchable)) {
    category = 'Cache de Schema dessincronizado';
  } else if (/invalid input syntax|uuid|cast|operator does not exist|type .* mismatch/.test(searchable)) {
    category = 'Falha de Tipagem';
  }

  return {
    category,
    message: safeErrorMessage(error),
    ...(value.code ? { code: value.code } : {}),
  };
}

function createTrace(
  scanId: string,
  entityId: string,
  strategy: IntegrityStrategy,
  select: string,
  options?: IntegrityTrace['options'],
): IntegrityTrace {
  return {
    scanId,
    entityId,
    strategy,
    table: 'profiles',
    select,
    filters: { id: entityId },
    ...(options ? { options } : {}),
    timestamp: new Date().toISOString(),
  };
}

async function runStrategy(
  scanId: string,
  entityId: string,
  strategy: IntegrityStrategy,
  query: () => Promise<{ data: any; error: SupabaseErrorLike | null; count?: number | null }>,
  select: string,
  options?: IntegrityTrace['options'],
): Promise<IntegrityStrategyResult> {
  const trace = createTrace(scanId, entityId, strategy, select, options);
  diagnosticLogger.info(SCOPE, 'Execution trace: consulta iniciada', trace);
  const startedAt = performance.now();

  try {
    const response = await query();
    const durationMs = Math.round(performance.now() - startedAt);
    if (response.error) {
      const failure = classifyError(response.error);
      diagnosticLogger.error(SCOPE, 'Consulta do Data-Bridge falhou', { ...trace, durationMs, count: response.count ?? null, error: failure });
      return { strategy, trace, durationMs, count: response.count ?? null, status: 'error', result: null, error: failure };
    }

    const count = response.count ?? (response.data ? 1 : 0);
    diagnosticLogger.info(SCOPE, 'Consulta do Data-Bridge concluída', {
      ...trace,
      durationMs,
      count,
      result: { hasData: response.data !== null && response.data !== undefined },
    });
    return { strategy, trace, durationMs, count, status: 'success', result: response.data };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const failure = classifyError(error);
    diagnosticLogger.error(SCOPE, 'Consulta do Data-Bridge rejeitada', { ...trace, durationMs, count: null, error: failure });
    return { strategy, trace, durationMs, count: null, status: 'error', result: null, error: failure };
  }
}

export async function deepScanEntity(entityId: string, uiCount: number | null): Promise<DataBridgeIntegrityResult> {
  const normalizedEntityId = String(entityId).trim();
  const scanId = `dbip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  diagnosticLogger.info(SCOPE, 'Deep scan iniciado antes da exclusão', { scanId, entityId: normalizedEntityId, uiCount });

  const [direct, nested, raw] = await Promise.all([
    runStrategy(scanId, normalizedEntityId, 'direct', async () => {
      const { data, error } = await supabase.from('profiles').select(DIRECT_SELECT).eq('id', normalizedEntityId).maybeSingle();
      return { data, error, count: data ? 1 : 0 };
    }, DIRECT_SELECT),
    runStrategy(scanId, normalizedEntityId, 'nested', async () => {
      const { data, error } = await supabase.from('profiles').select(NESTED_SELECT).eq('id', normalizedEntityId).maybeSingle();
      return { data, error, count: data ? 1 : 0 };
    }, NESTED_SELECT),
    runStrategy(scanId, normalizedEntityId, 'raw', async () => {
      const { data, error, count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).filter('id', 'eq', String(normalizedEntityId));
      return { data, error, count };
    }, 'id', { count: 'exact', head: true }),
  ]);

  const countsByStrategy = { direct: direct.count, nested: nested.count, raw: raw.count } satisfies Record<IntegrityStrategy, number | null>;
  const databaseCountSource: MismatchReport['databaseCountSource'] = raw.count !== null ? 'raw' : direct.count !== null ? 'direct' : 'unavailable';
  const databaseCount = databaseCountSource === 'raw' ? raw.count : databaseCountSource === 'direct' ? direct.count : null;
  const mismatch = databaseCount !== null && uiCount !== null && databaseCount !== uiCount;
  const criticalMismatch = databaseCount !== null && databaseCount > 0 && uiCount === 0;
  const mismatchReport: MismatchReport = {
    databaseCount,
    databaseCountSource,
    uiCount,
    mismatch,
    severity: criticalMismatch ? 'critical' : mismatch ? 'warning' : 'normal',
    message: criticalMismatch ? 'Ponte de Dados Quebrada' : mismatch ? 'Divergência entre registros no banco e na UI' : 'Contagem do banco e da UI consistente',
    countsByStrategy,
  };
  const finishedAt = new Date().toISOString();
  const hasRlsFailure = [direct, nested, raw].some(item => item.error?.category === 'Linhas bloqueadas por RLS');
  const successfulQueries = [direct, nested, raw].filter(item => item.status === 'success').length;
  const result: DataBridgeIntegrityResult = {
    scanId,
    entityId: normalizedEntityId,
    startedAt,
    finishedAt,
    strategies: [direct, nested, raw],
    mismatchReport,
    connectionStatus: successfulQueries === 3 ? 'connected' : successfulQueries > 0 ? 'partial' : 'failed',
    permissionStatus: hasRlsFailure ? 'blocked' : successfulQueries > 0 ? 'validated' : 'unknown',
  };

  const scanLogDetails = {
    scanId,
    entityId: normalizedEntityId,
    durationMs: Math.round(new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    connectionStatus: result.connectionStatus,
    mismatchReport,
    failedStrategies: [direct, nested, raw]
      .filter(strategy => strategy.status === 'error')
      .map(strategy => ({ strategy: strategy.strategy, error: strategy.error })),
  };
  if (successfulQueries === 3) {
    diagnosticLogger.info(SCOPE, 'Deep scan concluído antes da exclusão', scanLogDetails);
  } else {
    diagnosticLogger.error(SCOPE, 'Deep scan concluído com falhas antes da exclusão', scanLogDetails);
  }
  return result;
}

export const integrityStrategyLabels: Record<IntegrityStrategy, string> = {
  direct: 'Busca Direta',
  nested: 'Busca por Relacionamento / Nested Join',
  raw: 'Busca por Filtro Bruto',
};
