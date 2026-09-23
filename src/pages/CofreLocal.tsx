import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Coins,
  Landmark,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCofreLocal, useContas, useLancamentos, useAuditoriaLogs } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { OrigemMovimentacaoCofre, TipoMovimentacaoCofre } from '../types';

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const statusLabel: Record<string, string> = {
  aguardando_master: 'Aguardando Master',
  aguardando_recebimento: 'Aguardando recebimento',
  aprovado: 'Aprovado',
  aprovada: 'Aprovada',
  reprovado: 'Reprovado',
  reprovada: 'Reprovada',
  estornado: 'Estornado',
};

export default function CofreLocal() {
  const { role, user } = useAuth();
  const isMaster = role === 'master';
  const { data: contas = [] } = useContas();
  const { data: lancamentos = [] } = useLancamentos({ pageSize: 1000, financialStatus: 'aberto' });
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
    estornarMovimentacao,
    estornarTransferencia,
  } = useCofreLocal();

  const [selectedCofreId, setSelectedCofreId] = useState('');
  const [showCreateCofre, setShowCreateCofre] = useState(false);
  const [cofreNome, setCofreNome] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('0,00');
  const [tipo, setTipo] = useState<TipoMovimentacaoCofre>('entrada');
  const [valor, setValor] = useState('');
  const [dataMovimentacao, setDataMovimentacao] = useState(today);
  const [descricao, setDescricao] = useState('');
  const [origem, setOrigem] = useState<OrigemMovimentacaoCofre>('manual');
  const [lancamentoId, setLancamentoId] = useState('');
  const [direcao, setDirecao] = useState<'banco_para_cofre' | 'cofre_para_banco'>('banco_para_cofre');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [valorTransferencia, setValorTransferencia] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState(today);
  const [notice, setNotice] = useState('');

  const activeCofres = useMemo(() => cofres.filter(cofre => cofre.status === 'ativo'), [cofres]);
  const selectedCofre = cofres.find(cofre => cofre.id === selectedCofreId) || activeCofres[0];
  const selectedSaldo = saldos.find(saldo => saldo.cofre_id === selectedCofre?.id);
  const selectedMovimentacoes = movimentacoes.filter(movimento => movimento.cofre_id === selectedCofre?.id);
  const pendingMovimentacoes = movimentacoes.filter(movimento => movimento.status === 'aguardando_master');
  const pendingTransferencias = transferencias.filter(transferencia => transferencia.status === 'aguardando_master');

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

  const handleMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCofre) return showResult('Selecione um cofre ativo.');
    try {
      await criarMovimentacao({
        cofreId: selectedCofre.id,
        tipo,
        valor: Number(valor.replace(',', '.')) || 0,
        dataMovimentacao,
        descricao,
        origem,
        lancamentoId: origem === 'baixa_direta' ? lancamentoId || null : null,
      });
      setValor('');
      setDescricao('');
      setLancamentoId('');
      showResult(isMaster ? 'Movimentação criada e aprovada pelo Master.' : 'Movimentação enviada para aprovação do Master.');
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
      showResult('Transferência criada. A confirmação manual e a aprovação permanecem separadas.');
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

  const formatAuditAction = (action: string) => action === 'INSERT' ? 'criou' : action === 'UPDATE' ? 'atualizou' : 'removeu';

  if (isLoading) {
    return <div className="flex min-h-[400px] items-center justify-center text-sm text-secondary">Carregando cofre local...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><Coins className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Etapa 7</span></div>
          <h1 className="mt-1 text-2xl font-black text-on-background">Cofre Local</h1>
          <p className="mt-1 text-sm text-secondary">Saldo físico separado das contas bancárias, com aprovação e auditoria.</p>
        </div>
        {(role === 'master' || role === 'gerente') && (
          <button type="button" onClick={() => setShowCreateCofre(!showCreateCofre)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm"><Plus className="h-4 w-4" /> Novo cofre</button>
        )}
      </header>

      {notice && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{notice}</div>}

      {showCreateCofre && (
        <form onSubmit={handleCreateCofre} className="grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-[1fr_180px_auto]">
          <input required value={cofreNome} onChange={event => setCofreNome(event.target.value)} placeholder="Nome do cofre" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" />
          <input required value={saldoInicial} onChange={event => setSaldoInicial(event.target.value)} placeholder="Saldo inicial" inputMode="decimal" className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary" />
          <button disabled={isMutating} className="rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cadastrar</button>
        </form>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-3 text-sm font-bold text-on-surface"><ShieldCheck className="h-5 w-5 text-primary" /> Cofre selecionado
          <select value={selectedCofre?.id || ''} onChange={event => setSelectedCofreId(event.target.value)} className="rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm font-semibold outline-none">
            <option value="">Selecione...</option>
            {activeCofres.map(cofre => <option key={cofre.id} value={cofre.id}>{cofre.nome}</option>)}
          </select>
        </label>
        {selectedCofre && <span className="text-xs font-bold uppercase tracking-wider text-secondary">Responsável da sessão: {user?.email || user?.id}</span>}
      </section>

      {selectedCofre && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-bank-truth-green" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo físico</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(selectedSaldo?.saldo_fisico || 0)}</p><p className="mt-1 text-[11px] text-secondary">Somente movimentos aprovados</p></div>
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-primary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Saldo pendente</p><p className="mt-2 text-2xl font-black text-on-surface">{currency(selectedSaldo?.saldo_pendente || 0)}</p><p className="mt-1 text-[11px] text-secondary">Aguardando decisão Master</p></div>
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5"><div className="absolute left-0 top-0 h-full w-1 bg-secondary" /><p className="text-xs font-bold uppercase tracking-wider text-secondary">Pendências</p><p className="mt-2 text-2xl font-black text-on-surface">{selectedSaldo?.movimentos_pendentes || 0}</p><p className="mt-1 text-[11px] text-secondary">Movimentações em aprovação</p></div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleMovement} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5">
          <div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Entrada ou saída manual</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-secondary">Tipo<select value={tipo} onChange={event => setTipo(event.target.value as TipoMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>
            <label className="text-xs font-bold text-secondary">Valor<input required value={valor} onChange={event => setValor(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label>
            <label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataMovimentacao} onChange={event => setDataMovimentacao(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label>
            <label className="text-xs font-bold text-secondary">Origem<select value={origem} onChange={event => setOrigem(event.target.value as OrigemMovimentacaoCofre)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="manual">Manual</option><option value="baixa_direta">Baixa direta</option></select></label>
          </div>
          {origem === 'baixa_direta' && <label className="block text-xs font-bold text-secondary">Lançamento aberto<select required value={lancamentoId} onChange={event => setLancamentoId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione o lançamento</option>{lancamentos.filter(lancamento => lancamento.status_pagamento === 'aberto').map(lancamento => <option key={lancamento.id} value={lancamento.id}>{lancamento.codigo_sequencial || lancamento.id.slice(0, 8)} · {lancamento.observacoes || 'Sem descrição'} · {currency(lancamento.valor_previsto)}</option>)}</select></label>}
          <label className="block text-xs font-bold text-secondary">Descrição<textarea required value={descricao} onChange={event => setDescricao(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label>
          <button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">Registrar movimentação</button>
        </form>

        <form onSubmit={handleTransfer} className="space-y-4 rounded-xl border border-surface-border bg-surface p-5">
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Transferência banco ↔ cofre</h2></div>
          <p className="text-xs text-secondary">Cria o cabeçalho, o movimento do cofre e o lançamento bancário espelho. Não é receita nem despesa.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-secondary">Direção<select value={direcao} onChange={event => setDirecao(event.target.value as typeof direcao)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="banco_para_cofre">Banco para cofre</option><option value="cofre_para_banco">Cofre para banco</option></select></label>
            <label className="text-xs font-bold text-secondary">Conta bancária<select required value={contaBancariaId} onChange={event => setContaBancariaId(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface"><option value="">Selecione...</option>{contas.map(conta => <option key={conta.id} value={conta.id}>{conta.nome} · {conta.nome_banco}</option>)}</select></label>
            <label className="text-xs font-bold text-secondary">Valor<input required value={valorTransferencia} onChange={event => setValorTransferencia(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label>
            <label className="text-xs font-bold text-secondary">Data<input required type="date" value={dataTransferencia} onChange={event => setDataTransferencia(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface" /></label>
          </div>
          <button disabled={isMutating || !selectedCofre} className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Criar transferência</button>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Movimentações do cofre</h2><span className="text-xs font-bold text-secondary">{selectedMovimentacoes.length} registros</span></div><div className="space-y-2">{selectedMovimentacoes.length === 0 ? <p className="py-8 text-center text-sm text-secondary">Nenhuma movimentação registrada.</p> : selectedMovimentacoes.map(movimento => <div key={movimento.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-on-surface">{movimento.descricao}</p><p className="text-[10px] uppercase tracking-wider text-secondary">{movimento.tipo} · {movimento.origem} · resp. {movimento.responsavel_id.slice(0, 8)}</p></div><div className="text-right"><p className={`text-sm font-black ${movimento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{movimento.tipo === 'entrada' ? '+' : '-'}{currency(movimento.valor)}</p><p className="text-[10px] font-bold text-secondary">{statusLabel[movimento.status] || movimento.status}</p>{isMaster && movimento.status === 'aprovado' && <button type="button" onClick={() => reverseMovement(movimento.id)} className="mt-1 text-[10px] font-bold text-alert-red hover:underline">Estornar</button>}</div></div>)}</div></div>
        <div className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-on-surface">Transferências recentes</h2><ArrowLeftRight className="h-4 w-4 text-secondary" /></div><div className="space-y-2">{transferencias.length === 0 ? <p className="py-8 text-center text-sm text-secondary">Nenhuma transferência registrada.</p> : transferencias.slice(0, 8).map(transferencia => <div key={transferencia.id} className="rounded-lg border border-surface-border/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-on-surface">{transferencia.direcao === 'banco_para_cofre' ? 'Banco → Cofre' : 'Cofre → Banco'}</p><p className="text-sm font-black text-on-surface">{currency(transferencia.valor)}</p></div><p className="mt-1 text-[10px] uppercase tracking-wider text-secondary">{statusLabel[transferencia.status] || transferencia.status} · criado por {transferencia.criado_por.slice(0, 8)}</p>{transferencia.status === 'aguardando_recebimento' && <button type="button" onClick={() => confirmarRecebimento(transferencia.id).then(() => showResult('Recebimento confirmado; aguardando aprovação Master.')).catch(error => showResult(error instanceof Error ? error.message : 'Não foi possível confirmar o recebimento.'))} className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-[11px] font-bold text-primary"><Check className="h-3 w-3" /> Confirmar recebimento</button>}{isMaster && transferencia.status === 'aprovada' && <button type="button" onClick={() => reverseTransfer(transferencia.id)} className="ml-2 mt-2 text-[10px] font-bold text-alert-red hover:underline">Estornar</button>}</div>)}</div></div>
      </section>

      {isMaster && (
        <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-black text-on-surface">Fila de aprovação Master</h2></div><p className="text-xs text-secondary">As decisões são validadas no servidor. Reprovações exigem justificativa e preservam o histórico.</p><div className="grid gap-3 lg:grid-cols-2"><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Movimentações ({pendingMovimentacoes.length})</h3>{pendingMovimentacoes.map(movimento => <div key={movimento.id} className="rounded-lg border border-surface-border bg-surface p-3"><div className="flex justify-between gap-2"><div><p className="text-sm font-bold">{movimento.descricao}</p><p className="text-[10px] text-secondary">{movimento.responsavel_id} · {currency(movimento.valor)}</p></div><div className="flex gap-1"><button type="button" onClick={() => decideMovement(movimento.id, true)} className="rounded-md bg-bank-truth-green/15 p-2 text-bank-truth-green" aria-label="Aprovar movimentação"><CheckCircle2 className="h-4 w-4" /></button><button type="button" onClick={() => decideMovement(movimento.id, false)} className="rounded-md bg-alert-red/15 p-2 text-alert-red" aria-label="Reprovar movimentação"><X className="h-4 w-4" /></button></div></div></div>)}</div><div className="space-y-2"><h3 className="text-xs font-black uppercase tracking-wider text-secondary">Transferências ({pendingTransferencias.length})</h3>{pendingTransferencias.map(transferencia => <div key={transferencia.id} className="rounded-lg border border-surface-border bg-surface p-3"><div className="flex justify-between gap-2"><div><p className="text-sm font-bold">{transferencia.direcao === 'banco_para_cofre' ? 'Banco → Cofre' : 'Cofre → Banco'}</p><p className="text-[10px] text-secondary">criado por {transferencia.criado_por} · recebido por {transferencia.recebido_por || '—'} · {currency(transferencia.valor)}</p></div><div className="flex gap-1"><button type="button" onClick={() => decideTransfer(transferencia.id, true)} className="rounded-md bg-bank-truth-green/15 p-2 text-bank-truth-green" aria-label="Aprovar transferência"><CheckCircle2 className="h-4 w-4" /></button><button type="button" onClick={() => decideTransfer(transferencia.id, false)} className="rounded-md bg-alert-red/15 p-2 text-alert-red" aria-label="Reprovar transferência"><X className="h-4 w-4" /></button></div></div></div>)}</div></div></section>
      )}

      {isMaster && <section className="rounded-xl border border-surface-border bg-surface p-5"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-black text-on-surface">Auditoria recente do cofre</h2></div><div className="space-y-1">{auditoria.filter(log => ['cofres_locais', 'movimentacoes_cofre', 'transferencias_cofre'].includes(log.tabela_afetada)).slice(0, 8).map(log => <p key={log.id} className="text-xs text-secondary"><span className="font-bold text-on-surface">{log.usuario_id?.slice(0, 8) || 'sistema'}</span> {formatAuditAction(log.acao)} {log.tabela_afetada} · {new Date(log.data_hora).toLocaleString('pt-BR')}</p>)}{auditoria.filter(log => ['cofres_locais', 'movimentacoes_cofre', 'transferencias_cofre'].includes(log.tabela_afetada)).length === 0 && <p className="text-sm text-secondary">Nenhum evento de cofre encontrado.</p>}</div></section>}
    </div>
  );
}
