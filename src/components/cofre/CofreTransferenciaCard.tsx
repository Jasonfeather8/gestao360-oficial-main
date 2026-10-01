import { Banknote, Check, CircleAlert, Link2, Loader2, RefreshCw } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { ContaBancaria, LancamentoFinanceiro, SituacaoBancariaTransferenciaCofre, TransacaoBanco, TransferenciaCofre } from '../../types';

export type CofreTransferenciaCardProps = {
  transferencia: TransferenciaCofre;
  situacoesBancarias: Record<string, SituacaoBancariaTransferenciaCofre>;
  candidatas: Record<string, TransacaoBanco[]>;
  candidataSelecionada: Record<string, string>;
  lancamentos: LancamentoFinanceiro[];
  contas: ContaBancaria[];
  consultandoSituacao: string;
  carregandoCandidatas: string;
  isMutating: boolean;
  isMaster: boolean;
  statusLabel: Record<string, string>;
  currency: (value: number) => string;
  formatDate: (value?: string | null) => string;
  formatId: (value?: string | null) => string;
  setCandidataSelecionada: Dispatch<SetStateAction<Record<string, string>>>;
  loadBankSituation: (transferenciaId: string) => void;
  confirmarRecebimento: (transferenciaId: string) => Promise<unknown>;
  reverseTransfer: (transferenciaId: string) => void;
  loadCandidates: (transferenciaId: string) => void;
  reconcile: (transferenciaId: string) => void;
  showResult: (message: string) => void;
  onNavigate: (path: string) => void;
};

export default function CofreTransferenciaCard({
  transferencia,
  situacoesBancarias,
  candidatas,
  candidataSelecionada,
  lancamentos,
  contas,
  consultandoSituacao,
  carregandoCandidatas,
  isMutating,
  isMaster,
  statusLabel,
  currency,
  formatDate,
  formatId,
  setCandidataSelecionada,
  loadBankSituation,
  confirmarRecebimento,
  reverseTransfer,
  loadCandidates,
  reconcile,
  showResult,
  onNavigate,
}: CofreTransferenciaCardProps) {
  const situacao = situacoesBancarias[transferencia.id];
  const transferCandidates = candidatas[transferencia.id] || [];
  const selectedTransaction = transferCandidates.find(transacao => transacao.id === (transferencia.transacao_banco_id || candidataSelecionada[transferencia.id]));
  const mirror = lancamentos.find(lancamento => lancamento.id === transferencia.lancamento_bancario_id);
  const account = contas.find(conta => conta.id === transferencia.conta_bancaria_id);
  const bankStatus = situacao?.status_bancario || transferencia.status_bancario || 'aguardando_conciliacao';
  const canReconcile = !['estornada', 'reprovada', 'aprovada'].includes(transferencia.status);
  const missingApprovalRequirements: string[] = [];
  if (!transferencia.recebido_por || !transferencia.recebido_em) missingApprovalRequirements.push('confirmação operacional de recebimento');
  if (transferencia.status_bancario !== 'conciliada' || !transferencia.transacao_banco_id) missingApprovalRequirements.push('conciliação bancária');
  if (!transferencia.direcao || !transferencia.cofre_id || !transferencia.conta_bancaria_id || !transferencia.lancamento_bancario_id || !transferencia.movimentacao_cofre_id || !transferencia.criado_por || !transferencia.data_transferencia || Number(transferencia.valor) <= 0) {
    missingApprovalRequirements.push('dados obrigatórios da transferência');
  }
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
        <button type="button" onClick={() => onNavigate('/aprovacao-master')} className="rounded-md bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-primary">Abrir fila Master</button>
      </div>}
    </article>
  );
}
