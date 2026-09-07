import { supabase } from '@/integrations/supabase/client';
import { diagnosticLogger } from './diagnosticLogger';
import { LancamentoFinanceiro } from '../types';

export interface LancamentoFilters {
  searchTerm?: string;
  docCode?: number;
  docParcel?: number;
  startDate?: string;
  endDate?: string;
  approvalStatus?: string;
  statusPagamento?: string | string[];
  type?: string | string[];
  authorId?: string | string[];
  categoryId?: string | string[];
  contaId?: string | string[];
  centroCustoId?: string | string[];
  condicao?: string;
  temDesconto?: string;
  temAcrescimo?: string;
  motivoDescontoId?: string;
  motivoAcrescimoId?: string;
  isFinanceiroView?: boolean;
  page?: number;
  pageSize?: number;
}

const normalizeFilterValues = (value?: string | string[]): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.includes('all') ? [] : Array.from(new Set(values.filter(Boolean)));
};

const combineOrGroups = (groups: string[][]): string => {
  const nonEmptyGroups = groups.filter(group => group.length > 0);

  if (nonEmptyGroups.length === 1) {
    return nonEmptyGroups[0].join(',');
  }

  return `and(${nonEmptyGroups
    .map(group => group.length === 1 ? group[0] : `or(${group.join(',')})`)
    .join(',')})`;
};

const normalizeAdjustmentType = (type: unknown): 'valor' | 'porcentagem' =>
  type === 'porcentagem' ? 'porcentagem' : 'valor';

const formatAdjustmentValue = (value: unknown, type: unknown, base: number): string => {
  const numericValue = Number(value) || 0;
  const formattedValue = numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (normalizeAdjustmentType(type) === 'porcentagem') return `${formattedValue}%`;
  const percentage = base > 0 ? (numericValue / base) * 100 : 0;
  return `R$ ${formattedValue} (${percentage.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
};

export const lancamentosService = {
  getAll: async (filters?: LancamentoFilters, signal?: AbortSignal): Promise<{ data: LancamentoFinanceiro[], count: number }> => {
    let recurrenceIds: string[] = [];

    if (filters?.docCode !== undefined) {
      let recurrenceQuery = supabase
        .from('lancamentos_financeiros')
        .select('recorrencia_id')
        .eq('codigo_sequencial', filters.docCode);
      if (signal) recurrenceQuery = recurrenceQuery.abortSignal(signal);

      const { data: matchingLancamentos, error: matchingError } = await recurrenceQuery;

      if (matchingError) throw matchingError;

      recurrenceIds = (matchingLancamentos || [])
        .map(({ recorrencia_id }) => recorrencia_id)
        .filter((recorrenciaId): recorrenciaId is string => Boolean(recorrenciaId));
    }

    let searchLancamentoIds: string[] | undefined;

    if (filters?.searchTerm && filters.searchTerm.length >= 3) {
      const term = `%${filters.searchTerm}%`;
      let observacoesQuery = supabase
        .from('lancamentos_financeiros')
        .select('id')
        .ilike('observacoes', term);
      if (signal) observacoesQuery = observacoesQuery.abortSignal(signal);

      const { data: matchingObservacoes, error: observacoesError } = await observacoesQuery;

      if (observacoesError) throw observacoesError;

      let entidadesQuery = supabase
        .from('entidades_negocio')
        .select('id')
        .ilike('nome_razao_social', term);
      if (signal) entidadesQuery = entidadesQuery.abortSignal(signal);

      const { data: matchingEntidades, error: entidadesError } = await entidadesQuery;

      if (entidadesError) throw entidadesError;

      const entidadeIds = (matchingEntidades || []).map(({ id }) => id);
      let entidadeLancamentoIds: string[] = [];

      if (entidadeIds.length > 0) {
        let lancamentosEntidadeQuery = supabase
          .from('lancamentos_financeiros')
          .select('id')
          .in('entidade_id', entidadeIds);
        if (signal) lancamentosEntidadeQuery = lancamentosEntidadeQuery.abortSignal(signal);

        const { data: matchingLancamentosPorEntidade, error: lancamentosEntidadeError } = await lancamentosEntidadeQuery;

        if (lancamentosEntidadeError) throw lancamentosEntidadeError;
        entidadeLancamentoIds = (matchingLancamentosPorEntidade || []).map(({ id }) => id);
      }

      searchLancamentoIds = Array.from(new Set([
        ...(matchingObservacoes || []).map(({ id }) => id),
        ...entidadeLancamentoIds
      ]));
    }

    if (searchLancamentoIds && searchLancamentoIds.length === 0) {
      return { data: [], count: 0 };
    }

    let query = supabase
      .from('lancamentos_financeiros')
      .select('*, entidades_negocio!inner(nome_razao_social)', { count: 'exact' });

    if (filters?.docCode !== undefined) {
      query = query
        .order('codigo_sequencial', { ascending: true })
        .order('numero_parcela', { ascending: true })
        .order('created_at', { ascending: false });
    } else if (filters?.isFinanceiroView) {
      query = query
        .order('data_pagamento', { ascending: false, nullsFirst: false })
        .order('hora_pagamento', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query
        .order('data_vencimento', { ascending: true })
        .order('codigo_sequencial', { ascending: true })
        .order('created_at', { ascending: false });
    }

    if (filters) {
      const orGroups: string[][] = [];

      if (filters.docCode === undefined) {
        if (filters.startDate) query = query.gte('data_vencimento', filters.startDate);
        if (filters.endDate) query = query.lte('data_vencimento', filters.endDate);
      }
      
      if (filters.docCode !== undefined) {
        const documentClauses = [`codigo_sequencial.eq.${filters.docCode}`];
        if (recurrenceIds.length > 0) {
          documentClauses.push(`recorrencia_id.in.(${recurrenceIds.join(',')})`);
        }
        orGroups.push(documentClauses);
      }
      if (filters.docParcel) query = query.eq('numero_parcela', filters.docParcel);

      if (filters.approvalStatus && filters.approvalStatus !== 'all') {
        if (filters.approvalStatus === 'pendente') {
          query = query.in('status_aprovacao', ['pendente_digital', 'digital']);
        } else if (filters.approvalStatus === 'fila_operacional') {
          query = query.in('status_aprovacao', ['pendente_digital', 'digital', 'reprovado']);
        } else {
          query = query.eq('status_aprovacao', filters.approvalStatus);
        }
      }
      
      const statusPagamentoValues = normalizeFilterValues(filters.statusPagamento);
      if (statusPagamentoValues.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const hasDateScopedStatus = statusPagamentoValues.some(status => status === 'aberto' || status === 'atrasadas');

        if (!hasDateScopedStatus) {
          query = query.in('status_pagamento', statusPagamentoValues);
        } else if (statusPagamentoValues.length === 1) {
          const [status] = statusPagamentoValues;
          if (status === 'atrasadas') {
            query = query
              .lt('data_vencimento', today)
              .in('status_pagamento', ['aberto', 'pago_parcial']);
          } else {
            query = query
              .eq('status_pagamento', 'aberto')
              .gte('data_vencimento', today);
          }
        } else {
          orGroups.push(statusPagamentoValues.map(status => {
            if (status === 'atrasadas') {
              return `and(data_vencimento.lt.${today},status_pagamento.in.(aberto,pago_parcial))`;
            }
            if (status === 'aberto') {
              return `and(status_pagamento.eq.aberto,data_vencimento.gte.${today})`;
            }
            return `status_pagamento.eq.${status}`;
          }));
        }
      }
      
      const typeValues = normalizeFilterValues(filters.type);
      if (typeValues.length > 0) {
        query = query.in('tipo', typeValues);
      }

      const authorValues = normalizeFilterValues(filters.authorId);
      if (authorValues.length > 0) {
        query = query.in('usuario_criador_id', authorValues);
      }

      const categoryValues = normalizeFilterValues(filters.categoryId);
      if (categoryValues.length > 0) {
        query = query.in('categoria_id', categoryValues);
      }

      const contaValues = normalizeFilterValues(filters.contaId);
      if (contaValues.length > 0) {
        query = query.in('conta_bancaria_id', contaValues);
      }

      const centroCustoValues = normalizeFilterValues(filters.centroCustoId);
      if (centroCustoValues.length > 0) {
        query = query.in('centro_custo_id', centroCustoValues);
      }

      if (filters.condicao && filters.condicao !== 'all') {
        query = query.eq('condicao', filters.condicao);
      }

      if (filters.temDesconto === 'sim') {
        query = query.gt('desconto_valor', 0);
      } else if (filters.temDesconto === 'nao') {
        orGroups.push(['desconto_valor.eq.0', 'desconto_valor.is.null']);
      }

      if (filters.temAcrescimo === 'sim') {
        query = query.gt('acrescimo_valor', 0);
      } else if (filters.temAcrescimo === 'nao') {
        orGroups.push(['acrescimo_valor.eq.0', 'acrescimo_valor.is.null']);
      }

      if (filters.motivoDescontoId && filters.motivoDescontoId !== 'all') {
        query = query.eq('motivo_desconto_id', filters.motivoDescontoId);
      }

      if (filters.motivoAcrescimoId && filters.motivoAcrescimoId !== 'all') {
        query = query.eq('motivo_acrescimo_id', filters.motivoAcrescimoId);
      }

      if (orGroups.length > 0) {
        query = query.or(combineOrGroups(orGroups));
      }

      if (searchLancamentoIds) {
        query = query.in('id', searchLancamentoIds);
      }

      // Pagination
      if (filters.page && filters.pageSize) {
        const from = (filters.page - 1) * filters.pageSize;
        const to = from + filters.pageSize - 1;
        query = query.range(from, to);
      }
    } else {
      query = query.range(0, 49); // Default limit
    }

    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data as LancamentoFinanceiro[], count: count || 0 };
  },

  getById: async (id: string): Promise<LancamentoFinanceiro> => {
    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as LancamentoFinanceiro;
  },

  create: async (item: any, recorrencia?: any): Promise<LancamentoFinanceiro> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    // Recupera a role do usuário para segurança na criação
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isMaster = profile?.role === 'master';
    const valorPrevisto = Number(item.valor_previsto) || 0;
    const descontoBase = Number(item.desconto_valor) || 0;
    const acrescimoBase = Number(item.acrescimo_valor) || 0;
    const desconto = item.desconto_tipo === 'porcentagem' ? (valorPrevisto * descontoBase) / 100 : descontoBase;
    const acrescimo = item.acrescimo_tipo === 'porcentagem' ? (valorPrevisto * acrescimoBase) / 100 : acrescimoBase;
    const saldoDisponivel = Math.max(0, valorPrevisto - desconto + acrescimo);
    const valorRecebido = Number(item.valor_recebido) || 0;
    const hasReceivedPayment = item.ja_recebido === true || item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial' || item.valor_recebido !== undefined;

    if (hasReceivedPayment && (valorRecebido < 0 || valorRecebido > saldoDisponivel + 0.005)) {
      throw new Error('O valor recebido não pode ser maior que o saldo disponível do lançamento.');
    }

    const lancamentoData = {
      ...item,
      user_id: user.id,
      usuario_criador_id: user.id,
      // Se não for master, garante que não entra como confirmado
      status_aprovacao: isMaster ? (item.status_aprovacao || 'confirmado_master') : 'digital'
    };

    if (!recorrencia) {
      const { data, error } = await supabase
        .from('lancamentos_financeiros')
        .insert([lancamentoData])
        .select()
        .single();
      if (error) throw error;
      return data as LancamentoFinanceiro;
    } else {
      const { data: recData, error: recError } = await supabase
        .from('recorrencias')
        .insert([{
          user_id: user.id,
          periodicidade: recorrencia.periodicidade,
          quantidade_total_parcelas: recorrencia.quantidade_total_parcelas,
          data_inicio: item.data_vencimento,
          periodicidade_customizada_dias: recorrencia.periodicidade_customizada_dias
        }])
        .select()
        .single();

      if (recError) throw recError;

      const valorTotalRecorrencia = recorrencia.parcelas.reduce(
        (total: number, parcela: any) => total + (Number(parcela.valor_previsto) || 0),
        0
      );
      const parcelas = recorrencia.parcelas.map((p: any, index: number) => ({
        ...lancamentoData,
        data_vencimento: p.data_vencimento,
        valor_previsto: p.valor_previsto,
        valor_original: valorTotalRecorrencia,
        recorrencia_id: recData.id,
        numero_parcela: index + 1,
        quantidade_total_parcelas: recorrencia.quantidade_total_parcelas
      }));

      const { data: createdParcelas, error: parcelasError } = await supabase
        .from('lancamentos_financeiros')
        .insert(parcelas)
        .select();

      if (parcelasError) throw parcelasError;
      return createdParcelas[0] as LancamentoFinanceiro;
    }
  },

  update: async (id: string, data: any, mode: 'single' | 'all' = 'single'): Promise<LancamentoFinanceiro> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isMaster = profile?.role === 'master';

    // Proteção: Se não for master, não pode alterar para status de aprovação master
    const safeData = { ...data };
    if (!isMaster && safeData.status_aprovacao === 'confirmado_master') {
      delete safeData.status_aprovacao;
    }
    delete safeData.valor_original;
    delete safeData.valor_previsto;

    const { data: current } = await supabase
      .from('lancamentos_financeiros')
      .select('recorrencia_id, valor_previsto, desconto_valor, desconto_tipo, acrescimo_valor, acrescimo_tipo, valor_recebido, status_pagamento, tipo_baixa, observacoes')
      .eq('id', id)
      .single();

    const isAVRUpdate = safeData.tipo_baixa === 'avr' || current?.tipo_baixa === 'avr';
    const valorPrevisto = Number(safeData.valor_previsto ?? current?.valor_previsto) || 0;
    const descontoBase = Number(safeData.desconto_valor ?? current?.desconto_valor) || 0;
    const acrescimoBase = Number(safeData.acrescimo_valor ?? current?.acrescimo_valor) || 0;
    const descontoTipo = safeData.desconto_tipo ?? current?.desconto_tipo;
    const acrescimoTipo = safeData.acrescimo_tipo ?? current?.acrescimo_tipo;
    const desconto = descontoTipo === 'porcentagem' ? (valorPrevisto * descontoBase) / 100 : descontoBase;
    const acrescimo = acrescimoTipo === 'porcentagem' ? (valorPrevisto * acrescimoBase) / 100 : acrescimoBase;
    const saldoDisponivel = Math.max(0, valorPrevisto - desconto + acrescimo);
    const valorRecebido = Number(safeData.valor_recebido ?? current?.valor_recebido) || 0;
    const persistedDescontoTipo = normalizeAdjustmentType(current?.desconto_tipo);
    const persistedAcrescimoTipo = normalizeAdjustmentType(current?.acrescimo_tipo);
    const nextDescontoTipo = normalizeAdjustmentType(safeData.desconto_tipo ?? current?.desconto_tipo);
    const nextAcrescimoTipo = normalizeAdjustmentType(safeData.acrescimo_tipo ?? current?.acrescimo_tipo);
    const nextDescontoValor = safeData.desconto_valor ?? current?.desconto_valor;
    const nextAcrescimoValor = safeData.acrescimo_valor ?? current?.acrescimo_valor;
    const descontoProvided = safeData.desconto_valor !== undefined || safeData.desconto_tipo !== undefined;
    const acrescimoProvided = safeData.acrescimo_valor !== undefined || safeData.acrescimo_tipo !== undefined;
    const descontoChanged = descontoProvided && (
      Math.abs((Number(nextDescontoValor) || 0) - (Number(current?.desconto_valor) || 0)) > 0.005 ||
      nextDescontoTipo !== persistedDescontoTipo
    );
    const acrescimoChanged = acrescimoProvided && (
      Math.abs((Number(nextAcrescimoValor) || 0) - (Number(current?.acrescimo_valor) || 0)) > 0.005 ||
      nextAcrescimoTipo !== persistedAcrescimoTipo
    );
    if (descontoChanged || acrescimoChanged) {
      const historyLines = [
        descontoChanged
          ? `Desconto anterior: ${formatAdjustmentValue(current?.desconto_valor, persistedDescontoTipo, valorPrevisto)} | atual: ${formatAdjustmentValue(nextDescontoValor, nextDescontoTipo, valorPrevisto)}`
          : null,
        acrescimoChanged
          ? `Acréscimo anterior: ${formatAdjustmentValue(current?.acrescimo_valor, persistedAcrescimoTipo, valorPrevisto)} | atual: ${formatAdjustmentValue(nextAcrescimoValor, nextAcrescimoTipo, valorPrevisto)}`
          : null
      ].filter(Boolean).join('\n');
      const observacoesBase = safeData.observacoes ?? current?.observacoes ?? '';
      const observacoesPreservadas = current?.observacoes && !observacoesBase.includes(current.observacoes)
        ? `${current.observacoes}\n${observacoesBase}`
        : observacoesBase;
      safeData.observacoes = `${observacoesPreservadas}${observacoesPreservadas ? '\n' : ''}${historyLines}`;
    }
    const hasReceivedPayment = safeData.ja_recebido === true || safeData.status_pagamento === 'pago' || safeData.status_pagamento === 'pago_parcial' || safeData.valor_recebido !== undefined || current?.status_pagamento === 'pago' || current?.status_pagamento === 'pago_parcial' || valorRecebido > 0;

    if (!isAVRUpdate && hasReceivedPayment && (valorRecebido < 0 || valorRecebido > saldoDisponivel + 0.005)) {
      throw new Error('O valor recebido não pode ser maior que o saldo disponível do lançamento.');
    }

    if (mode === 'all' && current?.recorrencia_id) {
      const { data: updated, error } = await supabase
        .from('lancamentos_financeiros')
        .update(safeData)
        .eq('recorrencia_id', current.recorrencia_id)
        .eq('status_pagamento', 'aberto')
        .select();
      if (error) throw error;
      return updated[0] as LancamentoFinanceiro;
    } else {
      const { data: updated, error } = await supabase
        .from('lancamentos_financeiros')
        .update(safeData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated as LancamentoFinanceiro;
    }
  },

  delete: async (id: string, mode: 'single' | 'all' = 'single'): Promise<boolean> => {
    const { data: current } = await supabase
      .from('lancamentos_financeiros')
      .select('recorrencia_id')
      .eq('id', id)
      .single();

    if (mode === 'all' && current?.recorrencia_id) {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .delete()
        .eq('recorrencia_id', current.recorrencia_id)
        .eq('status_pagamento', 'aberto');
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
    return true;
  },

  baixaLancamento: async (id: string, data: {
   valor_pago: number,
   data_pagamento: string,
   conta_bancaria_id: string,
   centro_custo_id?: string,
   categoria_id?: string,
   tipo_baixa?: 'financeira' | 'bpi' | 'avr',
   valor_desconto?: number,
   valor_acrescimo?: number,
   taxa_bancaria?: number,
   motivo_ajuste?: string,
   motivo_desconto_id?: string,
   motivo_acrescimo_id?: string,
   condicao?: 'a_vista' | 'a_prazo',
   data_competencia?: string,
   data_emissao?: string,
   parcelas?: Array<{ id?: string; numero: number; data: string; valor: string; status: string }>,
   parcela_config?: { quantidade: number; periodicidade: string; periodicidade_customizada_dias?: number; com_entrada: boolean },
   propagate_avr?: 'none' | 'open' | 'all'
 }, isMaster: boolean = false): Promise<LancamentoFinanceiro> => {
    const { data: current, error: getError } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('id', id)
      .single();

    if (getError) throw getError;

    const isBPI = data.tipo_baixa === 'bpi';
    const isAVR = data.tipo_baixa === 'avr';
    const isBaixaFinanceira = !isBPI && !isAVR;
    const valorPagoEfetivo = (isBPI || isAVR) ? (data.valor_pago > 0 ? data.valor_pago : (isBPI ? 0 : current.valor_previsto)) : (data.valor_pago > 0 ? data.valor_pago : current.valor_previsto);
    const valorTotalAVR = data.parcelas?.length
      ? data.parcelas.reduce((total, parcela) => total + (Number(parcela.valor.replace(/\./g, '').replace(',', '.')) || 0), 0)
      : valorPagoEfetivo;
    const parcelaSelecionadaAVR = data.parcelas?.find(parcela => parcela.id === id) || data.parcelas?.[0];
    const valorParcelaSelecionadaAVR = parcelaSelecionadaAVR
      ? Number(parcelaSelecionadaAVR.valor.replace(/\./g, '').replace(',', '.')) || 0
      : valorTotalAVR;
    const descontoBase = Number(current.desconto_valor) || 0;
    const acrescimoBase = Number(current.acrescimo_valor) || 0;
    const descontoTipo = normalizeAdjustmentType(current.desconto_tipo);
    const acrescimoTipo = normalizeAdjustmentType(current.acrescimo_tipo);
    const descontoAplicado = descontoTipo === 'porcentagem'
      ? (current.valor_previsto * descontoBase) / 100
      : descontoBase;
    const acrescimoAplicado = acrescimoTipo === 'porcentagem'
      ? (current.valor_previsto * acrescimoBase) / 100
      : acrescimoBase;
    const taxaAplicada = Number(data.taxa_bancaria) || 0;
    const subtotal = Math.max(0, current.valor_previsto - descontoAplicado + acrescimoAplicado + taxaAplicada);
    const valorRecebidoAnterior = Number(current.valor_recebido) || 0;
    const saldoDisponivel = Math.max(0, subtotal - valorRecebidoAnterior);
    const totalValorRecebido = valorRecebidoAnterior + valorPagoEfetivo;
    if (isBaixaFinanceira && (data.valor_pago < 0 || data.valor_pago > saldoDisponivel + 0.005)) {
      throw new Error('O valor pago não pode ser maior que o saldo disponível do título.');
    }
    const isPartial = isBaixaFinanceira && totalValorRecebido < subtotal - 0.005;
    const dataPagamentoVal = data.data_pagamento || new Date().toISOString().split('T')[0];
    const horaPagamentoVal = new Date().toTimeString().slice(0, 8);
   const contaBancariaVal = data.conta_bancaria_id || current.conta_bancaria_id;

   // AVR logic: Update history and handle original value
   const observacaoOriginal = current.observacoes || '';
   let observacaoFinal = observacaoOriginal;
   
   if (isAVR) {
     observacaoFinal += `\n[AVR - Ajuste Realizado em ${new Date().toLocaleDateString('pt-BR')}] Valor original alterado de R$ ${current.valor_original || current.valor_previsto} para R$ ${valorTotalAVR}. Motivo: ${data.motivo_ajuste || 'Não informado'}`;
   } else if (isBPI) {
     observacaoFinal += `\n[BPI - Baixa por Inatividade em ${new Date().toLocaleDateString('pt-BR')}]`;
   }

   // Define final payment status based on role
   const finalPaymentStatus = isBPI ? 'bpi' : (isMaster ? 'pago' : 'quitação_pendente');

   // AVR logic: Skip financial movement and only update values
   if (isAVR) {
     const now = new Date();
     const timestampStr = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
     const { data: { user } } = await supabase.auth.getUser();
     let recurrenceId = current.recorrencia_id;

     if (data.parcelas?.length && !recurrenceId) {
       if (!user) throw new Error('Usuário não autenticado');
       const config = data.parcela_config || {
         quantidade: data.parcelas.length,
         periodicidade: 'mensal',
         com_entrada: false
       };
       const { data: recurrence, error: recurrenceError } = await supabase
         .from('recorrencias')
         .insert([{
           user_id: user.id,
           periodicidade: config.periodicidade,
           quantidade_total_parcelas: config.quantidade,
           data_inicio: data.parcelas[0].data,
           periodicidade_customizada_dias: config.periodicidade_customizada_dias
         }])
         .select('id')
         .single();
       if (recurrenceError) throw recurrenceError;
       recurrenceId = recurrence.id;
     } else if (recurrenceId && data.parcela_config) {
       const { error: recurrenceError } = await supabase
         .from('recorrencias')
         .update({
           periodicidade: data.parcela_config.periodicidade,
           quantidade_total_parcelas: data.parcela_config.quantidade,
           periodicidade_customizada_dias: data.parcela_config.periodicidade_customizada_dias,
           data_inicio: data.parcelas?.[0]?.data || current.data_vencimento
         })
         .eq('id', recurrenceId);
       if (recurrenceError) throw recurrenceError;
     }
     
     const updatePayload: any = {
       tipo_baixa: 'avr',
       motivo_ajuste: data.motivo_ajuste || current.motivo_ajuste || null,
       valor_previsto: valorParcelaSelecionadaAVR,
       valor_original: valorTotalAVR,
       ...(recurrenceId ? {
         recorrencia_id: recurrenceId,
         numero_parcela: data.parcelas?.find(parcela => parcela.id === id)?.numero || 1,
         quantidade_total_parcelas: data.parcela_config?.quantidade || data.parcelas?.length
       } : {}),
       ...(data.condicao ? { condicao: data.condicao } : {}),
       ...(data.data_competencia ? { data_competencia: data.data_competencia } : {}),
       ...(data.data_emissao ? { data_emissao: data.data_emissao } : {}),
       ...(data.conta_bancaria_id ? { conta_bancaria_id: data.conta_bancaria_id } : {}),
       ...(data.centro_custo_id ? { centro_custo_id: data.centro_custo_id } : {}),
       ...(data.categoria_id ? { categoria_id: data.categoria_id } : {}),
       observacoes: (current.observacoes || '') + `\n[AVR - Ajuste Realizado em ${timestampStr}] Valor alterado de R$ ${current.valor_original || current.valor_previsto} para R$ ${valorTotalAVR}. Motivo: ${data.motivo_ajuste || 'Não informado'}`,
     };

     // Se não for master, o status de aprovação volta para digital para conferência
     if (!isMaster) {
       updatePayload.status_aprovacao = 'digital';
     }

     const { data: updated, error: updateError } = await supabase
       .from('lancamentos_financeiros')
       .update(updatePayload)
       .eq('id', id)
       .select()
       .single();

     if (updateError) throw updateError;

     if (data.parcelas?.length && recurrenceId) {
       const submittedIds = data.parcelas.map(parcela => parcela.id).filter(Boolean);
       const { data: openParcelas, error: openParcelasError } = await supabase
         .from('lancamentos_financeiros')
         .select('id')
         .eq('recorrencia_id', recurrenceId)
         .eq('status_pagamento', 'aberto');
       if (openParcelasError) throw openParcelasError;

       const idsToRemove = (openParcelas || [])
         .map(parcela => parcela.id)
         .filter(parcelId => !submittedIds.includes(parcelId) && parcelId !== id);
       if (idsToRemove.length) {
         const { error: deleteError } = await supabase
           .from('lancamentos_financeiros')
           .delete()
           .in('id', idsToRemove);
         if (deleteError) throw deleteError;
       }

       for (const parcela of data.parcelas) {
         if (parcela.status !== 'aberto' && parcela.id !== id) continue;

         const parcelaValor = Number(parcela.valor.replace(/\./g, '').replace(',', '.')) || 0;
         const parcelaPayload: any = {
           data_vencimento: parcela.data,
           valor_previsto: parcelaValor,
           valor_original: valorTotalAVR,
           numero_parcela: parcela.numero,
           recorrencia_id: recurrenceId,
           quantidade_total_parcelas: data.parcela_config?.quantidade || data.parcelas.length,
           tipo_baixa: 'avr',
           motivo_ajuste: data.motivo_ajuste || current.motivo_ajuste || null,
           conta_bancaria_id: data.conta_bancaria_id || current.conta_bancaria_id,
           centro_custo_id: data.centro_custo_id || current.centro_custo_id,
           categoria_id: data.categoria_id || current.categoria_id,
           ...(data.condicao ? { condicao: data.condicao } : {}),
           ...(data.data_competencia ? { data_competencia: data.data_competencia } : {}),
           ...(data.data_emissao ? { data_emissao: data.data_emissao } : {})
         };

         if (parcela.id) {
           const { error: parcelaError } = await supabase
             .from('lancamentos_financeiros')
             .update(parcelaPayload)
             .eq('id', parcela.id);
           if (parcelaError) throw parcelaError;
         } else {
           const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...base } = current;
           const { error: parcelaError } = await supabase
             .from('lancamentos_financeiros')
             .insert([{
               ...base,
               ...parcelaPayload,
               status_pagamento: 'aberto',
               status_aprovacao: current.status_aprovacao,
               valor_recebido: 0,
               data_pagamento: null,
               tipo_baixa: 'financeira'
             }]);
           if (parcelaError) throw parcelaError;
         }
       }
     }

     // Propagação do AVR se solicitado e for recorrente
     if (data.propagate_avr !== 'none' && current.recorrencia_id) {
       const { data: openParcels, error: openParcelsError } = await supabase
         .from('lancamentos_financeiros')
         .select('id, numero_parcela')
         .eq('recorrencia_id', current.recorrencia_id)
         .eq('status_pagamento', 'aberto');
       if (openParcelsError) throw openParcelsError;

       for (const openParcel of openParcels || []) {
         const submittedParcel = data.parcelas?.find(parcel => parcel.numero === openParcel.numero_parcela);
         const parcelValue = submittedParcel
           ? Number(submittedParcel.valor.replace(/\./g, '').replace(',', '.')) || 0
           : valorPagoEfetivo;
         const { error: propagationError } = await supabase
           .from('lancamentos_financeiros')
           .update({
             valor_previsto: parcelValue,
             valor_original: valorTotalAVR,
             tipo_baixa: 'avr',
             motivo_ajuste: data.motivo_ajuste || current.motivo_ajuste || null,
             ...(data.conta_bancaria_id ? { conta_bancaria_id: data.conta_bancaria_id } : {}),
             ...(data.centro_custo_id ? { centro_custo_id: data.centro_custo_id } : {}),
             ...(data.categoria_id ? { categoria_id: data.categoria_id } : {}),
             ...(data.condicao ? { condicao: data.condicao } : {}),
             ...(data.data_competencia ? { data_competencia: data.data_competencia } : {}),
             ...(data.data_emissao ? { data_emissao: data.data_emissao } : {}),
             observacoes: (current.observacoes || '') + `\\n[AVR Propagado (${data.propagate_avr}) em ${timestampStr}]`
           })
           .eq('id', openParcel.id);
         if (propagationError) throw propagationError;
       }
     }

     // Mantém o total do título no registro exibido pela listagem, sem alterar o valor individual da parcela.
     if (data.parcelas?.length) {
       const totalQuery = supabase
         .from('lancamentos_financeiros')
         .update({ valor_original: valorTotalAVR });

       if (recurrenceId) {
         totalQuery.eq('recorrencia_id', recurrenceId);
       } else {
         totalQuery.eq('id', id);
       }

       const { error: totalError } = await totalQuery;
       if (totalError) throw totalError;
     }

     return updated as LancamentoFinanceiro;
   }

   const updatePayload: any = {
     status_pagamento: isPartial && !isBPI ? (isMaster ? 'pago_parcial' : 'quitação_pendente') : finalPaymentStatus,
     ...(isBaixaFinanceira ? { status_aprovacao: 'digital' } : {}),
     data_pagamento: dataPagamentoVal,
     hora_pagamento: isBPI ? null : horaPagamentoVal,
     conta_bancaria_id: contaBancariaVal,
     centro_custo_id: data.centro_custo_id || current.centro_custo_id,
     categoria_id: data.categoria_id || current.categoria_id,
     tipo_baixa: data.tipo_baixa || 'financeira',
     desconto_valor: descontoBase,
     desconto_tipo: descontoTipo,
     acrescimo_valor: acrescimoBase,
     acrescimo_tipo: acrescimoTipo,
     motivo_ajuste: data.motivo_ajuste || null,
     motivo_desconto_id: data.motivo_desconto_id || current.motivo_desconto_id || null,
     motivo_acrescimo_id: data.motivo_acrescimo_id || current.motivo_acrescimo_id || null,
     observacoes: isPartial && !isBPI
       ? observacaoOriginal + `\n[Pagamento parcial de R$ ${valorPagoEfetivo} em ${dataPagamentoVal.split('-').reverse().join('/')}]`
       : observacaoFinal,
     valor_recebido: isBPI ? 0 : totalValorRecebido
   };

   if (isAVR) {
     updatePayload.valor_previsto = valorPagoEfetivo;
     updatePayload.valor_original = valorTotalAVR;
     if (!isMaster) {
       updatePayload.status_aprovacao = 'digital';
     }
   }
   
   if (isBPI) {
     updatePayload.bpi_em = new Date().toISOString();
   }

   const { data: updated, error: updateError } = await supabase
     .from('lancamentos_financeiros')
     .update(updatePayload)
     .eq('id', id)
     .select()
     .single();

   if (updateError) throw updateError;

   // Propagação do AVR se solicitado e for recorrente
   if (isAVR && data.propagate_avr !== 'none' && current.recorrencia_id) {
     const propagationQuery = supabase
       .from('lancamentos_financeiros')
       .update({
         valor_previsto: valorPagoEfetivo,
         valor_original: valorTotalAVR,
         observacoes: (current.observacoes || '') + `\n[Valor ajustado via AVR propagado (${data.propagate_avr}) em ${new Date().toLocaleDateString('pt-BR')}]`
       })
       .eq('recorrencia_id', current.recorrencia_id);

     if (data.propagate_avr === 'open') {
       propagationQuery.eq('status_pagamento', 'aberto');
     }

     await propagationQuery;
   }

   return updated as LancamentoFinanceiro;
 },

  estornarLancamento: async (id: string): Promise<void> => {
    const { data: current, error: getError } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('id', id)
      .single();

    if (getError) throw getError;

    if (current.vinculo_residuo_id) {
      const { data: original } = await supabase
        .from('lancamentos_financeiros')
        .select('valor_previsto')
        .eq('id', current.vinculo_residuo_id)
        .single();
      
      if (original) {
        await supabase
          .from('lancamentos_financeiros')
          .update({ valor_previsto: original.valor_previsto + current.valor_previsto })
          .eq('id', current.vinculo_residuo_id);
      }
      await supabase.from('lancamentos_financeiros').delete().eq('id', id);
    } else {
      await supabase
        .from('lancamentos_financeiros')
        .update({
          status_pagamento: 'aberto',
          valor_recebido: 0,
          data_pagamento: null,
          tipo_baixa: 'financeira'
        })
        .eq('id', id);
    }
  },

  approveInBatch: async (ids: string[], targetStatus: 'digital' | 'confirmado_master' | 'reprovado'): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

    if (targetStatus === 'confirmado_master' && profile?.role !== 'master') {
      throw new Error('Apenas usuários Master podem confirmar saldos.');
    }

    const updatePayload: any = {
      status_aprovacao: targetStatus,
      data_aprovacao: targetStatus === 'confirmado_master' ? new Date().toISOString() : null
    };

    if (targetStatus === 'confirmado_master') {
      updatePayload.status_pagamento = 'pago';
      updatePayload.data_pagamento = new Date().toISOString().split('T')[0];
    } else if (targetStatus === 'reprovado') {
      // Quando reprovado, o título volta a ficar aberto e limpa datas de pagamento se existirem
      updatePayload.status_pagamento = 'aberto';
      updatePayload.data_pagamento = null;
    }

    if (targetStatus === 'confirmado_master') {
      const { data: partialRows, error: partialRowsError } = await supabase
        .from('lancamentos_financeiros')
        .select('id, status_pagamento, vinculo_residuo_id')
        .in('id', ids);
      if (partialRowsError) throw partialRowsError;

      const partialIds = new Set((partialRows || [])
        .filter(row => row.status_pagamento === 'pago_parcial' || row.vinculo_residuo_id)
        .map(row => row.id));
      const regularIds = ids.filter(id => !partialIds.has(id));

      if (regularIds.length > 0) {
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update(updatePayload)
          .in('id', regularIds);
        if (error) throw error;
      }

      if (partialIds.size > 0) {
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({ ...updatePayload, status_pagamento: 'pago_parcial' })
          .in('id', Array.from(partialIds));
        if (error) throw error;
      }
    } else {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .update(updatePayload)
        .in('id', ids);
      if (error) throw error;
    }
  },

  confirmarQuitacao: async (id: string, isMaster: boolean = false): Promise<void> => {
    const { error } = await supabase
      .from('lancamentos_financeiros')
      .update({ status_pagamento: isMaster ? 'pago' : 'quitação_pendente' })
      .eq('id', id);
    if (error) throw error;
  },

  getAnexos: async (lancamentoId: string): Promise<any[]> => {
    diagnosticLogger.info('lancamento-anexos', 'Iniciando leitura dos anexos no banco', { lancamentoId });
    const { data, error } = await supabase
      .from('lancamento_anexos')
      .select('*')
      .eq('lancamento_id', lancamentoId);
    if (error) {
      diagnosticLogger.error('lancamento-anexos', 'Erro na leitura dos anexos no banco', { lancamentoId, error });
      throw error;
    }
    diagnosticLogger.info('lancamento-anexos', 'Leitura dos anexos concluída', { lancamentoId, count: data?.length || 0, rows: data });
    return data || [];
  },

  deleteAnexo: async (id: string, filePath: string): Promise<void> => {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);
    if (storageError) console.error('Storage error:', storageError);

    const { error: dbError } = await supabase
      .from('lancamento_anexos')
      .delete()
      .eq('id', id);
    if (dbError) throw dbError;
  }
};