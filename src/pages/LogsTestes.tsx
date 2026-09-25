import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  FileJson,
  Filter,
  LoaderCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useUsuarios } from '../hooks/useData';
import IntegrityBanner from '../components/IntegrityBanner';
import {
  DataBridgeIntegrityResult,
  deepScanEntity,
  IntegrityFailure,
  IntegrityStrategy,
  integrityStrategyLabels,
} from '../services/dataBridgeIntegrityService';
import { DiagnosticEntry, diagnosticLogger } from '../services/diagnosticLogger';

const DATA_BRIDGE_SCOPE = 'data-bridge-integrity';

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard API indisponível');
}

function errorTone(category: IntegrityFailure['category']) {
  if (category === 'Linhas bloqueadas por RLS' || category === 'Falha de Tipagem') return 'border-red-200 bg-red-50 text-red-800';
  if (category === 'Cache de Schema dessincronizado') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-surface-border bg-surface-container text-on-surface-variant';
}

function strategyIcon(strategy: IntegrityStrategy) {
  if (strategy === 'raw') return <Filter className="h-4 w-4" />;
  if (strategy === 'nested') return <Activity className="h-4 w-4" />;
  return <Database className="h-4 w-4" />;
}

export default function LogsTestes() {
  const { data: usuarios = [], isLoading: isLoadingUsers } = useUsuarios();
  const [selectedId, setSelectedId] = useState('');
  const [manualId, setManualId] = useState('');
  const [uiCountText, setUiCountText] = useState('1');
  const [result, setResult] = useState<DataBridgeIntegrityResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [entries, setEntries] = useState<DiagnosticEntry[]>(() => diagnosticLogger.getEntries());
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<'events' | 'mismatch'>('events');
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    const refresh = () => setEntries(diagnosticLogger.getEntries());
    const unsubscribe = diagnosticLogger.subscribe(refresh);
    const interval = window.setInterval(refresh, 1000);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  const showFeedback = (message: string, error = false) => {
    setFeedback(message);
    setFeedbackError(error);
    window.setTimeout(() => {
      setFeedback('');
      setFeedbackError(false);
    }, 2600);
  };

  const filteredEntries = useMemo(() => entries
    .filter(entry => showAllLogs || entry.scope.toLocaleLowerCase().includes(DATA_BRIDGE_SCOPE))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [entries, showAllLogs]);

  const runDiagnostic = async () => {
    const entityId = manualId.trim() || selectedId.trim();
    if (!entityId) {
      showFeedback('Selecione um profile ou informe um ID manual.', true);
      return;
    }
    const parsedUiCount = uiCountText.trim() === '' ? null : Number(uiCountText);
    if (parsedUiCount !== null && (!Number.isInteger(parsedUiCount) || parsedUiCount < 0)) {
      showFeedback('Informe uma quantidade de registros na UI válida.', true);
      return;
    }

    setIsScanning(true);
    try {
      const scan = await deepScanEntity(entityId, parsedUiCount);
      setResult(scan);
      showFeedback('Diagnóstico concluído sem alterar dados.');
    } catch (error) {
      diagnosticLogger.error(DATA_BRIDGE_SCOPE, 'Deep scan falhou antes da exclusão', { entityId, error });
      showFeedback('Não foi possível concluir o diagnóstico.', true);
    } finally {
      setIsScanning(false);
    }
  };

  const copyWithFeedback = async (value: string, successMessage: string) => {
    try {
      await copyText(value);
      showFeedback(successMessage);
    } catch {
      showFeedback('Não foi possível copiar o JSON.', true);
    }
  };

  const clearLogs = () => {
    if (entries.length === 0) return;
    if (!window.confirm('Limpar todos os logs Data-Bridge salvos localmente? Esta ação não pode ser desfeita.')) return;
    diagnosticLogger.clearEntries();
    showFeedback('Logs limpos.');
  };

  const selectedUser = usuarios.find(user => user.id === selectedId);

  return (
    <div className="space-y-6 pb-28">
      <header className="rounded-2xl border border-surface-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><Activity className="h-6 w-6" /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Data-Bridge Integrity Probe</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-on-surface">Monitor de Integridade</h1>
            <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">Diagnóstico somente leitura da operação que antecederia a exclusão de um usuário. Nenhuma exclusão, alteração de profile ou alteração financeira é executada.</p>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-xs font-semibold leading-5">O código atual não possui um ponto de exclusão real de usuário. Este monitor apenas consulta <strong>profiles</strong> e a relação <strong>auditoria_logs</strong>; nunca informe senhas, tokens ou credenciais.</p>
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold ${feedbackError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} role="status">
          {feedbackError ? <XCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {feedback}
        </div>
      )}

      <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-black text-on-surface">Executar diagnóstico antes da exclusão</h2>
            <p className="mt-1 text-xs text-on-surface-variant">As três estratégias são executadas simultaneamente e somente leem public.profiles.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_160px_auto] lg:items-end">
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Profile / usuário</span>
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={isLoadingUsers} className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="">{isLoadingUsers ? 'Carregando profiles...' : 'Selecione um profile'}</option>
              {usuarios.map(user => <option key={user.id} value={user.id}>{user.nome || user.email} — {user.id}</option>)}
            </select>
            {selectedUser && <span className="block truncate text-[11px] text-on-surface-variant">{selectedUser.email} · {selectedUser.perfil}</span>}
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">ID manual (opcional)</span>
            <input value={manualId} onChange={event => setManualId(event.target.value)} placeholder="UUID do profile" className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Registros na UI</span>
            <input type="number" min="0" step="1" value={uiCountText} onChange={event => setUiCountText(event.target.value)} className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <button type="button" onClick={runDiagnostic} disabled={isScanning} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black uppercase tracking-wide text-on-primary shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
            {isScanning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            {isScanning ? 'Sondando...' : 'Executar diagnóstico antes da exclusão'}
          </button>
        </div>
      </section>

      <IntegrityBanner result={result} />

      {result && (
        <>
          <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-on-surface">Execution trace e resultados</h2>
                <p className="mt-1 text-xs text-on-surface-variant">Scan {result.scanId} · ID {result.entityId} · concluído em {formatDate(result.finishedAt)}</p>
              </div>
              <button type="button" onClick={() => copyWithFeedback(json(result), 'Resultado completo copiado em JSON.')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-surface-border px-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container"><FileJson className="h-4 w-4" />Copiar resultado JSON</button>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {result.strategies.map(strategy => <StrategyCard key={strategy.strategy} strategy={strategy} />)}
            </div>
          </section>

          <section className={`rounded-2xl border p-5 shadow-sm ${result.mismatchReport.severity === 'critical' ? 'border-red-300 bg-red-50' : 'border-surface-border bg-surface'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {result.mismatchReport.severity === 'critical' ? <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />}
                <div>
                  <h2 className="text-base font-black text-on-surface">Mismatch Report</h2>
                  <p className={`mt-1 text-sm font-black ${result.mismatchReport.severity === 'critical' ? 'text-red-700' : 'text-on-surface'}`}>{result.mismatchReport.message}</p>
                </div>
              </div>
              <button type="button" onClick={() => copyWithFeedback(json(result.mismatchReport), 'Mismatch Report copiado em JSON.')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-surface-border px-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container"><Copy className="h-4 w-4" />Copiar report</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <ReportValue label="databaseCount" value={String(result.mismatchReport.databaseCount ?? '—')} />
              <ReportValue label="uiCount" value={String(result.mismatchReport.uiCount ?? '—')} />
              <ReportValue label="mismatch" value={String(result.mismatchReport.mismatch)} />
              <ReportValue label="severity" value={result.mismatchReport.severity} />
              <ReportValue label="count source" value={result.mismatchReport.databaseCountSource} />
            </div>
            <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-surface-container-low p-4 font-mono text-[11px] leading-5 text-on-surface-variant">{json(result.mismatchReport)}</pre>
          </section>
        </>
      )}

      <section className="fixed bottom-4 right-4 z-30 w-[min(92vw,720px)] overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-surface-container-low px-4 py-3">
          <button type="button" onClick={() => setIsPanelOpen(open => !open)} className="flex min-w-0 items-center gap-2 text-left">
            <Activity className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-xs font-black uppercase tracking-wider text-on-surface">Monitor administrativo flutuante</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">{filteredEntries.length}</span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => copyWithFeedback(json(filteredEntries), 'Eventos filtrados copiados em JSON.')} disabled={filteredEntries.length === 0} title="Copiar Tudo" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-surface-border px-2 text-[10px] font-black text-on-surface-variant hover:bg-surface disabled:opacity-40"><Clipboard className="h-3.5 w-3.5" />Copiar Tudo</button>
            <button type="button" onClick={clearLogs} disabled={entries.length === 0} title="Limpar logs" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-2 text-[10px] font-black text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Limpar logs</button>
          </div>
        </div>
        {isPanelOpen && <>
          <div role="tablist" aria-label="Monitor administrativo" className="flex border-b border-surface-border px-3 pt-2">
            <button type="button" role="tab" aria-selected={panelTab === 'events'} onClick={() => setPanelTab('events')} className={`border-b-2 px-3 py-2 text-[10px] font-black uppercase tracking-wide ${panelTab === 'events' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Eventos</button>
            <button type="button" role="tab" aria-selected={panelTab === 'mismatch'} onClick={() => setPanelTab('mismatch')} className={`border-b-2 px-3 py-2 text-[10px] font-black uppercase tracking-wide ${panelTab === 'mismatch' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Mismatch Report</button>
          </div>
          {panelTab === 'events' ? <>
            <div className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-on-surface-variant"><input type="checkbox" checked={!showAllLogs} onChange={event => setShowAllLogs(!event.target.checked)} className="accent-primary" />Filtrar logs Data-Bridge</label>
              <button type="button" onClick={() => setEntries(diagnosticLogger.getEntries())} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary"><RefreshCw className="h-3 w-3" />Atualizar</button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto p-3">
              {filteredEntries.length === 0 ? <p className="px-2 py-8 text-center text-xs text-on-surface-variant">Nenhum evento Data-Bridge registrado.</p> : filteredEntries.map((entry, index) => <LogRow key={`${entry.timestamp}-${index}`} entry={entry} onCopy={() => copyWithFeedback(json(entry), 'Evento copiado em JSON.')} />)}
            </div>
          </> : <div className="max-h-72 overflow-y-auto p-4">
            {!result ? <p className="px-2 py-8 text-center text-xs text-on-surface-variant">Nenhum Mismatch Report disponível. Execute um diagnóstico para gerar o primeiro report.</p> : <div className="space-y-3">
              <div className={`rounded-xl border p-3 ${result.mismatchReport.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-surface-border bg-surface-container-low'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">Último report · Scan {result.scanId}</p>
                    <p className={`mt-1 text-sm font-black ${result.mismatchReport.severity === 'critical' ? 'text-red-700' : 'text-on-surface'}`}>{result.mismatchReport.message}</p>
                  </div>
                  <button type="button" onClick={() => copyWithFeedback(json(result.mismatchReport), 'Mismatch Report copiado em JSON.')} title="Copiar Mismatch Report em JSON" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-surface-border px-2 text-[10px] font-black text-on-surface-variant hover:bg-surface"><Copy className="h-3.5 w-3.5" />Copiar JSON</button>
                </div>
                <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-surface p-3 font-mono text-[10px] leading-4 text-on-surface-variant">{json(result.mismatchReport)}</pre>
              </div>
            </div>}
          </div>}
        </>}
      </section>
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: DataBridgeIntegrityResult['strategies'][number] }) {
  const failed = strategy.status === 'error';
  return (
    <article className="rounded-xl border border-surface-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-on-surface">{strategyIcon(strategy.strategy)}{integrityStrategyLabels[strategy.strategy]}</div>
        {failed ? <XCircle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant"><span>Duração <strong className="text-on-surface">{strategy.durationMs} ms</strong></span><span>Count <strong className="text-on-surface">{strategy.count ?? '—'}</strong></span></div>
      {!strategy.error && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-low p-3 font-mono text-[10px] leading-4 text-on-surface-variant">{json({ trace: strategy.trace, result: strategy.result })}</pre>}
      {strategy.error && <div className={`mt-3 rounded-lg border p-3 text-[11px] ${errorTone(strategy.error.category)}`}><strong className="block">{strategy.error.category}</strong><span className="mt-1 block break-words">{strategy.error.message}</span>{strategy.error.code && <span className="mt-1 block font-mono">Código: {strategy.error.code}</span>}</div>}
    </article>
  );
}

function ReportValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-surface-border bg-background p-3"><span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">{label}</span><strong className="mt-1 block text-sm text-on-surface">{value}</strong></div>;
}

function LogRow({ entry, onCopy }: { entry: DiagnosticEntry; onCopy: () => void }) {
  return <article className="flex items-start gap-2 rounded-xl border border-surface-border bg-background p-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${entry.level === 'error' ? 'bg-red-500' : entry.level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`} /><span className="text-[10px] font-black text-on-surface-variant">{formatDate(entry.timestamp)}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">{entry.scope}</span></div><p className="mt-1 break-words text-xs font-bold text-on-surface">{entry.message}</p></div><button type="button" onClick={onCopy} title="Copiar evento em JSON" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-primary"><Copy className="h-4 w-4" /></button></article>;
}
