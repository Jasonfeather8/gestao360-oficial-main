import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSearch,
  FileText,
  Landmark,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useContas, useLancamentosDaConta } from '../hooks/useData';
import { compararExtrato } from '../services/extrato/comparacao';
import { lerExtrato } from '../services/extrato/motorLeitura';
import type { ExtratoLido, ItemComparacao } from '../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dataComDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatarData(data: string | null): string {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

function dataUtc(data: string): Date {
  return new Date(`${data}T00:00:00Z`);
}

export default function Conciliacao() {
  const { data: contas = [] } = useContas();
  const [contaId, setContaId] = useState('');
  const [extrato, setExtrato] = useState<ExtratoLido | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [mostrarNaoInterpretadas, setMostrarNaoInterpretadas] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (contas.length > 0 && !contaId) setContaId(contas[0].id);
  }, [contas, contaId]);

  const {
    data: lancamentos = [],
    totalCount,
    isLoading: carregandoLancamentos,
  } = useLancamentosDaConta(contaId || null, extrato?.dataInicio ?? null, extrato?.dataFim ?? null);

  const resultado = useMemo(
    () => (extrato ? compararExtrato(extrato, lancamentos) : null),
    [extrato, lancamentos],
  );

  const handleArquivo = async (file: File) => {
    setErro(null);
    setProcessando(true);
    try {
      const extratoLido = await lerExtrato(file);
      setExtrato(extratoLido);
      setIsImportOpen(false);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível ler o extrato.');
    } finally {
      setProcessando(false);
    }
  };

  const selecionarArquivo = (file?: File) => {
    if (file && contaId) void handleArquivo(file);
  };

  const renderItem = (item: ItemComparacao) => {
    const status = {
      conciliado: { label: 'Conciliado', icon: CheckCircle2, className: 'bg-bank-truth-green/10 text-bank-truth-green' },
      divergente: { label: 'Valor divergente', icon: AlertTriangle, className: 'bg-alert-red/10 text-alert-red' },
      pendente_banco: { label: 'Falta no ERP', icon: AlertTriangle, className: 'bg-pending-amber/10 text-pending-amber' },
      pendente_erp: { label: 'Falta no extrato', icon: AlertTriangle, className: 'bg-bpi-blue/10 text-bpi-blue' },
    }[item.status];
    const StatusIcon = status.icon;
    const valorPrincipal = item.valorExtrato ?? item.valorErp ?? 0;
    const origem = item.linhaExtrato?.origemDirecao === 'sinal'
      ? 'sinal do valor'
      : item.linhaExtrato?.origemDirecao === 'marcador'
        ? 'marcador D/C'
        : 'variação de saldo';

    return (
      <div key={item.id} className="flex items-start justify-between gap-3 border-b border-surface-border/70 py-3 last:border-b-0">
        <div className="flex min-w-0 items-start gap-3">
          {item.direcao === 'entrada'
            ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-bank-truth-green" />
            : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-alert-red" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">{item.descricao || 'Movimentação sem descrição'}</p>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${status.className}`}>
              <StatusIcon className="h-3 w-3" />{status.label}
            </span>
            {item.status === 'conciliado' && item.lancamento?.observacoes && (
              <p className="mt-1 text-xs text-on-surface-variant">ERP: {item.lancamento.observacoes}</p>
            )}
            {item.status === 'divergente' && item.valorExtrato !== null && item.valorErp !== null && (
              <p className="mt-1 text-xs text-on-surface-variant">
                ERP: {moeda.format(item.valorErp)} · diferença {moeda.format(item.valorExtrato - item.valorErp)}
              </p>
            )}
            {item.linhaExtrato && (
              <p className="mt-1 text-[10px] text-on-surface-variant" title={origem}>
                PDF p.{item.linhaExtrato.pagina} · l.{item.linhaExtrato.linha}
              </p>
            )}
          </div>
        </div>
        <p className={`shrink-0 text-sm font-bold ${item.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
          {moeda.format(valorPrincipal)}
        </p>
      </div>
    );
  };

  const resumoTiles = resultado ? [
    { label: 'Entradas no extrato', valor: moeda.format(resultado.resumo.totalEntradas), cor: 'text-bank-truth-green' },
    { label: 'Saídas no extrato', valor: moeda.format(resultado.resumo.totalSaidas), cor: 'text-alert-red' },
    { label: 'Conciliados', valor: resultado.resumo.conciliados, cor: 'text-bank-truth-green' },
    { label: 'Divergentes', valor: resultado.resumo.divergentes, cor: 'text-alert-red' },
    { label: 'Falta no ERP', valor: resultado.resumo.pendentesBanco, cor: 'text-pending-amber' },
    { label: 'Falta no extrato', valor: resultado.resumo.pendentesErp, cor: 'text-bpi-blue' },
  ] : [];

  const seletorConta = (className: string) => (
    <label className={`flex items-center gap-3 rounded-2xl border border-surface-border bg-white px-4 dark:bg-surface ${className}`}>
      <Building className="h-4 w-4 shrink-0 text-secondary" />
      <select
        aria-label="Conta bancária"
        value={contaId}
        onChange={(event) => setContaId(event.target.value)}
        className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-on-surface outline-none"
      >
        <option value="">Selecione a conta</option>
        {contas.map((conta) => (
          <option key={conta.id} value={conta.id}>{conta.nome} · {conta.nome_banco}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-6 pb-8 text-on-surface">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-on-surface sm:text-3xl">
            <Landmark className="h-7 w-7 text-primary" />Conciliação Bancária
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-secondary">Conferência do extrato com os lançamentos do ERP</p>
          <p className="mt-2 text-xs text-on-surface-variant">Somente leitura: nada é gravado no ERP</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {seletorConta('min-w-0 sm:min-w-[260px]')}
          <button
            type="button"
            onClick={() => { setErro(null); setIsImportOpen(true); }}
            disabled={!contaId}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />Importar Extrato
          </button>
        </div>
      </header>

      {!extrato ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex min-h-[360px] max-w-3xl flex-col items-center justify-center rounded-[32px] border border-surface-border bg-white px-6 py-12 text-center dark:bg-surface"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSearch className="h-8 w-8" /></div>
          <h2 className="text-xl font-bold">Nenhum extrato carregado</h2>
          <p className="mt-2 max-w-lg text-sm text-on-surface-variant">Escolha uma conta bancária e importe o PDF para comparar as movimentações em memória.</p>
          <div className="my-6 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-surface-border p-4 text-sm"><span className="mr-2 font-bold text-primary">1.</span>Escolha a conta bancária</div>
            <div className="rounded-2xl border border-surface-border p-4 text-sm"><span className="mr-2 font-bold text-primary">2.</span>Importe o extrato em PDF</div>
          </div>
          <button
            type="button"
            onClick={() => { setErro(null); setIsImportOpen(true); }}
            disabled={!contaId}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          ><Upload className="h-4 w-4" />Importar Extrato</button>
        </motion.section>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key="extrato-carregado" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <section className="flex flex-col justify-between gap-4 rounded-[28px] border border-surface-border bg-white p-5 dark:bg-surface sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-on-surface">{extrato.arquivoNome}</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Período: {formatarData(extrato.dataInicio)} – {formatarData(extrato.dataFim)} · {extrato.paginas} {extrato.paginas === 1 ? 'página' : 'páginas'} · {extrato.linhas.length} {extrato.linhas.length === 1 ? 'linha lida' : 'linhas lidas'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => { setErro(null); setIsImportOpen(true); }} className="rounded-xl border border-surface-border px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface">Trocar arquivo</button>
                <button type="button" onClick={() => setExtrato(null)} className="inline-flex items-center gap-2 rounded-xl border border-alert-red/20 px-4 py-2 text-sm font-semibold text-alert-red hover:bg-alert-red/10"><Trash2 className="h-4 w-4" />Remover</button>
              </div>
            </section>

            {!extrato.temTexto && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Este PDF não possui camada de texto. PDFs digitalizados podem não ser interpretados.</div>}
            {extrato.linhas.length === 0 && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Nenhuma linha com data e valor foi identificada neste PDF</div>}
            {totalCount > lancamentos.length && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Foram carregados 1000 de {totalCount} lançamentos; a comparação pode estar incompleta.</div>}
            {extrato.naoInterpretadas.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-pending-amber/30 bg-pending-amber/10">
                <button type="button" onClick={() => setMostrarNaoInterpretadas(!mostrarNaoInterpretadas)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-pending-amber">
                  <span>{extrato.naoInterpretadas.length} linha(s) não interpretada(s)</span>{mostrarNaoInterpretadas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {mostrarNaoInterpretadas && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="space-y-2 border-t border-pending-amber/20 px-4 py-3">
                      {extrato.naoInterpretadas.map((linha, index) => (
                        <li key={`${linha.pagina}-${linha.linha}-${index}`} className="text-xs text-on-surface">
                          <span className="font-bold">p.{linha.pagina} · l.{linha.linha}</span> · {linha.texto} <span className="text-pending-amber">({linha.motivo === 'sem_data' ? 'Linha sem data' : 'Entrada/saída não identificada'})</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>}
                </AnimatePresence>
              </section>
            )}

            {carregandoLancamentos && <p className="text-sm text-on-surface-variant">Carregando lançamentos do ERP...</p>}
            {resultado && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resumoTiles.map((tile) => (
                  <section key={tile.label} className="rounded-2xl border border-surface-border bg-white p-4 dark:bg-surface">
                    <p className="text-xs font-semibold text-on-surface-variant">{tile.label}</p><p className={`mt-2 text-xl font-black ${tile.cor}`}>{tile.valor}</p>
                  </section>
                ))}
              </div>
              {resultado.dias.length === 0 ? (
                <div className="rounded-[28px] border border-surface-border bg-white p-10 text-center text-sm text-on-surface-variant dark:bg-surface">Nenhuma movimentação encontrada no período do extrato</div>
              ) : resultado.dias.map((dia) => (
                <section key={dia.data} className="overflow-hidden rounded-[28px] border border-surface-border bg-white dark:bg-surface">
                  <header className="flex flex-col justify-between gap-3 border-b border-surface-border bg-surface-container-low px-5 py-4 sm:flex-row sm:items-center">
                    <h3 className="font-bold capitalize text-on-surface">{dataComDia.format(dataUtc(dia.data))}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <span className="text-bank-truth-green">Entradas {moeda.format(dia.totalEntradas)}</span>
                      <span className="text-alert-red">Saídas {moeda.format(dia.totalSaidas)}</span>
                      <span>{dia.conciliados} conciliados</span><span>{dia.divergentes} divergentes</span><span>{dia.pendentes} pendentes</span>
                    </div>
                  </header>
                  <div className="grid grid-cols-1 divide-y divide-surface-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                    {(['entradas', 'saidas'] as const).map((direcao) => {
                      const itens = dia[direcao];
                      return (
                        <div key={direcao} className="p-5">
                          <h4 className={`mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider ${direcao === 'entradas' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                            {direcao === 'entradas' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                            {direcao === 'entradas' ? 'Entradas' : 'Saídas'}
                          </h4>
                          {itens.length ? itens.map(renderItem) : <p className="py-4 text-sm text-on-surface-variant">Nenhuma movimentação</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>}
          </motion.div>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {isImportOpen && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            role="dialog" aria-modal="true" aria-labelledby="import-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
          >
            <header className="mb-6 flex items-start justify-between gap-4">
              <div><h2 id="import-title" className="text-xl font-black text-on-surface">Importar Extrato</h2><p className="mt-1 text-sm text-on-surface-variant">Selecione a conta e carregue seu arquivo PDF.</p></div>
              <button type="button" onClick={() => setIsImportOpen(false)} aria-label="Fechar" disabled={processando} className="rounded-full p-2 text-on-surface-variant hover:bg-surface disabled:opacity-50"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-4">
              {seletorConta('w-full')}
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { selecionarArquivo(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button
                type="button"
                disabled={!contaId || processando}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(event) => { event.preventDefault(); setArrastando(false); selecionarArquivo(event.dataTransfer.files[0]); }}
                className={`flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${arrastando ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-primary/60'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {processando ? <><Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /><span className="text-sm font-semibold text-on-surface">Lendo o extrato...</span></> : <><Upload className="mb-3 h-8 w-8 text-secondary" /><span className="font-bold text-on-surface">Arraste o PDF para cá ou clique para selecionar</span><span className="mt-2 text-xs text-on-surface-variant">Apenas arquivos PDF</span></>}
              </button>
              {erro && <p role="alert" className="rounded-xl bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}
              <footer className="flex justify-end pt-2">
                <button type="button" disabled={processando} onClick={() => setIsImportOpen(false)} className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-bold text-on-surface hover:bg-surface disabled:opacity-50">Cancelar</button>
              </footer>
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
