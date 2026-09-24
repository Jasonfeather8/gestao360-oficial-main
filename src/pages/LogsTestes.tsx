import { useMemo, useState } from 'react';
import { Clipboard, ClipboardCheck, FileText, RefreshCw, Search, Trash2 } from 'lucide-react';
import { diagnosticLogger, DIAGNOSTIC_STORAGE_KEY } from '../services/diagnosticLogger';

type DiagnosticEntry = ReturnType<typeof diagnosticLogger.getEntries>[number];

type LogFilter = 'todos' | 'teste-01';

const formatDetails = (details: unknown) => {
  if (details === undefined || details === null) return '—';
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return 'Detalhes indisponíveis';
  }
};

const formatEntry = (entry: DiagnosticEntry) => [
  `[${new Date(entry.timestamp).toLocaleString('pt-BR')}] ${entry.level.toUpperCase()} | ${entry.scope}`,
  entry.message,
  `Detalhes: ${formatDetails(entry.details)}`,
].join('\n');

export default function LogsTestes() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>(() => diagnosticLogger.getEntries());
  const [filter, setFilter] = useState<LogFilter>('teste-01');
  const [search, setSearch] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return entries.filter(entry => {
      const matchesScope = filter === 'todos' || entry.scope.toLocaleLowerCase('pt-BR').includes('teste-01');
      const searchable = `${entry.timestamp} ${entry.level} ${entry.scope} ${entry.message} ${formatDetails(entry.details)}`.toLocaleLowerCase('pt-BR');
      return matchesScope && (!query || searchable.includes(query));
    });
  }, [entries, filter, search]);

  const reloadLogs = () => {
    setEntries(diagnosticLogger.getEntries());
    setCopyState('idle');
  };

  const copyLogs = async () => {
    const content = filteredEntries.length ? filteredEntries.map(formatEntry).join('\n\n') : 'Nenhum evento encontrado para este filtro.';
    try {
      if (!navigator.clipboard) throw new Error('Clipboard indisponível');
      await navigator.clipboard.writeText(content);
      setCopyState('success');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 3000);
  };

  const clearLogs = () => {
    if (!window.confirm('Limpar todos os logs de testes? Esta ação não pode ser desfeita.')) return;
    try {
      localStorage.removeItem(DIAGNOSTIC_STORAGE_KEY);
      setEntries([]);
      setCopyState('idle');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary"><FileText className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Evidências operacionais</span></div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-on-background md:text-3xl">Logs de testes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">Acompanhe os eventos persistidos pelo plano manual. Os detalhes são serializados com segurança e não exibem tokens, senhas ou segredos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reloadLogs} className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-container px-3.5 py-2.5 text-sm font-bold text-on-surface hover:border-primary hover:text-primary"><RefreshCw className="h-4 w-4" /> Atualizar</button>
            <button type="button" onClick={copyLogs} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-bold text-on-primary hover:opacity-90"><Clipboard className="h-4 w-4" /> Copiar logs filtrados</button>
            <button type="button" onClick={clearLogs} className="inline-flex items-center gap-2 rounded-lg border border-alert-red/30 px-3.5 py-2.5 text-sm font-bold text-alert-red hover:bg-alert-red/10"><Trash2 className="h-4 w-4" /> Limpar</button>
          </div>
        </div>
        {copyState !== 'idle' && <div role="status" className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${copyState === 'success' ? 'border-bank-truth-green/30 bg-bank-truth-green/10 text-bank-truth-green' : 'border-alert-red/30 bg-alert-red/10 text-alert-red'}`}>{copyState === 'success' ? <ClipboardCheck className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{copyState === 'success' ? 'Logs copiados para a área de transferência.' : 'Não foi possível copiar os logs neste navegador.'}</div>}
      </header>

      <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de escopo">
            <button type="button" onClick={() => setFilter('teste-01')} className={`rounded-lg px-3.5 py-2 text-sm font-bold ${filter === 'teste-01' ? 'bg-primary text-on-primary' : 'border border-surface-border bg-surface-container text-secondary'}`}>Teste 01</button>
            <button type="button" onClick={() => setFilter('todos')} className={`rounded-lg px-3.5 py-2 text-sm font-bold ${filter === 'todos' ? 'bg-primary text-on-primary' : 'border border-surface-border bg-surface-container text-secondary'}`}>Todos os eventos</button>
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-surface-border bg-surface-container-low px-3 py-2 lg:w-96"><Search className="h-4 w-4 shrink-0 text-secondary" /><span className="sr-only">Buscar nos logs</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por texto..." className="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-secondary/60" /></label>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4"><p className="text-xs font-bold uppercase tracking-wider text-secondary">{filteredEntries.length} evento(s) exibido(s)</p><p className="text-xs text-secondary">{entries.length} persistido(s)</p></div>
      </section>

      <section className="space-y-3" aria-live="polite">
        {filteredEntries.length === 0 ? <div className="rounded-2xl border border-dashed border-surface-border bg-surface p-10 text-center"><FileText className="mx-auto h-8 w-8 text-secondary/50" /><p className="mt-3 text-sm font-bold text-secondary">Nenhum evento encontrado</p><p className="mt-1 text-xs text-secondary">Inicie o Teste 01 ou ajuste os filtros para visualizar os registros.</p></div> : filteredEntries.slice().reverse().map((entry, index) => <article key={`${entry.timestamp}-${entry.scope}-${index}`} className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${entry.level === 'error' ? 'bg-alert-red/10 text-alert-red' : entry.level === 'warn' ? 'bg-pending-amber/10 text-pending-amber' : 'bg-primary/10 text-primary'}`}>{entry.level}</span><span className="rounded-full border border-surface-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-secondary">{entry.scope}</span></div><time className="text-xs font-semibold text-secondary" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString('pt-BR')}</time></div><p className="mt-3 text-sm font-bold text-on-surface">{entry.message}</p><pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-surface-container-low p-3 text-xs leading-5 text-secondary whitespace-pre-wrap break-words">{formatDetails(entry.details)}</pre></article>)}
      </section>
    </div>
  );
}
