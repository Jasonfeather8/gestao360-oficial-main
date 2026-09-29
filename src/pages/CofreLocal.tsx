import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Banknote,
  Check,
  CheckCircle2,
  CircleAlert,
  Coins,
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCofreLocal, useContas, useLancamentos, useAuditoriaLogs } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { type SituacaoBancariaTransferenciaCofre, type TransacaoBanco, type TransferenciaCofre, type TipoMovimentacaoCofre } from '../types';

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const statusLabel: Record<string, string> = {
  aguardando_master: 'Aguardando Master',
  aguardando_recebimento: 'Aguardando recebimento',
  aguardando_conciliacao: 'Aguardando conciliação',
  conciliada: 'Conciliada',
  aprovado: 'Aprovado',
  aprovada: 'Aprovada',
  reprovado: 'Reprovado',
  reprovada: 'Reprovada',
  estornado: 'Estornado',
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';
const formatId = (value?: string | null) => value || '—';

export default function CofreLocal() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const isMaster = role === 'master';
  const { data: contas = [] } = useContas();
  const { data: lancamentos = [] } = useLancamentos({ pageSize: 1000 });
  const { data: auditoria = [] } = useAuditoriaLogs();
  const {
    cofres,
    saldos,
    movimentacoes,
    transferencias,
    isLoading,
    isMutating,
    criarCofre,
    criarMovimentacao,
    criarTransferencia,
    confirmarRecebimento,
    decidirMovimentacao,
    decidirTransferencia,
    conciliarTransferencia,
    listarTransacoesCandidatas,
    consultarSituacaoBancaria,
    estornarMovimentacao,
    estornarTransferencia,
  } = useCofreLocal();

  const [selectedCofreId, setSelectedCofreId] = useState('');
  const [showCreateCofre, setShowCreateCofre] = useState(false);
  const [cofreNome, setCofreNome] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('0,00');
  const [tipoManual, setTipoManual] = useState<TipoMovimentacaoCofre>('entrada');
  const [valorManual, setValorManual] = useState('');
  const [dataManual, setDataManual] = useState(today);
  const [descricaoManual, setDescricaoManual] = useState('');
  const [tipoBaixa, setTipoBaixa] = useState<TipoMovimentacaoCofre>('entrada');
  const [valorBaixa, setValorBaixa] = useState('');
  const [dataBaixa, setDataBaixa] = useState(today);
  const [descricaoBaixa, setDescricaoBaixa] = useState('');
  const [lancamentoId, setLancamentoId] = useState('');
  const [direcao, setDirecao] = useState<'banco_para_cofre' | 'cofre_para_banco'>('banco_para_cofre');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [valorTransferencia, setValorTransferencia] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState(today);
  const [notice, setNotice] = useState('');
  const [candidatas, setCandidatas] = useState<Record<string, TransacaoBanco[]>>({});
  const [candidataSelecionada, setCandidataSelecionada] = useState<Record<string, string>>({});
  const [carregandoCandidatas, setCarregandoCandidatas] = useState('');
  const [situacoesBancarias, setSituacoesBancarias] = useState<Record<string, SituacaoBancariaTransferenciaCofre>>({});
  const [consultandoSituacao, setConsultandoSituacao] = useState('');

  const activeCofres = useMemo(() => cofres.filter(cofre => cofre.status === 'ativo'), [cofres]);
  const selectedCofre = cofres.find(cofre => cofre.id === selectedCofreId) || activeCofres[0];
  const selectedSaldo = saldos.find(saldo => saldo.cofre_id === selectedCofre?.id);
  const selectedMovimentacoes = movimentacoes.filter(movimento => movimento.cofre_id === selectedCofre?.id);
  const selectedTransferencias = transferencias.filter(transferencia => transferencia.cofre_id === selectedCofre?.id);
  const pendingMovimentacoes = movimentacoes.filter(movimento => movimento.status === 'aguardando_master');
  const pendingTransferencias = transferencias.filter(transferencia => transferencia.status === 'aguardando_master');
  const selectedPendingMovimentacoes = selectedMovimentacoes.filter(movimento => movimento.status === 'aguardando_master');
  const selectedPendingTransferencias = selectedTransferencias.filter(transferencia => transferencia.status === 'aguardando_master');
  const awaitingReceiving = selectedTransferencias.filter(transferencia => transferencia.status === 'aguardando_recebimento');
  const awaitingReconciliation = selectedTransferencias.filter(transferencia =>
    ['aguardando_recebimento', 'aguardando_master'].includes(transferencia.status) && transferencia.status_bancario !== 'conciliada',
  );
  const openLancamentos = lancamentos.filter(lancamento => lancamento.status_pagamento === 'aberto');
  const auditoriaCofre = useMemo(
    () => auditoria.filter(log => ['cofres_locais', 'movimentacoes_cofre', 'transferencias_cofre'].includes(log.tabela_afetada)).slice(0, 8),
    [auditoria],
  );

  const showResult = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4500);
  };

  const handleCreateCofre = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await criarCofre({ nome: cofreNome, saldoInicial: Number(saldoInicial.replace(',', '.')) || 0 });
      setCofreNome('');
      setSaldoInicial('0,00');
      setShowCreateCofre(false);
      showResult('Cofre criado com sucesso.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível criar o cofre.');
    }
  };

  const handleMovement = async (
    event: React.FormEvent,
    origem: 'manual' | 'baixa_direta',
    movement: { tipo: TipoMovimentacaoCofre; valor: string; data: string; descricao: string; lancamentoId?: string },
  ) => {
    event.preventDefault();
    if (!selectedCofre) return showResult('Selecione um cofre ativo.');
    try {
      await criarMovimentacao({
        cofreId: selectedCofre.id,
        tipo: movement.tipo,
        valor: Number(movement.valor.replace(',', '.')) || 0,
        dataMovimentacao: movement.data,
        descricao: movement.descricao,
        origem,
        lancamentoId: origem === 'baixa_direta' ? movement.lancamentoId || null : null,
      });
      if (origem === 'manual') {
        setValorManual('');
        setDescricaoManual('');
      } else {
        setValorBaixa('');
        setDescricaoBaixa('');
        setLancamentoId('');
      }
      showResult(isMaster ? 'Movimentação criada e enviada para aprovação Master.' : 'Movimentação enviada para aprovação do Master.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível criar a movimentação.');
    }
  };

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCofre || !contaBancariaId) return showResult('Selecione o cofre e a conta bancária.');
    try {
      await criarTransferencia({
        direcao,
        contaBancariaId,
        cofreId: selectedCofre.id,
        valor: Number(valorTransferencia.replace(',', '.')) || 0,
        dataTransferencia,
      });
      setValorTransferencia('');
      showResult('Transferência criada. A confirmação manual, a conciliação e a aprovação permanecem separadas.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível criar a transferência.');
    }
  };

  const decideMovement = async (id: string, aprovado: boolean) => {
    const justificativa = aprovado ? undefined : window.prompt('Informe a justificativa da reprovação:') || '';
    if (!aprovado && !justificativa.trim()) return;
    try {
      await decidirMovimentacao({ id, aprovado, justificativa });
      showResult(aprovado ? 'Movimentação aprovada.' : 'Movimentação reprovada.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.');
    }
  };

  const decideTransfer = async (id: string, aprovado: boolean) => {
    const justificativa = aprovado ? undefined : window.prompt('Informe a justificativa da reprovação:') || '';
    if (!aprovado && !justificativa.trim()) return;
    try {
      await decidirTransferencia({ id, aprovado, justificativa });
      showResult(aprovado ? 'Transferência aprovada.' : 'Transferência reprovada.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.');
    }
  };

  const loadCandidates = async (transferenciaId: string) => {
    setCarregandoCandidatas(transferenciaId);
    try {
      const result = await listarTransacoesCandidatas(transferenciaId);
      setCandidatas(current => ({ ...current, [transferenciaId]: result }));
      showResult(result.length ? 'Transações candidatas carregadas.' : 'Nenhuma transação candidata encontrada.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível carregar as transações candidatas.');
    } finally {
      setCarregandoCandidatas('');
    }
  };

  const reconcile = async (transferenciaId: string) => {
    const transacaoBancoId = candidataSelecionada[transferenciaId];
    if (!transacaoBancoId) return showResult('Selecione uma transação bancária para conciliar.');
    try {
      await conciliarTransferencia({ transferenciaId, transacaoBancoId });
      showResult('Transferência conciliada com sucesso.');
      setCandidataSelecionada(current => ({ ...current, [transferenciaId]: '' }));
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível conciliar a transferência.');
    }
  };

  const loadBankSituation = async (transferenciaId: string) => {
    setConsultandoSituacao(transferenciaId);
    try {
      const result = await consultarSituacaoBancaria(transferenciaId);
      setSituacoesBancarias(current => ({ ...current, [transferenciaId]: result }));
      showResult('Situação bancária atualizada.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível consultar a situação bancária.');
    } finally {
      setConsultandoSituacao('');
    }
  };

  const reverseMovement = async (id: string) => {
    const motivo = window.prompt('Informe o motivo do estorno:') || '';
    if (!motivo.trim()) return;
    try {
      await estornarMovimentacao({ id, motivo });
      showResult('Movimentação estornada e histórico preservado.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível estornar a movimentação.');
    }
  };

  const reverseTransfer = async (id: string) => {
    const motivo = window.prompt('Informe o motivo do estorno:') || '';
    if (!motivo.trim()) return;
    try {
      await estornarTransferencia({ id, motivo });
      showResult('Transferência estornada e lançamentos revertidos.');
    } catch (error) {
      showResult(error instanceof Error ? error.message : 'Não foi possível estornar a transferência.');
    }
  };

  const getApprovalRequirements = (transferencia: TransferenciaCofre) => {
    const missing: string[] = [];
    if (!transferencia.recebido_por || !transferencia.recebido_em) missing.push('confirmação operacional de recebimento');
    if (transferencia.status_bancario !== 'conciliada' || !transferencia.transacao_banco_id) missing.push('conciliação bancária');
    if (!transferencia.direcao || !transferencia.cofre_id || !transferencia.conta_bancaria_id || !transferencia.lancamento_bancario_id || !transferencia.movimentacao_cofre_id || !transferencia.criado_por || !transferencia.data_transferencia || Number(transferencia.valor) <= 0) {
      missing.push('dados obrigatórios da transferência');
    }
    return missing;
  };

  const renderTransferencia = (transferencia: TransferenciaCofre) => {
    const situacao = situacoesBancarias[transferencia.id];
    const transferCandidates = candidatas[transferencia.id] || [];
    const selectedTransaction = transferCandidates.find(transacao => transacao.id === (transferencia.transacao_banco_id || candidataSelecionada[transferencia.id]));
    const mirror = lancamentos.find(lancamento => lancamento.id === transferencia.lancamento_bancario_id);
    const account = contas.find(conta => conta.id === transferencia.conta_bancaria_id);
    const bankStatus = situacao?.status_bancario || transferencia.status_bancario || 'aguardando_conciliacao';
    const canReconcile = !['estornada', 'reprovada', 'aprovada'].includes(transferencia.status);
    const missingApprovalRequirements = getApprovalRequirements(transferencia);
    const canApprove = transferencia.status === 'aguardando_master' && missingApprovalRequirements.length === 0;

    return (
      <article key={transferencia.id} className="space-y-3 rounded-lg border border-surface-border/70 bg-background/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-on-surface">{transferencia.direcao === 'banco_para_cofre' ? 'Banco → Cofre' : 'Cofre → Banco'}</p>
            <p className="mt-1 text-xs font-bold text-on-surface">{currency(transferencia.valor)} · operação em {formatDate(transferencia.data_transferencia)}</p>
          </div>
          <div className="text-right text-[10px] font-bold uppercase tracking-wider text-secondary">
            <p>{statusLabel[transferencia.status] || transferencia.status}</p>
            <p className={bankStatus === 'conciliada' ? 'text-bank-truth-green' : 'text-alert-red'}>{statusLabel[bankStatus] || bankStatus}</p>
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-2 text-[11px] text-secondary sm:grid-cols-2">
          <p><span className="font-bold text-on-surface">Conta bancária:</span> {account ? `${account.nome} · ${account.nome_banco}` : formatId(transferencia.conta_bancaria_id)}</p>
          <p><span className="font-bold text-on-surface">Criado por:</span> {formatId(transferencia.criado_por)}</p>
          <p><span className="font-bold text-on-surface">Recebimento:</span> {transferencia.recebido_por ? `${transferencia.recebido_por} · ${formatDate(transferencia.recebido_em)}` : 'Pendente de confirmação'}</p>
          <p><span className="font-bold text-on-surface">Conciliação:</span> {transferencia.conciliado_por ? `${transferencia.conciliado_por} · ${formatDate(transferencia.conciliado_em)}` : 'Pendente'}</p>
          <p><span className="font-bold text-on-surface">Aprovação Master:</span> {transferencia.aprovado_por ? `${transferencia.aprovado_por} · ${formatDate(transferencia.aprovado_em)}` : 'Pendente'}</p>
          <p><span className="font-bold text-on-surface">Lançamento espelho:</span> {formatId(transferencia.lancamento_bancario_id)}{mirror ? ` · ${mirror.observacoes || mirror.descricao_bancaria_original || 'Sem descrição'}` : ''}</p>
          <p><span className="font-bold text-on-surface">Transação do extrato:</span> {formatId(transferencia.transacao_banco_id || situacao?.transacao_banco_id)}{selectedTransaction ? ` · ${formatDate(selectedTransaction.data_transacao)} · ${selectedTransaction.descricao_banco}` : ''}</p>
          <p><span className="font-bold text-on-surface">Confirmação:</span> {transferencia.recebido_em ? formatDate(transferencia.recebido_em) : 'Não confirmada'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-surface-border/60 pt-3">
          <button type="button" onClick={() => loadBankSituation(transferencia.id)} disabled={consultandoSituacao === transferencia.id} className="inline-flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-[11px] font-bold text-secondary disabled:opacity-50">
            {consultandoSituacao === transferencia.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Consultar situação bancária
          </button>
          {transferencia.status === 'aguardando_recebimento' && <button type="button" onClick={() => confirmarRecebimento(transferencia.id).then(() => showResult(transferencia.direcao === 'banco_para_cofre' ? 'Recebimento físico confirmado; aguardando conciliação e aprovação Master.' : 'Operação confirmada; aguardando conciliação e aprovação Master.')).catch(error => showResult(error instanceof Error ? error.message : 'Não foi possível confirmar a operação.'))} className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-[11px] font-bold text-primary"><Check className="h-3 w-3" /> {transferencia.direcao === 'banco_para_cofre' ? 'Confirmar recebimento físico' : 'Confirmar operação'}</button>}
          {isMaster && transferencia.status === 'aprovada' && <button type="button" onClick={() => reverseTransfer(transferencia.id)} className="text-[10px] font-bold text-alert-red hover:underline">Estornar</button>}
        </div>

        {canReconcile && bankStatus !== 'conciliada' && <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-on-surface">Conciliação bancária específica do Cofre</p><button type="button" onClick={() => loadCandidates(transferencia.id)} disabled={carregandoCandidatas === transferencia.id} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-on-primary disabled:opacity-50">{carregandoCandidatas === transferencia.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3" />} Carregar candidatas</button></div>
          {transferCandidates.length > 0 && <div className="flex flex-col gap-2 sm:flex-row"><select value={candidataSelecionada[transferencia.id] || ''} onChange={event => setCandidataSelecionada(current => ({ ...current, [transferencia.id]: event.target.value }))} className="min-w-0 flex-1 rounded-md border border-surface-border bg-transparent px-2 py-1.5 text-xs text-on-surface"><option value="">Selecione uma transação do extrato</option>{transferCandidates.map(transacao => <option key={transacao.id} value={transacao.id}>{formatDate(transacao.data_transacao)} · {currency(transacao.valor)} · {transacao.descricao_banco}</option>)}</select><button type="button" onClick={() => reconcile(transferencia.id)} disabled={isMutating || !candidataSelecionada[transferencia.id]} className="inline-flex items-center justify-center gap-1 rounded-md border border-bank-truth-green px-3 py-1.5 text-xs font-bold text-bank-truth-green disabled:opacity-50"><Link2 className="h-3 w-3" /> Conciliar</button></div>}
          {transferCandidates.length === 0 && <p className="text-[11px] text-secondary">Carregue candidatas para selecionar a transação bancária correspondente.</p>}
        </div>}

        {transferencia.status === 'aguardando_master' && isMaster && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-surface p-3">
          <div className="flex items-start gap-2 text-[11px] text-secondary"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{canApprove ? 'Pré-requisitos completos. A decisão está centralizada na fila Master.' : `Aprovação bloqueada: ${missingApprovalRequirements.join('; ')}.`}</span></div>
          <button type="button" onClick={() => navigate('/aprovacao-master')} className="rounded-md bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-primary">Abrir fila Master</button>
        </div>}
      </article>
    );
  };

  if (isLoading) {
    return <div className="flex min-h-[400px] items-center justify-center text-sm text-secondary">Carregando cofre local...</div>;
  }

  const recentTransferencias = selectedTransferencias.slice(0, 8);
  const bancoParaCofre = recentTransferencias.filter(transferencia => transferencia.direcao === 'banco_para_cofre');
  const cofreParaBanco = recentTransferencias.filter(transferencia => transferencia.direcao === 'cofre_para_banco');

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><Coins className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Módulo 5</span></div>
          <h1 className="mt-1 text-2xl font-black text-on-background">Cofre Local</h1>
          <p className="mt-1 text-sm text-secondary">Saldo físico separado das contas bancárias, com aprovação e auditoria.</p>
        </div>
        {(role === 'master' || role === 'gerente') && <button type="button" onClick={() => setShowCreateCofre(!showCreateCofre)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm"><Plus className="h-4 w-4" /> Novo cofre</button>}
      </header>

      {notice && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{notice}</div>}

      {showCreateCofre && <form onSubmit={handleCreateCofre} className="grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-[1fr_180px_auto]"><input required value={cofreNome} onChange={event => setCofreNome(event.target.value)} placeholder="Nome do cofre" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" /><input required value={saldoInicial} onChange={event => setSaldoInicial(event.target.value)} placeholder="Saldo inicial" inputMode="decimal" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" /><button disabled={isMutating} className="rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cadastrar</button></form>}

      <section className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-3 text-sm font-bold text-on-surface"><ShieldCheck className="h-5 w-5 text-primary" /> Cofre selecionado<select value={selectedCofre?.id || ''} onChange={event => setSelectedCofreId(event.target.value)} className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm font-semibold outline-none"><option value="">Selecione...</option>{activeCofres.map(cofre => <option key={cofre.id} value={cofre.id}>{cofre.nome}</option>)}</select></label>
        {selectedCofre && <span className="text-xs font-bold uppercase tracking-wider text-secondary">Responsável da sessão: {user?.email || user?.id}</span>}
      </section>

      {selectedCofre && <>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-bank-truth-green" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo físico</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(selectedSaldo?.saldo_fisico || 0)}</p><p className="mt-1 text-[11px] text-secondary">Somente movimentos aprovados</p></div>
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-primary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo pendente</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(selectedSaldo?.saldo_pendente || 0)}</p><p className="mt-1 text-[11px] text-secondary">Aguardando decisão Master</p></div>
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-secondary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Pendências</p><p className="mt-2 text-2xl font-black text-on-surface">{selectedSaldo?.movimentos_pendentes || 0}</p><p className="mt-1 text-[11px] text-secondary">Movimentações em aprovação</p></div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Movimentações aguardando Master</p><p className="mt-2 text-2xl font-black text-on-surface">{selectedPendingMovimentacoes.length}</p></div>
          <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando recebimento</p><p className="mt-2 text-2xl font-black text-on-surface">{awaitingReceiving.length}</p></div>
          <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando conciliação</p><p className="mt-2 text-2xl font-black text-on-surface">{awaitingReconciliation.length}</p></div>
          <div className="rounded-lg border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Transferências aguardando Master</p><p className="mt-2 text-2xl font-black text-on-surface">{selectedPendingTransferencias.length}</p></div>
        </section>
      </>}

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={event => handleMovement(event, 'manual', { tipo: tipoManual, valor: valorManual, data: dataManual, descricao: descricaoManual })} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5"><div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Movimentação manual</h2></div><p className="text-xs text-secondary">Registre uma entrada ou saída física sem vincular a um lançamento financeiro.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-secondary">Tipo<select value={tipoManual} onChange={event => setTipoManual(event.target.value as TipoMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorManual} onChange={event => setValorManual(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataManual} onChange={event => setDataManual(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><label className="block text-xs font-bold text-secondary">Descrição<textarea required value={descricaoManual} onChange={event => setDescricaoManual(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">Registrar movimentação manual</button></form>

        <form onSubmit={event => handleMovement(event, 'baixa_direta', { tipo: tipoBaixa, valor: valorBaixa, data: dataBaixa, descricao: descricaoBaixa, lancamentoId })} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5"><div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Baixa direta</h2></div><p className="text-xs text-secondary">Baixe um lançamento financeiro aberto junto com a movimentação do cofre.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-secondary">Tipo<select value={tipoBaixa} onChange={event => setTipoBaixa(event.target.value as TipoMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorBaixa} onChange={event => setValorBaixa(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataBaixa} onChange={event => setDataBaixa(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><label className="block text-xs font-bold text-secondary">Lançamento aberto<select required value={lancamentoId} onChange={event => setLancamentoId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione o lançamento</option>{openLancamentos.map(lancamento => <option key={lancamento.id} value={lancamento.id}>{lancamento.codigo_sequencial || lancamento.id.slice(0, 8)} · {lancamento.observacoes || 'Sem descrição'} · {currency(lancamento.valor_previsto)}</option>)}</select></label><label className="block text-xs font-bold text-secondary">Descrição<textarea required value={descricaoBaixa} onChange={event => setDescricaoBaixa(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">Registrar baixa direta</button></form>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface p-5"><form onSubmit={handleTransfer} className="space-y-4"><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Criar transferência banco ↔ cofre</h2></div><p className="text-xs text-secondary">Cria o cabeçalho, o movimento do cofre e o lançamento bancário espelho. Não é receita nem despesa.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-bold text-secondary">Direção<select value={direcao} onChange={event => setDirecao(event.target.value as typeof direcao)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="banco_para_cofre">Banco para cofre</option><option value="cofre_para_banco">Cofre para banco</option></select></label><label className="text-xs font-bold text-secondary">Conta bancária<select required value={contaBancariaId} onChange={event => setContaBancariaId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione...</option>{contas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome} · {conta.nome_banco}</option>)}</select></label><label className="text-xs font-bold text-secondary">Valor<input required value={valorTransferencia} onChange={event => setValorTransferencia(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label><label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataTransferencia} onChange={event => setDataTransferencia(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label></div><button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Criar transferência</button></form></section>

      <section className="grid gap-6 xl:grid-cols-2"><div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Movimentações do cofre</h2><span className="text-xs font-bold text-secondary">{selectedMovimentacoes.length} registros</span></div><div className="space-y-2">{selectedMovimentacoes.length === 0 ? <p className="py-8 text-center text-sm text-secondary">Nenhuma movimentação registrada.</p> : selectedMovimentacoes.map(movimento => <div key={movimento.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-on-surface">{movimento.descricao}</p><p className="text-[10px] uppercase tracking-wider text-secondary">{movimento.tipo} · {movimento.origem} · resp. {movimento.responsavel_id}</p><p className="text-[10px] text-secondary">Confirmação: {movimento.confirmado_recebimento_por ? `${movimento.confirmado_recebimento_por} · ${formatDate(movimento.confirmado_recebimento_em)}` : '—'} · Aprovado por: {movimento.aprovado_por ? `${movimento.aprovado_por} · ${formatDate(movimento.aprovado_em)}` : '—'}</p></div><div className="text-right"><p className={`text-sm font-black ${movimento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{movimento.tipo === 'entrada' ? '+' : '-'}{currency(movimento.valor)}</p><p className="text-[10px] font-bold text-secondary">{statusLabel[movimento.status] || movimento.status}</p>{isMaster && movimento.status === 'aprovado' && <button type="button" onClick={() => reverseMovement(movimento.id)} className="mt-1 text-[10px] font-bold text-alert-red hover:underline">Estornar</button>}</div></div>)}</div></div><div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Transferências recentes</h2><ArrowLeftRight className="h-4 w-4 text-secondary" /></div><div className="grid gap-4">{selectedTransferencias.length === 0 ? <p className="py-8 text-center text-sm text-secondary">Nenhuma transferência registrada.</p> : <><div><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-secondary">Banco → Cofre ({bancoParaCofre.length})</h3><div className="space-y-3">{bancoParaCofre.length ? bancoParaCofre.map(renderTransferencia) : <p className="text-sm text-secondary">Nenhuma transferência recente nesta direção.</p>}</div></div><div><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-secondary">Cofre → Banco ({cofreParaBanco.length})</h3><div className="space-y-3">{cofreParaBanco.length ? cofreParaBanco.map(renderTransferencia) : <p className="text-sm text-secondary">Nenhuma transferência recente nesta direção.</p>}</div></div></>}</div></div></section>

      {isMaster && <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Fila de aprovação Master</h2></div><button type="button" onClick={() => navigate('/aprovacao-master')} className="rounded-md bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-primary">Abrir fila central</button></div><p className="text-xs text-secondary">As decisões do Cofre são realizadas exclusivamente na fila centralizada, com justificativa e histórico.</p><div className="grid gap-3 lg:grid-cols-2"><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Movimentações ({pendingMovimentacoes.length})</h3>{pendingMovimentacoes.length === 0 && <p className="text-sm text-secondary">Nenhuma movimentação aguardando decisão.</p>}{pendingMovimentacoes.map(movimento => <div key={movimento.id} className="rounded-lg border border-surface-border bg-surface p-3"><p className="text-sm font-bold">{movimento.descricao}</p><p className="text-[10px] text-secondary">{movimento.responsavel_id} · {currency(movimento.valor)}</p></div>)}</div><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Transferências ({pendingTransferencias.length})</h3>{pendingTransferencias.length === 0 && <p className="text-sm text-secondary">Nenhuma transferência aguardando decisão.</p>}{pendingTransferencias.map(transferencia => <div key={transferencia.id} className="rounded-lg border border-surface-border bg-surface p-3"><p className="text-sm font-bold">{transferencia.direcao === 'banco_para_cofre' ? 'Banco → Cofre' : 'Cofre → Banco'}</p><p className="text-[10px] text-secondary">{currency(transferencia.valor)} · {statusLabel[transferencia.status] || transferencia.status}</p></div>)}</div></div></section>}

      {isMaster && <section className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-black text-on-surface">Auditoria recente do cofre</h2></div><div className="space-y-2">{auditoriaCofre.length === 0 && <p className="text-sm text-secondary">Nenhum evento de cofre encontrado.</p>}{auditoriaCofre.map(log => <div key={log.id} className="rounded-md border border-surface-border/60 p-2 text-xs text-secondary"><p><span className="font-bold text-on-surface">{formatId(log.usuario_id)}</span> · <span className="font-bold text-on-surface">{log.acao}</span> · {log.tabela_afetada}</p><p className="mt-1">Origem: {log.origem_alteracao || '—'} · {formatDate(log.data_hora)}</p>{(log.justificativa || log.status_anterior || log.status_novo) && <p className="mt-1">{log.status_anterior || log.status_novo ? `Status: ${log.status_anterior || '—'} → ${log.status_novo || '—'}` : ''}{log.justificativa ? ` · Justificativa: ${log.justificativa}` : ''}</p>}</div>)}</div></section>}
    </div>
  );
}
