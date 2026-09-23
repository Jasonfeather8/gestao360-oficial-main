import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileCheck2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useImplantacaoValidation } from '../hooks/useData';

function EvidenceStatus({ value, label, pendingWhenZero = false, positiveIsAttention = true }: { value: number | null | undefined; label: string; pendingWhenZero?: boolean; positiveIsAttention?: boolean }) {
  const pending = value === null || value === undefined || (pendingWhenZero && value === 0);
  const attention = !pending && positiveIsAttention && value > 0;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-border/70 py-3 last:border-b-0">
      <span className="text-xs font-semibold text-on-surface">{label}</span>
      <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${pending ? 'text-amber-700' : attention ? 'text-alert-red' : 'text-bank-truth-green'}`}>
        {pending ? <Clock className="h-3.5 w-3.5" /> : attention ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {pending ? 'Pendente' : attention ? `${value} ocorrência${value === 1 ? '' : 's'}` : positiveIsAttention ? 'Verificado' : `${value} disponível${value === 1 ? '' : 'is'}`}
      </span>
    </div>
  );
}

function Wave({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-white">{number}</span>
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface">{title}</h2>
          <p className="mt-1 text-xs text-secondary">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-surface-border/70">{children}</div>
    </section>
  );
}

export default function Implantacao() {
  const { data, isLoading, isFetching, refetch } = useImplantacaoValidation();

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-black uppercase tracking-tight text-on-surface">Validação da implantação</h1>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-secondary">Consulta somente leitura das evidências disponíveis. Nenhuma aprovação, importação, baixa, cancelamento ou alteração é executada nesta tela.</p>
        </div>
        <button type="button" onClick={() => refetch()} className="flex items-center gap-2 self-start rounded-lg border border-surface-border px-3 py-2 text-[10px] font-black uppercase tracking-wider text-secondary hover:border-primary hover:text-primary" disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar leitura
        </button>
      </header>

      {data?.unavailable_sources.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-black uppercase tracking-wider">Fontes não disponíveis para esta sessão</p>
          <p className="mt-1">{data.unavailable_sources.join(' · ')}. Estas evidências permanecem pendentes por falta de leitura autorizada.</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-xs font-semibold text-secondary">Consultando evidências...</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Wave number="1" title="Ambiente de teste" description="PDF real do Cora, CSVs enviados, dados existentes, duplicidade, diferenças, cancelamento e múltiplos lançamentos.">
            <EvidenceStatus value={null} label="PDF real do Cora" />
            <EvidenceStatus value={null} label="CSVs enviados" />
            <EvidenceStatus value={data?.imported_statement_count} label="Dados existentes (extratos registrados)" pendingWhenZero positiveIsAttention={false} />
            <EvidenceStatus value={data?.duplicate_transaction_hashes} label="Duplicidade de hashes de transações" />
            <EvidenceStatus value={data?.unclassified_differences} label="Diferenças sem classificação ou justificativa" />
            <EvidenceStatus value={null} label="Cancelamento operacional com usuário real" />
            <EvidenceStatus value={data?.multiple_entry_conciliations} label="Múltiplos lançamentos conciliados" positiveIsAttention={false} />
            <EvidenceStatus value={data?.reversed_bank_transfers} label="Transferências bancárias estornadas (evidência disponível)" positiveIsAttention={false} />
            <EvidenceStatus value={data?.pending_bank_transfers} label="Transferências bancárias pendentes" />
          </Wave>

          <Wave number="2" title="Testes por perfil" description="Master, Gerente e Colaborador, cobrindo leitura, importação, conciliação, desvinculação, fechamento, reprovação e aprovação.">
            <EvidenceStatus value={data?.profile_count} label="Perfis visíveis nos dados autorizados" pendingWhenZero positiveIsAttention={false} />
            <EvidenceStatus value={null} label="Master — leitura, importação, conciliação, desvinculação, fechamento, reprovação e aprovação" />
            <EvidenceStatus value={null} label="Gerente — leitura, importação, conciliação, desvinculação, fechamento, reprovação e aprovação" />
            <EvidenceStatus value={null} label="Colaborador — leitura, importação, conciliação, desvinculação, fechamento, reprovação e aprovação" />
            <EvidenceStatus value={data?.closing_count} label="Fechamentos disponíveis nos dados autorizados" pendingWhenZero positiveIsAttention={false} />
          </Wave>

          <Wave number="3" title="Teste piloto" description="Uma conta, um período, um operador, um Master e conferência manual.">
            <EvidenceStatus value={null} label="Uma conta selecionada" />
            <EvidenceStatus value={null} label="Um período selecionado" />
            <EvidenceStatus value={null} label="Um operador real" />
            <EvidenceStatus value={null} label="Um Master real" />
            <EvidenceStatus value={null} label="Conferência manual" />
            <div className="flex items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-wider text-secondary">
              <FileCheck2 className="h-4 w-4 text-primary" /> Nenhum piloto foi executado ou simulado nesta sessão
            </div>
          </Wave>

          <Wave number="4" title="Expansão" description="Demais contas/períodos, transferências, Cofre, relatórios e dashboards.">
            <EvidenceStatus value={null} label="Demais contas e períodos" />
            <EvidenceStatus value={null} label="Transferências" />
            <EvidenceStatus value={data?.reversed_bank_transfers} label="Transferências bancárias estornadas (evidência disponível)" positiveIsAttention={false} />
            <EvidenceStatus value={data?.reversed_cash_transfers} label="Transferências banco/Cofre estornadas (evidência disponível)" positiveIsAttention={false} />
            <EvidenceStatus value={data?.pending_cash_transfers} label="Transferências banco/Cofre pendentes" />
            <EvidenceStatus value={null} label="Cofre" />
            <EvidenceStatus value={null} label="Relatórios" />
            <EvidenceStatus value={null} label="Dashboards" />
            <div className="flex items-center gap-2 py-3 text-[10px] font-black uppercase tracking-wider text-amber-700">
              <Clock className="h-4 w-4" /> Evidências externas e usuários reais permanecem pendentes
            </div>
            <p className="pb-2 text-[11px] text-secondary">Nenhuma aprovação, cancelamento, importação ou baixa foi simulada para preencher esta onda.</p>
          </Wave>
        </div>
      )}
    </div>
  );
}
