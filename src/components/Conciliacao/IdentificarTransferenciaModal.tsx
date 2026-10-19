import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, X } from 'lucide-react';
import { useIdentificarTransacaoTransferencia, useSugerirTransferenciasDestino } from '../../hooks/useData';
import type { ContaBancaria, LinhaExtrato, TransferenciaBancaria } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const mensagemAmbiguidade = 'Há mais de uma transferência compatível; selecione a transferência existente pela sugestão';

function formatarData(data: string): string {
  return dataFormatada.format(new Date(`${data}T00:00:00Z`));
}

interface IdentificarTransferenciaModalProps {
  linha: LinhaExtrato;
  contaTransacaoId: string;
  contas: ContaBancaria[];
  onFechar: () => void;
  onIdentificada: (transferencia: TransferenciaBancaria) => void;
}

export default function IdentificarTransferenciaModal({ linha, contaTransacaoId, contas, onFechar, onIdentificada }: IdentificarTransferenciaModalProps) {
  const transacaoId = linha.transacaoBancoId || null;
  const [contaRelacionadaId, setContaRelacionadaId] = useState('');
  const [erro, setErro] = useState('');
  const [sugerir, setSugerir] = useState(false);
  const { identificarTransacaoTransferencia, isIdentificando } = useIdentificarTransacaoTransferencia();
  const { data: sugestoes = [], isLoading: carregandoSugestoes, isError: erroSugestoes } = useSugerirTransferenciasDestino(sugerir ? transacaoId : null);
  const contasAtivas = contas.filter((conta) => conta.id !== contaTransacaoId && conta.status !== 'excluido');

  const confirmar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');
    setSugerir(false);
    if (!transacaoId || !contaRelacionadaId || contaRelacionadaId === contaTransacaoId) return;
    try {
      const transferencia = await identificarTransacaoTransferencia({ transacaoId, contaRelacionadaId });
      onIdentificada(transferencia);
      onFechar();
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível identificar a transferência.';
      setErro(mensagem);
      if (mensagem.includes(mensagemAmbiguidade)) setSugerir(true);
    }
  };

  const nomeConta = (transferencia: TransferenciaBancaria, lado: 'origem' | 'destino') => {
    const contaId = lado === 'origem' ? transferencia.conta_origem_id : transferencia.conta_destino_id;
    return contas.find((conta) => conta.id === contaId)?.nome || 'Conta';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <section role="dialog" aria-modal="true" aria-labelledby="identificar-transferencia-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="identificar-transferencia-title" className="text-xl font-black text-on-surface">Marcar transação como transferência</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Informe a outra conta envolvida para localizar ou registrar a transferência pelos fluxos autorizados.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-2 text-on-surface-variant hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" /></button>
        </header>

        <div className="mb-5 rounded-2xl border border-surface-border bg-surface-container-low p-4">
          <div className="flex items-start gap-3">
            {linha.direcao === 'entrada'
              ? <ArrowUpRight aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bank-truth-green" />
              : <ArrowDownLeft aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-alert-red" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-on-surface-variant">{formatarData(linha.data)} · {linha.direcao === 'entrada' ? 'Entrada' : 'Saída'}</p>
              <p className="mt-1 text-sm font-bold text-on-surface">{linha.descricao || 'Transação sem descrição'}</p>
              <p className="mt-1 text-sm font-black text-on-surface">{moeda.format(linha.valor)}</p>
            </div>
          </div>
        </div>

        <form onSubmit={confirmar} className="space-y-4">
          <div>
            <label htmlFor="conta-relacionada-transferencia" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-secondary">Conta relacionada</label>
            <select id="conta-relacionada-transferencia" aria-label="Conta relacionada" value={contaRelacionadaId} onChange={(event) => setContaRelacionadaId(event.target.value)} className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-surface">
              <option value="">Selecione a conta relacionada</option>
              {contasAtivas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          </div>

          {erro && <p role="alert" className="rounded-xl bg-alert-red/10 p-3 text-sm font-semibold text-alert-red">{erro}</p>}
          {sugerir && (
            <section className="space-y-2 rounded-xl border border-pending-amber/30 bg-pending-amber/10 p-3">
              <p className="text-sm font-semibold text-on-surface">Há várias transferências compatíveis. A conciliação deve ser feita na aba Transferências, escolhendo a transferência correta.</p>
              {carregandoSugestoes ? <p role="status" className="text-xs text-on-surface-variant">Carregando sugestões…</p>
                : erroSugestoes ? <p role="alert" className="text-xs text-alert-red">Não foi possível carregar as sugestões.</p>
                  : sugestoes.length === 0 ? <p className="text-xs text-on-surface-variant">Nenhuma sugestão de destino disponível.</p>
                    : <ul className="max-h-40 space-y-2 overflow-y-auto">
                      {sugestoes.map((transferencia) => (
                        <li key={transferencia.id} className="rounded-lg bg-white/70 p-2 text-xs text-on-surface dark:bg-surface">
                          {formatarData(transferencia.data_transferencia)} · {nomeConta(transferencia, 'origem')} → {nomeConta(transferencia, 'destino')} · {moeda.format(Number(transferencia.valor))}
                        </li>
                      ))}
                    </ul>}
            </section>
          )}

          <footer className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onFechar} className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-bold text-on-surface hover:bg-surface">Cancelar</button>
            <button type="submit" disabled={!contaRelacionadaId || contaRelacionadaId === contaTransacaoId || isIdentificando} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {isIdentificando && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {isIdentificando ? 'Identificando…' : 'Confirmar transferência'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
