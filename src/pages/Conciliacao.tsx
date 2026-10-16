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
  HelpCircle,
  Landmark,
  Loader2,
  PenLine,
  PlusCircle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useContas, useLancamentosDaConta } from '../hooks/useData';
import { useUIStore } from '../store/uiStore';
import SeletorAVRModal from '../components/Conciliacao/SeletorAVRModal';
import { compararExtrato, dataReferenciaLancamento, direcaoLancamento, valorPrevistoParaConciliar } from '../services/extrato/comparacao';
import { lerExtrato } from '../services/extrato/motorLeitura';
import type { ExtratoLido, ItemComparacao, LancamentoFinanceiro, ProgressoLeituraExtrato } from '../types';

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
  const { hasRole } = useAuth();
  const {
    setModalOpen,
    setSelectedLancamentoIdForModal,
    setSelectedRecorrenciaAction,
    setLancamentoFormDraft,
    setLancamentoPreset,
    setAvrPreset,
  } = useUIStore();
  const podeAgirNaConciliacao = hasRole(['master']);
  const [contaId, setContaId] = useState('');
  const [extrato, setExtrato] = useState<ExtratoLido | null>(null);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoLeituraExtrato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [mostrarNaoInterpretadas, setMostrarNaoInterpretadas] = useState(false);
  const [mostrarIgnoradas, setMostrarIgnoradas] = useState(false);
  const [seletorAVR, setSeletorAVR] = useState<ItemComparacao | null>(null);
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
      const extratoLido = await lerExtrato(file, setProgresso);
      setExtrato(extratoLido);
      setIsImportOpen(false);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível ler o extrato.');
    } finally {
      setProgresso(null);
      setProcessando(false);
    }
  };

  const selecionarArquivo = (file?: File) => {
    if (file && contaId) void handleArquivo(file);
  };

  const formatarValorInput = (valor: number) =>
    valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Abre o Novo Lançamento já preenchido com a linha do extrato. A tela de
  // conciliação não grava nada: quem grava é o fluxo existente do drawer.
  const abrirLancamentoDoExtrato = (item: ItemComparacao) => {
    const linha = item.linhaExtrato;
    if (!linha || !contaId) return;
    const valor = formatarValorInput(linha.valor);
    setLancamentoFormDraft({
      tipo: linha.direcao === 'entrada' ? 'entrada' : 'saida',
      valor_previsto: valor,
      data_emissao: linha.data,
      data_vencimento: linha.data,
      data_competencia: linha.data,
      data_pagamento: linha.data,
      conta_bancaria_id: contaId,
      entidade_id: '',
      centro_custo_id: '',
      categoria_id: '',
      recorrencia: false,
      recorrencia_com_entrada: false,
      recorrencia_repeat: false,
      periodicidade: 'mensal',
      periodicidade_customizada_dias: '30',
      quantidade_total_parcelas: '1',
      observacoes: item.descricao || 'Lançamento criado a partir do extrato',
      condicao: 'a_vista',
      ja_recebido: false,
      desconto_valor: '0,00',
      desconto_tipo: 'valor',
      motivo_desconto_id: '',
      acrescimo_valor: '0,00',
      acrescimo_tipo: 'valor',
      motivo_acrescimo_id: '',
      valor_recebido: '0,00',
    });
    setLancamentoPreset({ dataExtrato: linha.data });
    setSelectedLancamentoIdForModal(null);
    setSelectedRecorrenciaAction(null);
    setModalOpen('isNovoLancamentoOpen', true);
  };

  const candidatosAVR = useMemo(() => {
    if (!seletorAVR) return [];
    return lancamentos.filter((lancamento) =>
      direcaoLancamento(lancamento) === seletorAVR.direcao &&
      dataReferenciaLancamento(lancamento) === seletorAVR.data &&
      lancamento.status_pagamento === 'aberto' &&
      Number(lancamento.valor_recebido ?? 0) === 0
    );
  }, [seletorAVR, lancamentos]);

  const abrirSeletorAVR = (item: ItemComparacao) => {
    if (item.valorExtrato === null) return;
    setSeletorAVR(item);
  };

  // O AVR em si continua sendo o fluxo existente do drawer: aqui só escolhemos
  // o lançamento alvo e o valor que faz o efetivo bater com o extrato.
  const aplicarAVR = (lancamento: LancamentoFinanceiro) => {
    const valorExtrato = seletorAVR?.valorExtrato ?? 0;
    setAvrPreset({
      lancamentoId: lancamento.id,
      valor: formatarValorInput(valorPrevistoParaConciliar(lancamento, valorExtrato)),
    });
    setSeletorAVR(null);
    setSelectedLancamentoIdForModal(lancamento.id);
    setSelectedRecorrenciaAction(null);
    setModalOpen('isNovoLancamentoOpen', true);
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

    return (
      <div key={item.id} className="flex items-start justify-between gap-3 border-b border-surface-border/70 py-3 last:border-b-0">
        <div className="flex min-w-0 items-start gap-3">
          {item.direcao === 'entrada'
            ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-bank-truth-green" />
            : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-alert-red" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface" title={item.linhaExtrato?.textoOriginal || undefined}>{item.descricao || 'Movimentação sem descrição'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${status.className}`}>
                <StatusIcon className="h-3 w-3" />{status.label}
              </span>
              {item.linhaExtrato?.confianca === 'baixa' && (
                <span title="A IA teve baixa certeza nesta linha; confira o texto original." className="inline-flex items-center rounded-full bg-pending-amber/10 px-2 py-1 text-[10px] font-bold text-pending-amber">confiança baixa</span>
              )}
            </div>
            {item.status === 'conciliado' && item.lancamento?.observacoes && (
              <p className="mt-1 text-xs text-on-surface-variant">ERP: {item.lancamento.observacoes}</p>
            )}
            {item.status === 'divergente' && item.valorExtrato !== null && item.valorErp !== null && (
              <p className="mt-1 text-xs text-on-surface-variant">
                ERP: {moeda.format(item.valorErp)} · diferença {moeda.format(item.valorExtrato - item.valorErp)}
              </p>
            )}
            {item.linhaExtrato && (
              <p className="mt-1 text-[10px] text-on-surface-variant">
                PDF p.{item.linhaExtrato.pagina ?? '?'}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className={`text-sm font-bold ${item.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
            {moeda.format(valorPrincipal)}
          </p>
          {podeAgirNaConciliacao && (item.status === 'pendente_banco' || item.status === 'divergente') && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => abrirLancamentoDoExtrato(item)}
                title="Criar um novo lançamento no ERP com os dados desta linha do extrato"
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/20"
              >
                <PlusCircle className="h-3.5 w-3.5" />Lançar
              </button>
              <button
                type="button"
                onClick={() => abrirSeletorAVR(item)}
                title="Ajustar (AVR) um lançamento do ERP do mesmo dia com o valor desta linha"
                className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant transition hover:bg-surface"
              >
                <PenLine className="h-3.5 w-3.5" />AVR
              </button>
            </div>
          )}
        </div>
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
          <p className="mt-2 text-xs text-on-surface-variant">Leitura do PDF por IA · itens pendentes podem ser lançados no ERP direto desta tela</p>
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
          <p className="mt-2 text-xs text-on-surface-variant">A leitura do PDF é feita por IA (OpenAI) e o arquivo é apagado ao final do processamento.</p>
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
            {resultado && extrato.linhas.length > 0 && (() => {
              const totalLinhas = extrato.linhas.length;
              const percentual = Math.min(100, Math.round((resultado.resumo.conciliados / totalLinhas) * 100));
              return (
                <section className="sticky top-0 z-30 rounded-2xl border border-surface-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:bg-surface/95">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="shrink-0 text-sm font-black text-on-surface">{percentual}%</span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-low">
                        <div className="h-full bg-bank-truth-green transition-all" style={{ width: `${percentual}%` }} />
                      </div>
                      <span className="shrink-0 text-xs text-on-surface-variant">{resultado.resumo.conciliados} de {totalLinhas} linhas</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
                      <span className="text-bank-truth-green">{resultado.resumo.conciliados} conciliados</span>
                      <span className="text-alert-red">{resultado.resumo.divergentes} divergentes</span>
                      <span className="text-pending-amber">{resultado.resumo.pendentesBanco} falta no ERP</span>
                      <span className="text-bpi-blue">{resultado.resumo.pendentesErp} falta no extrato</span>
                    </div>
                  </div>
                </section>
              );
            })()}
            <section className="flex flex-col justify-between gap-4 rounded-[28px] border border-surface-border bg-white p-5 dark:bg-surface sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-on-surface">{extrato.arquivoNome}</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Período: {formatarData(extrato.dataInicio)} – {formatarData(extrato.dataFim)} · {extrato.paginas} {extrato.paginas === 1 ? 'página' : 'páginas'} · {extrato.linhas.length} {extrato.linhas.length === 1 ? 'linha lida' : 'linhas lidas'}
                  </p>
                  {extrato.meta && [
                    extrato.meta.banco && `Banco ${extrato.meta.banco}`,
                    extrato.meta.agencia && `Agência ${extrato.meta.agencia}`,
                    extrato.meta.conta && `Conta ${extrato.meta.conta}`,
                  ].filter(Boolean).length > 0 && (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {[extrato.meta.banco && `Banco ${extrato.meta.banco}`, extrato.meta.agencia && `Agência ${extrato.meta.agencia}`, extrato.meta.conta && `Conta ${extrato.meta.conta}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => { setErro(null); setIsImportOpen(true); }} className="rounded-xl border border-surface-border px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface">Trocar arquivo</button>
                <button type="button" onClick={() => setExtrato(null)} className="inline-flex items-center gap-2 rounded-xl border border-alert-red/20 px-4 py-2 text-sm font-semibold text-alert-red hover:bg-alert-red/10"><Trash2 className="h-4 w-4" />Remover</button>
              </div>
            </section>

            {extrato.conferencia && (() => {
              const conferencia = extrato.conferencia;
              const status = {
                ok: { titulo: 'Saldos conferem', Icon: CheckCircle2, classes: 'border-bank-truth-green/30 bg-bank-truth-green/10 text-bank-truth-green', texto: 'Saldo inicial + entradas − saídas fecha com o saldo final informado no extrato.' },
                divergente: { titulo: 'Divergência entre saldos e movimentações', Icon: AlertTriangle, classes: 'border-alert-red/30 bg-alert-red/10 text-alert-red', texto: `A soma das movimentações não fecha com os saldos do extrato: diferença de ${conferencia.diferenca === null ? '—' : moeda.format(conferencia.diferenca)}. Pode haver linha não lida — confira as linhas duvidosas abaixo.` },
                nao_verificavel: { titulo: 'Conferência de saldos não disponível', Icon: HelpCircle, classes: 'border-surface-border bg-surface-container-low text-on-surface-variant', texto: 'O extrato não informa saldo inicial e/ou final, então não foi possível conferir a soma das movimentações.' },
              }[conferencia.status];
              const Icon = status.Icon;
              return (
                <section className={`rounded-2xl border p-4 ${status.classes}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold">{status.titulo}</h3>
                      <p className="mt-1 text-sm">{status.texto}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <p>Saldo inicial <span className="block font-bold">{conferencia.saldoInicial === null ? '—' : moeda.format(conferencia.saldoInicial)}</span></p>
                        <p>Entradas <span className="block font-bold">{moeda.format(conferencia.entradas)}</span></p>
                        <p>Saídas <span className="block font-bold">{moeda.format(conferencia.saidas)}</span></p>
                        <p>Saldo final <span className="block font-bold">{conferencia.saldoFinal === null ? '—' : moeda.format(conferencia.saldoFinal)}</span></p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {extrato.linhas.length === 0 && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Nenhuma linha com data e valor foi identificada neste PDF. Se o arquivo for digitalizado (imagem) ou estiver protegido, a leitura por IA pode não conseguir extrair as movimentações.</div>}
            {totalCount > lancamentos.length && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Foram carregados 1000 de {totalCount} lançamentos; a comparação pode estar incompleta.</div>}
            {extrato.naoInterpretadas.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-pending-amber/30 bg-pending-amber/10">
                <button type="button" onClick={() => setMostrarNaoInterpretadas(!mostrarNaoInterpretadas)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-pending-amber">
                  <span>{extrato.naoInterpretadas.length} linhas que a IA não conseguiu interpretar</span>{mostrarNaoInterpretadas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {mostrarNaoInterpretadas && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="space-y-2 border-t border-pending-amber/20 px-4 py-3">
                      {extrato.naoInterpretadas.map((linha, index) => {
                        const motivos = {
                          sem_data: 'Linha sem data',
                          direcao_indefinida: 'Entrada/saída não identificada',
                          sem_valor: 'Linha sem valor',
                          valor_ilegivel: 'Valor ilegível',
                          data_impossivel: 'Data inválida',
                        };
                        return (
                          <li key={`${linha.pagina}-${index}`} className="text-xs text-on-surface">
                            <span className="font-bold">p.{linha.pagina ?? '?'}</span> · {linha.texto} <span className="text-pending-amber">({motivos[linha.motivo]})</span>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>}
                </AnimatePresence>
              </section>
            )}

            {!!extrato.linhasIgnoradas?.length && (
              <section className="overflow-hidden rounded-2xl border border-bpi-blue/30 bg-bpi-blue/10">
                <button type="button" onClick={() => setMostrarIgnoradas(!mostrarIgnoradas)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-bpi-blue">
                  <span>{extrato.linhasIgnoradas.length} linhas ignoradas (saldos, totais, cabeçalhos)</span>{mostrarIgnoradas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <p className="px-4 pb-3 text-xs text-on-surface-variant">Estas linhas não são transações e ficaram fora da conciliação.</p>
                <AnimatePresence>
                  {mostrarIgnoradas && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="space-y-2 border-t border-bpi-blue/20 px-4 py-3">
                      {extrato.linhasIgnoradas.map((linha, index) => {
                        const motivos = { saldo: 'Saldo', totalizador: 'Totalizador', cabecalho: 'Cabeçalho', rodape: 'Rodapé', outro: 'Outro' };
                        return <li key={`${linha.pagina}-${index}`} className="text-xs text-on-surface"><span className="font-bold">p.{linha.pagina ?? '?'}</span> · {linha.texto} <span className="text-bpi-blue">({motivos[linha.motivo]})</span></li>;
                      })}
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
        {isImportOpen && <motion.div key="conciliacao-importar" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                {processando ? (
                  <>
                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm font-semibold text-on-surface">
                      {progresso?.etapa === 'enviando'
                        ? 'Enviando o PDF com segurança...'
                        : progresso?.etapa === 'lendo'
                          ? `Lendo páginas ${progresso.paginaInicio ?? '?'}–${progresso.paginaFim ?? '?'} de ${progresso.totalPaginas ?? '?'} · lote ${progresso.loteAtual} de ${progresso.totalLotes}`
                          : 'Preparando o arquivo...'}
                    </span>
                    {progresso?.totalPaginas && (
                      <div className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-container-low">
                        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round(((progresso.paginaFim ?? 0) / progresso.totalPaginas) * 100))}%` }} />
                      </div>
                    )}
                  </>
                ) : <><Upload className="mb-3 h-8 w-8 text-secondary" /><span className="font-bold text-on-surface">Arraste o PDF para cá ou clique para selecionar</span><span className="mt-2 text-xs text-on-surface-variant">Apenas arquivos PDF</span></>}
              </button>
              {!processando && <div className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-container-low p-3 text-xs text-on-surface-variant"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" /><p>A leitura é feita por IA (OpenAI). O PDF é enviado temporariamente e apagado do servidor ao final do processamento.</p></div>}
              {erro && <p role="alert" className="rounded-xl bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}
              <footer className="flex justify-end pt-2">
                <button type="button" disabled={processando} onClick={() => setIsImportOpen(false)} className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-bold text-on-surface hover:bg-surface disabled:opacity-50">Cancelar</button>
              </footer>
            </div>
          </motion.section>
        </motion.div>}
        {seletorAVR && (
          <SeletorAVRModal
            key="conciliacao-seletor-avr"
            aberto
            data={seletorAVR.data}
            direcao={seletorAVR.direcao}
            valorExtrato={seletorAVR.valorExtrato ?? 0}
            candidatos={candidatosAVR}
            onFechar={() => setSeletorAVR(null)}
            onSelecionar={aplicarAVR}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
