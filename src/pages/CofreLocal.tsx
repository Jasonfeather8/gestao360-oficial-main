import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCofreLocal, useContas, useLancamentos, useAuditoriaLogs } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import CofreRecentTransfers from '../components/cofre/CofreRecentTransfers';
import CofreBalanceCards from '../components/cofre/CofreBalanceCards';
import CofreBankTransferForm from '../components/cofre/CofreBankTransferForm';
import CofreCreateForm from '../components/cofre/CofreCreateForm';
import CofreDirectWriteoffForm from '../components/cofre/CofreDirectWriteoffForm';
import CofreHeader from '../components/cofre/CofreHeader';
import CofreManualMovementForm from '../components/cofre/CofreManualMovementForm';
import CofrePendingCounters from '../components/cofre/CofrePendingCounters';
import CofreSelector from '../components/cofre/CofreSelector';
import CofreMovements from '../components/cofre/CofreMovements';
import CofreMasterApprovalQueue from '../components/cofre/CofreMasterApprovalQueue';
import CofreRecentAudit from '../components/cofre/CofreRecentAudit';
import { type SituacaoBancariaTransferenciaCofre, type TransacaoBanco, type TipoMovimentacaoCofre } from '../types';

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

  if (isLoading) {
    return <div className="flex min-h-[400px] items-center justify-center text-sm text-secondary">Carregando cofre local...</div>;
  }

  const recentTransferencias = selectedTransferencias.slice(0, 8);
  const bancoParaCofre = recentTransferencias.filter(transferencia => transferencia.direcao === 'banco_para_cofre');
  const cofreParaBanco = recentTransferencias.filter(transferencia => transferencia.direcao === 'cofre_para_banco');

  return (
    <div className="space-y-6">
      <CofreHeader canCreate={role === 'master' || role === 'gerente'} onCreateClick={() => setShowCreateCofre(!showCreateCofre)} />

      {notice && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{notice}</div>}

      {showCreateCofre && <CofreCreateForm onSubmit={handleCreateCofre} cofreNome={cofreNome} setCofreNome={setCofreNome} saldoInicial={saldoInicial} setSaldoInicial={setSaldoInicial} isMutating={isMutating} />}

      <CofreSelector activeCofres={activeCofres} selectedCofre={selectedCofre} setSelectedCofreId={setSelectedCofreId} responsible={user?.email || user?.id} />

      {selectedCofre && <>
        <CofreBalanceCards saldo={selectedSaldo} currency={currency} />
        <CofrePendingCounters pendingMovimentacoes={selectedPendingMovimentacoes.length} awaitingReceiving={awaitingReceiving.length} awaitingReconciliation={awaitingReconciliation.length} pendingTransferencias={selectedPendingTransferencias.length} />
      </>}

      <section className="grid gap-6 xl:grid-cols-2">
        <CofreManualMovementForm onSubmit={event => handleMovement(event, 'manual', { tipo: tipoManual, valor: valorManual, data: dataManual, descricao: descricaoManual })} tipoManual={tipoManual} setTipoManual={setTipoManual} valorManual={valorManual} setValorManual={setValorManual} dataManual={dataManual} setDataManual={setDataManual} descricaoManual={descricaoManual} setDescricaoManual={setDescricaoManual} isMutating={isMutating} selectedCofre={selectedCofre} />

        <CofreDirectWriteoffForm onSubmit={event => handleMovement(event, 'baixa_direta', { tipo: tipoBaixa, valor: valorBaixa, data: dataBaixa, descricao: descricaoBaixa, lancamentoId })} tipoBaixa={tipoBaixa} setTipoBaixa={setTipoBaixa} valorBaixa={valorBaixa} setValorBaixa={setValorBaixa} dataBaixa={dataBaixa} setDataBaixa={setDataBaixa} lancamentoId={lancamentoId} setLancamentoId={setLancamentoId} descricaoBaixa={descricaoBaixa} setDescricaoBaixa={setDescricaoBaixa} openLancamentos={openLancamentos} currency={currency} isMutating={isMutating} selectedCofre={selectedCofre} />
      </section>

      <section className="rounded-xl border border-surface-border bg-surface p-5"><CofreBankTransferForm onSubmit={handleTransfer} direcao={direcao} setDirecao={setDirecao} contaBancariaId={contaBancariaId} setContaBancariaId={setContaBancariaId} valorTransferencia={valorTransferencia} setValorTransferencia={setValorTransferencia} dataTransferencia={dataTransferencia} setDataTransferencia={setDataTransferencia} contas={contas} isMutating={isMutating} selectedCofre={selectedCofre} /></section>

      <section className="grid gap-6 xl:grid-cols-2"><CofreMovements movimentacoes={selectedMovimentacoes} isMaster={isMaster} statusLabel={statusLabel} currency={currency} formatDate={formatDate} onReverseMovement={reverseMovement} /><CofreRecentTransfers bancoParaCofre={bancoParaCofre} cofreParaBanco={cofreParaBanco} hasNoTransfers={selectedTransferencias.length === 0} situacoesBancarias={situacoesBancarias} candidatas={candidatas} candidataSelecionada={candidataSelecionada} lancamentos={lancamentos} contas={contas} consultandoSituacao={consultandoSituacao} carregandoCandidatas={carregandoCandidatas} isMutating={isMutating} isMaster={isMaster} statusLabel={statusLabel} currency={currency} formatDate={formatDate} formatId={formatId} setCandidataSelecionada={setCandidataSelecionada} loadBankSituation={loadBankSituation} confirmarRecebimento={confirmarRecebimento} reverseTransfer={reverseTransfer} loadCandidates={loadCandidates} reconcile={reconcile} showResult={showResult} onNavigate={navigate} /></section>

      {isMaster && <CofreMasterApprovalQueue pendingMovimentacoes={pendingMovimentacoes} pendingTransferencias={pendingTransferencias} statusLabel={statusLabel} currency={currency} onOpenQueue={() => navigate('/aprovacao-master')} />}

      {isMaster && <CofreRecentAudit auditoria={auditoriaCofre} formatId={formatId} formatDate={formatDate} />}
    </div>
  );
}
