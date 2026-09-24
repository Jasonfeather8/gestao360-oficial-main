import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ClipboardCheck, ExternalLink, FileText, Play, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { diagnosticLogger } from '../services/diagnosticLogger';

type TestStatus = 'nao_iniciado' | 'em_execucao' | 'aprovado' | 'falhou';
type TestProgress = { status: TestStatus; steps: Record<string, boolean>; observation: string };
type ProgressMap = Record<string, TestProgress>;

type TestPlan = {
  id: string;
  title: string;
  summary: string;
  actions: string[];
  expected: string[];
};

const PROGRESS_STORAGE_KEY = 'gestao360_plano_testes_conciliacao';
const TESTE_01_SCOPE = 'teste-01';

const tests: TestPlan[] = [
  {
    id: 'teste-01',
    title: 'Teste 01 — Fluxo base e importações',
    summary: 'Validar previsões, baixas e a entrada de extratos em todos os formatos suportados.',
    actions: [
      'Crie previsões em Contas a Pagar e Contas a Receber e valide os cenários “já pago” e “já recebido”.',
      'Faça a importação inicial de um arquivo Excel, CSV e XLSX, usando uma conta e um período de teste.',
      'Faça uma importação diária em PDF e confirme o período, o saldo e as transações apresentadas na prévia.',
      'Repita o fluxo com entradas e saídas e marque cada etapa concluída nesta tela.',
    ],
    expected: [
      'As previsões de pagar/receber e os registros já pagos/recebidos aparecem com seus status e valores corretos.',
      'Excel, CSV e XLSX são lidos sem misturar contas ou períodos; a prévia permite conferir os dados antes da confirmação.',
      'O PDF diário é processado, com entradas e saídas separadas e totais coerentes com o extrato.',
      'Cada ação e qualquer ocorrência ficam registrados no log do Teste 01 sem interromper a operação.',
    ],
  },
  {
    id: 'teste-02',
    title: 'Teste 02 — Imutabilidade e estação de conciliação',
    summary: 'Conferir a estação split view, filtros e a preservação do extrato importado.',
    actions: [
      'Abra uma competência com transações importadas e alterne a estação para a visualização split view.',
      'Use os filtros de conta, período, entrada e saída e pesquise por descrição ou valor.',
      'Tente editar ou remover os dados originais do extrato depois da importação.',
    ],
    expected: [
      'A estação exibe extrato bancário e lançamentos lado a lado, com filtros combináveis e responsivos.',
      'A lista filtrada mantém a direção (entrada/saída), a conta e a competência selecionadas.',
      'O registro original permanece imutável; ajustes acontecem por conciliação ou lançamento relacionado.',
    ],
  },
  {
    id: 'teste-03',
    title: 'Teste 03 — Match um-para-muitos',
    summary: 'Confirmar a conciliação de uma transação bancária com vários lançamentos.',
    actions: [
      'Selecione uma transação bancária e escolha dois ou mais lançamentos compatíveis para vinculá-la.',
      'Confira os valores selecionados, a diferença e confirme o vínculo.',
    ],
    expected: [
      'O sistema permite selecionar vários lançamentos para uma única transação quando o conjunto é compatível.',
      'O vínculo apresenta a composição dos valores e não cria duplicidade de baixa ou de transação.',
    ],
  },
  {
    id: 'teste-04',
    title: 'Teste 04 — Novo lançamento completo',
    summary: 'Validar a criação de lançamento a partir da estação de conciliação.',
    actions: [
      'Inicie um novo lançamento para uma transação não identificada.',
      'Preencha entidade, categoria e centro de custo e informe o tipo entrada ou saída.',
      'Salve o lançamento e retorne à estação de conciliação.',
    ],
    expected: [
      'Entidade, categoria e centro de custo ficam associados ao lançamento sem campos obrigatórios esquecidos.',
      'A direção e o valor do novo lançamento refletem a transação selecionada.',
      'O novo lançamento fica disponível para conciliação e para auditoria.',
    ],
  },
  {
    id: 'teste-05',
    title: 'Teste 05 — Diferenças, encargos e BPI',
    summary: 'Cobrir ajustes financeiros permitidos durante a conciliação.',
    actions: [
      'Concilie um lançamento com diferença e classifique juros, desconto, tarifa e BPI, informando a justificativa.',
      'Repita o cenário com pagamento parcial e com ajuste manual autorizado.',
      'Confira o valor conciliado e os lançamentos derivados.',
    ],
    expected: [
      'Juros, descontos, tarifas e BPI ficam discriminados, com motivo e valor preservados.',
      'O pagamento parcial não mascara a diferença e o ajuste manual exige justificativa.',
      'O total e a diferença exibidos permanecem rastreáveis na conciliação e na auditoria.',
    ],
  },
  {
    id: 'teste-06',
    title: 'Teste 06 — Fechamento da competência',
    summary: 'Verificar que o fechamento só avança com 100% da competência conciliada.',
    actions: [
      'Tente solicitar o fechamento mantendo ao menos uma transação pendente.',
      'Concilie todas as transações e solicite novamente o fechamento.',
      'No usuário Master, aprove e depois consulte a competência fechada.',
    ],
    expected: [
      'O sistema bloqueia o fechamento enquanto a conciliação não estiver em 100%.',
      'Com 100% conciliado, a solicitação entra na fila de aprovação sem alterar o histórico.',
      'A aprovação Master registra decisão, período e usuário responsável.',
    ],
  },
  {
    id: 'teste-07',
    title: 'Teste 07 — Transferências bancárias',
    summary: 'Validar o fluxo assíncrono entre contas, espelhamento e reversão.',
    actions: [
      'Crie uma transferência entre contas bancárias e acompanhe-a como pendente.',
      'Confira os dois lados espelhados e compare os valores, mantendo a tarifa em registro separado.',
      'Exclua ou estorne a transferência e consulte os lançamentos relacionados.',
    ],
    expected: [
      'A transferência segue fluxo assíncrono com status visível até a decisão e o recebimento.',
      'Origem e destino ficam espelhados com igualdade de valores; a tarifa não é incorporada ao principal.',
      'A exclusão ou o estorno aplica a remoção em cascata aos vínculos derivados sem apagar a auditoria.',
    ],
  },
  {
    id: 'teste-08',
    title: 'Teste 08 — Cofre Local e aprovação',
    summary: 'Conferir baixa direta, movimentação banco↔cofre e aprovação Master.',
    actions: [
      'Crie ou selecione um Cofre Local e registre uma baixa direta vinculada a um lançamento.',
      'Crie uma transferência banco→cofre e outra cofre→banco, mantendo a confirmação manual separada.',
      'Acompanhe as pendências com um gerente e decida cada uma com o usuário Master.',
    ],
    expected: [
      'A baixa direta fica vinculada ao lançamento e o saldo físico considera somente movimentos aprovados.',
      'As duas direções banco↔cofre apresentam valores e status próprios, sem confundir saldo bancário com saldo físico.',
      'A fila de aprovação registra aprovação, reprovação ou estorno com justificativa e auditoria.',
    ],
  },
  {
    id: 'teste-09',
    title: 'Teste 09 — Fila e saldo real do Master',
    summary: 'Validar a visão Master das decisões pendentes e dos saldos reais.',
    actions: [
      'Entre como Master e consulte a fila de fechamentos, transferências e movimentações do Cofre Local.',
      'Aprove uma operação e reprova outra com justificativa.',
      'Compare o status da fila e o saldo real após atualizar as telas.',
    ],
    expected: [
      'A fila reúne pendências assíncronas com status, origem, destino, valor e responsável.',
      'Cada decisão altera somente a operação correspondente e preserva a justificativa.',
      'O saldo real considera apenas operações aprovadas e é atualizado após a decisão.',
    ],
  },
  {
    id: 'teste-10',
    title: 'Teste 10 — Permissões e auditoria',
    summary: 'Garantir separação de acesso e rastreabilidade de todas as decisões.',
    actions: [
      'Acesse o plano, os logs e a conciliação como Master e como Gerente.',
      'Acesse diretamente as rotas como Colaborador e tente abrir operações de aprovação.',
      'Consulte a auditoria depois de importar, conciliar, transferir, aprovar e estornar.',
    ],
    expected: [
      'Master e Gerente visualizam este plano e os logs; Colaborador não recebe essas informações nem as rotas.',
      'Ações de aprovação e decisões permanecem restritas ao Master conforme a regra do módulo.',
      'A auditoria identifica ação, data, usuário, entidade afetada e decisão sem expor segredos.',
    ],
  },
];

const statusLabels: Record<TestStatus, string> = {
  nao_iniciado: 'Não iniciado',
  em_execucao: 'Em execução',
  aprovado: 'Aprovado',
  falhou: 'Falhou',
};

const statusClasses: Record<TestStatus, string> = {
  nao_iniciado: 'border-surface-border bg-surface-container text-secondary',
  em_execucao: 'border-primary/30 bg-primary/10 text-primary',
  aprovado: 'border-bank-truth-green/30 bg-bank-truth-green/10 text-bank-truth-green',
  falhou: 'border-alert-red/30 bg-alert-red/10 text-alert-red',
};

function emptyProgress(): ProgressMap {
  return Object.fromEntries(tests.map(test => [test.id, { status: 'nao_iniciado', steps: {}, observation: '' }])) as ProgressMap;
}

function loadProgress(): ProgressMap {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}') as Partial<ProgressMap>;
    const initial = emptyProgress();
    tests.forEach(test => {
      const current = saved[test.id];
      if (current) {
        initial[test.id] = {
          status: current.status && statusLabels[current.status] ? current.status : 'nao_iniciado',
          steps: current.steps || {},
          observation: typeof current.observation === 'string' ? current.observation : '',
        };
      }
    });
    return initial;
  } catch {
    return emptyProgress();
  }
}

export default function PlanoTestesConciliacao() {
  const [progress, setProgress] = useState<ProgressMap>(loadProgress);

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // O progresso local não pode interromper o uso do plano.
    }
  }, [progress]);

  useEffect(() => {
    diagnosticLogger.info(TESTE_01_SCOPE, 'Teste 01 aberto', { tela: 'plano-testes', evento: 'abertura' });
  }, []);

  const allSteps = useMemo(() => tests.reduce((total, test) => total + test.actions.length, 0), []);
  const completedSteps = useMemo(
    () => tests.reduce((total, test) => total + Object.values(progress[test.id]?.steps || {}).filter(Boolean).length, 0),
    [progress],
  );
  const approved = tests.filter(test => progress[test.id]?.status === 'aprovado').length;
  const failed = tests.filter(test => progress[test.id]?.status === 'falhou').length;
  const progressPercent = allSteps ? Math.round((completedSteps / allSteps) * 100) : 0;

  const updateProgress = (testId: string, update: Partial<TestProgress>) => {
    setProgress(current => ({
      ...current,
      [testId]: { ...current[testId], ...update },
    }));
  };

  const changeStatus = (test: TestPlan, status: TestStatus) => {
    updateProgress(test.id, { status });
    const scope = test.id === 'teste-01' ? TESTE_01_SCOPE : 'plano-testes';
    diagnosticLogger.info(scope, `Status alterado: ${statusLabels[status]}`, { teste: test.id, status });
    if (status === 'em_execucao') {
      diagnosticLogger.info(scope, `${test.title} iniciado`, { teste: test.id, evento: 'inicio' });
    }
    if (status === 'aprovado') {
      diagnosticLogger.info(scope, `${test.title} concluído`, { teste: test.id, evento: 'conclusao' });
    }
    if (status === 'falhou') {
      diagnosticLogger.error(scope, `${test.title} falhou`, { teste: test.id, evento: 'falha' });
    }
  };

  const toggleStep = (test: TestPlan, stepIndex: number) => {
    const stepId = `etapa-${stepIndex + 1}`;
    const checked = !progress[test.id].steps[stepId];
    updateProgress(test.id, { steps: { ...progress[test.id].steps, [stepId]: checked } });
    if (test.id === 'teste-01') {
      diagnosticLogger.info(TESTE_01_SCOPE, checked ? `Etapa ${stepIndex + 1} marcada` : `Etapa ${stepIndex + 1} desmarcada`, {
        teste: test.id,
        etapa: stepIndex + 1,
        marcada: checked,
      });
    }
  };

  const startTest01 = () => {
    const test = tests[0];
    if (progress[test.id].status !== 'em_execucao') changeStatus(test, 'em_execucao');
    else diagnosticLogger.info(TESTE_01_SCOPE, 'Teste 01 já está em execução', { teste: test.id });
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-primary"><ClipboardCheck className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Controle operacional</span></div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-on-background md:text-3xl">Plano de testes — Conciliação Bancária</h1>
            <p className="mt-2 text-sm leading-6 text-secondary">Execute o roteiro manual do módulo, registre evidências e acompanhe a aprovação sem sair do ERP. Nenhum resultado é inventado: marque somente o que foi validado.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={startTest01} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-sm hover:opacity-90"><Play className="h-4 w-4" /> Iniciar Teste 01</button>
            <Link to="/logs-testes" className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-container px-4 py-2.5 text-sm font-bold text-on-surface hover:border-primary hover:text-primary"><FileText className="h-4 w-4" /> Abrir logs</Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="flex items-center justify-between text-xs font-bold text-secondary"><span>Etapas marcadas</span><span>{completedSteps}/{allSteps}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} /></div><p className="mt-1 text-[11px] text-secondary">{progressPercent}% do roteiro</p></div>
          <div className="rounded-xl border border-surface-border bg-surface-container-low p-3"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Testes aprovados</p><p className="mt-1 text-xl font-black text-bank-truth-green">{approved}/{tests.length}</p></div>
          <div className="rounded-xl border border-surface-border bg-surface-container-low p-3"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Em execução</p><p className="mt-1 text-xl font-black text-primary">{tests.filter(test => progress[test.id]?.status === 'em_execucao').length}</p></div>
          <div className="rounded-xl border border-surface-border bg-surface-container-low p-3"><p className="text-[10px] font-black uppercase tracking-wider text-secondary">Falhas registradas</p><p className="mt-1 text-xl font-black text-alert-red">{failed}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-border pt-4 text-[11px] font-bold text-secondary">
          <span>Legenda:</span>
          {(Object.keys(statusLabels) as TestStatus[]).map(status => <span key={status} className={`rounded-full border px-2.5 py-1 ${statusClasses[status]}`}>{statusLabels[status]}</span>)}
        </div>
      </header>

      <div className="space-y-4">
        {tests.map((test, index) => {
          const current = progress[test.id];
          return (
            <article key={test.id} className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${test.id === 'teste-01' ? 'border-primary/40 ring-1 ring-primary/10' : 'border-surface-border'}`}>
              <div className="flex flex-col gap-4 border-b border-surface-border p-5 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-sm font-black text-on-primary-container">{String(index + 1).padStart(2, '0')}</div><div><h2 className="text-base font-black text-on-surface">{test.title}</h2><p className="mt-1 text-sm text-secondary">{test.summary}</p></div></div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end"><select aria-label={`Status do ${test.title}`} value={current.status} onChange={event => changeStatus(test, event.target.value as TestStatus)} className={`rounded-full border px-3 py-1.5 text-xs font-black outline-none ${statusClasses[current.status]}`}>
                  {(Object.keys(statusLabels) as TestStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>{test.id === 'teste-01' && <Link to="/logs-testes" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Logs <ExternalLink className="h-3.5 w-3.5" /></Link>}</div>
              </div>
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <section aria-labelledby={`${test.id}-acoes`}>
                  <h3 id={`${test.id}-acoes`} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary"><CheckCircle2 className="h-4 w-4" /> Ações do usuário</h3>
                  <ol className="mt-3 space-y-3">{test.actions.map((action, stepIndex) => { const stepId = `etapa-${stepIndex + 1}`; return <li key={stepId} className="flex gap-3 text-sm leading-5 text-on-surface"><button type="button" aria-label={`${current.steps[stepId] ? 'Desmarcar' : 'Marcar'} etapa ${stepIndex + 1}`} onClick={() => toggleStep(test, stepIndex)} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${current.steps[stepId] ? 'border-primary bg-primary text-on-primary' : 'border-surface-border bg-surface'}`}>{current.steps[stepId] && <Check className="h-3.5 w-3.5" />}</button><span><strong className="mr-1 text-primary">{stepIndex + 1}.</strong>{action}</span></li>; })}</ol>
                  <label className="mt-5 block text-xs font-bold text-secondary">Observação / evidência deste teste<textarea value={current.observation} onChange={event => updateProgress(test.id, { observation: event.target.value })} rows={3} placeholder="Registre evidências ou ocorrências..." className="mt-2 w-full resize-y rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-on-surface outline-none placeholder:text-secondary/60 focus:border-primary" /></label>
                </section>
                <section aria-labelledby={`${test.id}-resultado`} className="rounded-xl border border-surface-border bg-surface-container-low p-4">
                  <h3 id={`${test.id}-resultado`} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-secondary"><ShieldCheck className="h-4 w-4 text-bank-truth-green" /> Resultado esperado</h3>
                  <ul className="mt-3 space-y-3">{test.expected.map((result, resultIndex) => <li key={result} className="flex gap-3 text-sm leading-5 text-on-surface"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bank-truth-green" /><span><strong className="mr-1 text-bank-truth-green">{resultIndex + 1}.</strong>{result}</span></li>)}</ul>
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
