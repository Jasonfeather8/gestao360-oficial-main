import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clipboard,
  ClipboardList,
  Info,
  Play,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  DiagnosticEntry,
  DiagnosticLevel,
  diagnosticLogger,
} from '../services/diagnosticLogger';

const TEST_SCOPE = 'teste-01';
type ScopeFilter = typeof TEST_SCOPE | 'todos';

type LogDetails = {
  etapa?: unknown;
  acao?: unknown;
  detalhes?: unknown;
  [key: string]: unknown;
};

const levelLabels: Record<DiagnosticLevel, string> = {
  info: 'Informação',
  warn: 'Atenção',
  error: 'Erro',
};

function getDetails(entry: DiagnosticEntry): LogDetails | null {
  return entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details)
    ? entry.details as LogDetails
    : null;
}

function getStage(entry: DiagnosticEntry) {
  const details = getDetails(entry);
  return typeof details?.etapa === 'string' && details.etapa.trim() ? details.etapa : 'Não informada';
}

function getAction(entry: DiagnosticEntry) {
  const details = getDetails(entry);
  return typeof details?.acao === 'string' && details.acao.trim() ? details.acao : 'Não informada';
}

function formatDetails(entry: DiagnosticEntry) {
  const details = getDetails(entry);
  if (details) {
    if ('detalhes' in details && details.detalhes !== undefined) {
      if (typeof details.detalhes === 'string') return details.detalhes;
      return JSON.stringify(details.detalhes, null, 2);
    }
    const extraDetails = Object.fromEntries(
      Object.entries(details).filter(([key]) => key !== 'etapa' && key !== 'acao')
    );
    return Object.keys(extraDetails).length > 0 ? JSON.stringify(extraDetails, null, 2) : '';
  }
  if (entry.details === undefined) return '';
  if (typeof entry.details === 'string') return entry.details;
  return JSON.stringify(entry.details, null, 2);
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}

function copyEntry(entry: DiagnosticEntry) {
  const details = formatDetails(entry);
  return [
    `Data/hora: ${formatDate(entry.timestamp)}`,
    `Nível: ${levelLabels[entry.level] || entry.level}`,
    `Escopo: ${entry.scope}`,
    `Etapa: ${getStage(entry)}`,
    `Ação: ${getAction(entry)}`,
    `Mensagem: ${entry.message}`,
    `Detalhes: ${details || 'Não informado'}`,
  ].join('\n');
}

function levelClasses(level: DiagnosticLevel) {
  if (level === 'error') return 'border-red-200 bg-red-50 text-red-700';
  if (level === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function LevelIcon({ level }: { level: DiagnosticLevel }) {
  if (level === 'error') return <XCircle className="h-4 w-4" />;
  if (level === 'warn') return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export default function LogsTestes() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>(() => diagnosticLogger.getEntries());
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(TEST_SCOPE);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<DiagnosticLevel>('info');
  const [etapa, setEtapa] = useState('');
  const [acao, setAcao] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState('');
  const [feedback, setFeedback] = useState('');

  const refreshEntries = () => setEntries(diagnosticLogger.getEntries());

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return entries
      .filter(entry => scopeFilter === 'todos' || entry.scope === scopeFilter)
      .filter(entry => {
        if (!normalizedSearch) return true;
        const searchable = [
          entry.timestamp,
          entry.scope,
          entry.message,
          getStage(entry),
          getAction(entry),
          formatDetails(entry),
          levelLabels[entry.level] || entry.level,
        ].join(' ').toLocaleLowerCase('pt-BR');
        return searchable.includes(normalizedSearch);
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [entries, scopeFilter, search]);

  const showFeedback = (messageText: string) => {
    setFeedback(messageText);
    window.setTimeout(() => setFeedback(''), 2600);
  };

  const handleStartTest = () => {
    diagnosticLogger.info(TEST_SCOPE, 'Teste 01 iniciado', {
      etapa: 'Preparação',
      acao: 'Iniciar Teste 01',
    });
    refreshEntries();
    showFeedback('Início do Teste 01 registrado.');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    diagnosticLogger.log(level, TEST_SCOPE, trimmedMessage, {
      etapa: etapa.trim() || 'Não informada',
      acao: acao.trim() || 'Não informada',
      detalhes: details.trim() || undefined,
    });
    refreshEntries();
    setMessage('');
    setDetails('');
    showFeedback('Ocorrência registrada.');
  };

  const handleCopy = async () => {
    if (filteredEntries.length === 0) return;
    const text = filteredEntries.map(copyEntry).join('\n\n');
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API indisponível');
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) {
        showFeedback('Não foi possível copiar os logs.');
        return;
      }
    }
    showFeedback(`${filteredEntries.length} log(s) copiado(s).`);
  };

  const handleClear = () => {
    if (entries.length === 0) return;
    if (!window.confirm('Limpar todos os logs salvos localmente? Esta ação não pode ser desfeita.')) return;
    diagnosticLogger.clearEntries();
    refreshEntries();
    showFeedback('Logs limpos.');
  };

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em]">Conciliação Bancária</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface">Logs do Teste 01</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Registre e acompanhe ocorrências manuais da validação do Teste 01.</p>
        </div>
        <button
          type="button"
          onClick={handleStartTest}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wider text-on-primary shadow-sm transition hover:opacity-90"
        >
          <Play className="h-4 w-4" />
          Iniciar Teste 01
        </button>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-xs font-semibold leading-5">Não informe senhas, tokens, chaves ou outros segredos nos logs. O registro é salvo apenas no armazenamento local deste navegador.</p>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700" role="status">
          <Check className="h-4 w-4" />
          {feedback}
        </div>
      )}

      <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-black text-on-surface">Registrar ocorrência</h2>
          <p className="mt-1 text-xs text-on-surface-variant">Descreva o que aconteceu durante a execução, sem dados sensíveis.</p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Etapa</span>
            <input
              value={etapa}
              onChange={event => setEtapa(event.target.value)}
              placeholder="Ex.: Importação do extrato"
              className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Ação</span>
            <input
              value={acao}
              onChange={event => setAcao(event.target.value)}
              placeholder="Ex.: Conferir lançamentos"
              className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Nível</span>
            <select
              value={level}
              onChange={event => setLevel(event.target.value as DiagnosticLevel)}
              className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="info">Informação</option>
              <option value="warn">Atenção</option>
              <option value="error">Erro</option>
            </select>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Mensagem <span className="text-alert-red">*</span></span>
            <input
              required
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder="Descreva a ocorrência"
              className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Detalhes <span className="font-medium normal-case">(opcional)</span></span>
            <textarea
              value={details}
              onChange={event => setDetails(event.target.value)}
              placeholder="Contexto adicional, sem senhas ou tokens"
              rows={3}
              className="w-full resize-y rounded-xl border border-surface-border bg-background p-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex justify-end md:col-span-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wider text-on-primary transition hover:opacity-90"
            >
              Registrar ocorrência
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-base font-black text-on-surface">Eventos registrados</h2>
            <p className="mt-1 text-xs text-on-surface-variant">{filteredEntries.length} evento(s) exibido(s) de {entries.length} salvo(s).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshEntries}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-surface-border px-3 text-xs font-bold text-on-surface-variant transition hover:bg-surface-container"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={filteredEntries.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-surface-border px-3 text-xs font-bold text-on-surface-variant transition hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Clipboard className="h-4 w-4" />
              Copiar logs filtrados
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={entries.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Limpar
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Escopo</span>
            <select
              value={scopeFilter}
              onChange={event => setScopeFilter(event.target.value as ScopeFilter)}
              className="h-11 w-full rounded-xl border border-surface-border bg-background px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value={TEST_SCOPE}>Teste 01</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Buscar</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar por mensagem, etapa, ação ou detalhes"
                className="h-11 w-full rounded-xl border border-surface-border bg-background pl-9 pr-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </label>
        </div>

        <div className="space-y-3">
          {filteredEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border px-4 py-12 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-on-surface-variant/40" />
              <p className="mt-3 text-sm font-bold text-on-surface-variant">Nenhum evento encontrado</p>
              <p className="mt-1 text-xs text-on-surface-variant/70">Inicie o Teste 01 ou registre uma ocorrência manual.</p>
            </div>
          ) : (
            filteredEntries.map((entry, index) => {
              const detailText = formatDetails(entry);
              return (
                <article key={`${entry.timestamp}-${entry.scope}-${index}`} className="rounded-xl border border-surface-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${levelClasses(entry.level)}`}>
                          <LevelIcon level={entry.level} />
                          {levelLabels[entry.level] || entry.level}
                        </span>
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-bold text-on-surface-variant">{entry.scope}</span>
                        <span className="text-[11px] font-semibold text-on-surface-variant">{formatDate(entry.timestamp)}</span>
                      </div>
                      <p className="mt-3 break-words text-sm font-bold text-on-surface">{entry.message}</p>
                    </div>
                    <div className="grid shrink-0 gap-1 text-xs text-on-surface-variant sm:grid-cols-2 lg:min-w-[280px]">
                      <span><strong className="text-on-surface">Etapa:</strong> {getStage(entry)}</span>
                      <span><strong className="text-on-surface">Ação:</strong> {getAction(entry)}</span>
                    </div>
                  </div>
                  {detailText && (
                    <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-low p-3 font-mono text-[11px] leading-5 text-on-surface-variant">{detailText}</pre>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
