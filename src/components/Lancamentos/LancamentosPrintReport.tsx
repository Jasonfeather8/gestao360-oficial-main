import { LancamentoFinanceiro, EntidadeNegocio } from '../../types';
import { calculateAdjustmentAmount } from '../../utils/adjustments';

interface OperationalTotals {
  valorDocOriginal: number;
  valorParcOriginal: number;
  desconto: number;
  acrescimo: number;
  valorPago: number;
  aPagar: number;
}

interface PrintTotals {
  valorPrevisto: number;
  desconto: number;
  acrescimo: number;
  valorPago: number;
  liquido: number;
  aPagar: number;
  entradas: number;
  saidas: number;
}

interface LancamentosPrintReportProps {
  titleOverride?: string;
  isOperationalView: boolean;
  operationalTotals: OperationalTotals;
  printTotals: PrintTotals;
  selectedPrintLancamentos: LancamentoFinanceiro[];
  formatPrintDate: (dateStr: string | null | undefined) => string;
  getDaysOverdue: (dateStr: string) => number;
  getPrintStatus: (item: LancamentoFinanceiro) => string;
  getSaldoAPagar: (item: LancamentoFinanceiro) => number;
  getValorLiquido: (item: LancamentoFinanceiro) => number;
  valueFormatter: (value: number) => string;
  entidades: EntidadeNegocio[];
}

export default function LancamentosPrintReport({
  titleOverride,
  isOperationalView,
  operationalTotals,
  printTotals,
  selectedPrintLancamentos,
  formatPrintDate,
  getDaysOverdue,
  getPrintStatus,
  getSaldoAPagar,
  getValorLiquido,
  valueFormatter,
  entidades
}: LancamentosPrintReportProps) {
  return (
    <div className="lancamentos-print-report" aria-label="Relatório dos lançamentos selecionados">
      <div className="lancamentos-print-report__sheet">
        <header className="lancamentos-print-report__header">
          <div>
            <h1>{titleOverride || 'Financeiro / Extrato'}</h1>
            <p>Relatório dos lançamentos selecionados</p>
          </div>
          <div className="lancamentos-print-report__meta">
            <strong>Emissão: {new Date().toLocaleDateString('pt-BR')}</strong>
            <span>{selectedPrintLancamentos.length} lançamento{selectedPrintLancamentos.length === 1 ? '' : 's'}</span>
          </div>
        </header>

        <section className="lancamentos-print-report__summary" aria-label="Resultado do cálculo">
          <strong>Resultado do cálculo</strong>
          {isOperationalView ? (
            <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-summary">
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor documento original</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorDocOriginal)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor parcela original</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorParcOriginal)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Desconto</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.desconto)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Acréscimo</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.acrescimo)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor pago</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorPago)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">A pagar</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.aPagar)}</span></div>
            </div>
          ) : (
            <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-summary">
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor previsto</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.valorPrevisto)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Desconto</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.desconto)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Acréscimo</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.acrescimo)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor exibido</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.liquido)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Entradas</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.entradas)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Saídas</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.saidas)}</span></div>
              <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor líquido exibido</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.liquido)}</span></div>
            </div>
          )}
        </section>

        {isOperationalView ? (
          <section className="lancamentos-print-report__items" aria-label="Lançamentos operacionais">
            {selectedPrintLancamentos.map(item => (
              <article className="lancamentos-print-report__item" key={`print-${item.id}`}>
                <section className="lancamentos-print-report__block">
                  <h2>Identificação</h2>
                  <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-identification">
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Documento</span>
                      <span className="lancamentos-print-report__value">{item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Entidade</span>
                      <span className="lancamentos-print-report__value">{entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Vencimento / referência</span>
                      <span className="lancamentos-print-report__value">
                        {formatPrintDate(item.data_vencimento)}
                        <small>{getDaysOverdue(item.data_vencimento) > 0 ? `${getDaysOverdue(item.data_vencimento)} dia(s)` : getDaysOverdue(item.data_vencimento) === 0 ? 'Hoje' : '-'}</small>
                      </span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Data do documento</span>
                      <span className="lancamentos-print-report__value">{formatPrintDate(item.data_emissao)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Status</span>
                      <span className="lancamentos-print-report__value">{getPrintStatus(item)}</span>
                    </div>
                  </div>
                </section>

                <section className="lancamentos-print-report__block">
                  <h2>Memória do cálculo</h2>
                  <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-values">
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Valor documento original</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(item.valor_original || item.valor_previsto)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Valor parcela original</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(item.valor_previsto)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Desconto</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Acréscimo</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Valor pago</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(item.valor_recebido || 0)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">A pagar</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(getSaldoAPagar(item))}</span>
                    </div>
                  </div>
                </section>
              </article>
            ))}
          </section>
        ) : (
          <section className="lancamentos-print-report__items" aria-label="Lançamentos financeiros">
            {selectedPrintLancamentos.map(item => (
              <article className="lancamentos-print-report__item" key={`print-${item.id}`}>
                <section className="lancamentos-print-report__block">
                  <h2>Identificação</h2>
                  <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-identification">
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Documento</span>
                      <span className="lancamentos-print-report__value">{item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Fluxo</span>
                      <span className="lancamentos-print-report__value">{item.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Entidade</span>
                      <span className="lancamentos-print-report__value">{entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Vencimento</span>
                      <span className="lancamentos-print-report__value">{formatPrintDate(item.data_vencimento)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Pagamento</span>
                      <span className="lancamentos-print-report__value">{formatPrintDate(item.data_pagamento)}</span>
                    </div>
                  </div>
                </section>

                <section className="lancamentos-print-report__block">
                  <h2>Valores</h2>
                  <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-values">
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Valor previsto</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(item.valor_previsto)}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Desconto</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Acréscimo</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}</span>
                    </div>
                    <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                      <span className="lancamentos-print-report__label">Valor exibido</span>
                      <span className="lancamentos-print-report__value">{valueFormatter(getValorLiquido(item))}</span>
                    </div>
                    <div className="lancamentos-print-report__cell">
                      <span className="lancamentos-print-report__label">Status</span>
                      <span className="lancamentos-print-report__value">{getPrintStatus(item)}</span>
                    </div>
                  </div>
                </section>
              </article>
            ))}
          </section>
        )}

      </div>
    </div>
  );
}
