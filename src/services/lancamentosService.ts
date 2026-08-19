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
  statusPagamento?: string;
  type?: string;
  authorId?: string;
  categoryId?: string;
  contaId?: string;
  centroCustoId?: string;
  condicao?: string;
  temDesconto?: string;
  temAcrescimo?: string;
  motivoDescontoId?: string;
  motivoAcrescimoId?: string;
  page?: number;
  pageSize?: number;
}

export const lancamentosService = {
  getAll: async (filters?: LancamentoFilters): Promise<{ data: LancamentoFinanceiro[], count: number }> => {
    let query = supabase
      .from('lancamentos_financeiros')
      .select('*, entidades_negocio!inner(nome_razao_social)', { count: 'exact' })
      .order('codigo_sequencial', { ascending: true })
      .order('data_vencimento', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.startDate) query = query.gte('data_vencimento', filters.startDate);
      if (filters.endDate) query = query.lte('data_vencimento', filters.endDate);
      
      if (filters.docCode) query = query.eq('codigo_sequencial', filters.docCode);
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
      
      if (filters.statusPagamento && filters.statusPagamento !== 'all') {
        query = query.eq('status_pagamento', filters.statusPagamento);
      }
      
      if (filters.type && filters.type !== 'all') {
        query = query.eq('tipo', filters.type);
      }

      if (filters.authorId && filters.authorId !== 'all') {
        query = query.eq('usuario_criador_id', filters.authorId);
      }

      if (filters.categoryId && filters.categoryId !== 'all') {
        query = query.eq('categoria_id', filters.categoryId);
      }

      if (filters.contaId && filters.contaId !== 'all') {
        query = query.eq('conta_bancaria_id', filters.contaId);
      }

      if (filters.centroCustoId && filters.centroCustoId !== 'all') {
        query = query.eq('centro_custo_id', filters.centroCustoId);
      }

      if (filters.condicao && filters.condicao !== 'all') {
        query = query.eq('condicao', filters.condicao);
      }

      if (filters.temDesconto === 'sim') {
        query = query.gt('desconto_valor', 0);
      } else if (filters.temDesconto === 'nao') {
        query = query.or('desconto_valor.eq.0,desconto_valor.is.null');
      }

      if (filters.temAcrescimo === 'sim') {
        query = query.gt('acrescimo_valor', 0);
      } else if (filters.temAcrescimo === 'nao') {
        query = query.or('acrescimo_valor.eq.0,acrescimo_valor.is.null');
      }

      if (filters.motivoDescontoId && filters.motivoDescontoId !== 'all') {
        query = query.eq('motivo_desconto_id', filters.motivoDescontoId);
      }

      if (filters.motivoAcrescimoId && filters.motivoAcrescimoId !== 'all') {
        query = query.eq('motivo_acrescimo_id', filters.motivoAcrescimoId);
      }

      if (filters.searchTerm) {
        const term = `%${filters.searchTerm}%`;
        query = query.or(`observacoes.ilike.${term},entidades_negocio.nome_razao_social.ilike.${term}`);
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

      const parcelas = recorrencia.parcelas.map((p: any, index: number) => ({
        ...lancamentoData,
        data_vencimento: p.data_vencimento,
        valor_previsto: p.valor_previsto,
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

    const { data: current } = await supabase
      .from('lancamentos_financeiros')
      .select('recorrencia_id')
      .eq('id', id)
      .single();

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
    const valorPagoEfetivo = (isBPI || isAVR) ? (data.valor_pago > 0 ? data.valor_pago : (isBPI ? 0 : current.valor_previsto)) : (data.valor_pago > 0 ? data.valor_pago : current.valor_previsto);
    const valorTotalAVR = data.parcelas?.length
      ? data.parcelas.reduce((total, parcela) => total + (Number(parcela.valor.replace(/\./g, '').replace(',', '.')) || 0), 0)
      : valorPagoEfetivo;
    const subtotal = current.valor_previsto - (data.valor_desconto || 0) + (data.valor_acrescimo || 0);
    const isPartial = valorPagoEfetivo < subtotal;
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
       valor_previsto: valorTotalAVR,
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
           valor_original: parcelaValor,
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
             valor_original: parcelValue,
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
       const { error: totalError } = await supabase
         .from('lancamentos_financeiros')
         .update({ valor_original: valorTotalAVR })
         .eq('id', id);
       if (totalError) throw totalError;
     }

     return updated as LancamentoFinanceiro;
   }

   if (isPartial && !isBPI) {
     const saldoRestante = subtotal - valorPagoEfetivo;

     // ATUALIZAÇÃO CRÍTICA: O resíduo mantém o status de aprovação do pai
     const { data: updatedOriginal, error: updateError } = await supabase
       .from('lancamentos_financeiros')
       .update({
         valor_previsto: saldoRestante,
         valor_original: current.valor_original || current.valor_previsto, // Preserva o valor original da dívida total
         // Não resetamos mais para 'pendente_digital' se o original já era 'confirmado_master'
         status_aprovacao: current.status_aprovacao,
         observacoes: observacaoOriginal + `\n[Abatido pagamento parcial de R$ ${valorPagoEfetivo} em ${dataPagamentoVal.split('-').reverse().join('/')}]`
       })
       .eq('id', id)
       .select()
       .single();

     if (updateError) throw updateError;

     const { id: _, created_at: __, updated_at: ___, ...rest } = current;
     const { error: insertError } = await supabase
       .from('lancamentos_financeiros')
       .insert([{
         ...rest,
         valor_previsto: valorPagoEfetivo,
         valor_recebido: valorPagoEfetivo,
         status_pagamento: isMaster ? 'pago' : 'quitação_pendente',
         data_pagamento: dataPagamentoVal,
         hora_pagamento: horaPagamentoVal,

         conta_bancaria_id: contaBancariaVal,
         centro_custo_id: data.centro_custo_id || current.centro_custo_id,
         categoria_id: data.categoria_id || current.categoria_id,
         tipo_baixa: data.tipo_baixa || 'financeira',
         desconto_valor: data.valor_desconto || 0,
         acrescimo_valor: data.valor_acrescimo || 0,
         motivo_ajuste: data.motivo_ajuste || null,
         motivo_desconto_id: data.motivo_desconto_id || null,
         motivo_acrescimo_id: data.motivo_acrescimo_id || null,
         vinculo_residuo_id: id,
         observacoes: observacaoOriginal + `\n[Pagamento parcial quitado. Referente à cobrança original de R$ ${current.valor_previsto}]`,
         bpi_em: isBPI ? new Date().toISOString() : null
       }]);

     if (insertError) throw insertError;
     return updatedOriginal as LancamentoFinanceiro;
   } else {
     const updatePayload: any = {
       status_pagamento: finalPaymentStatus,
       data_pagamento: dataPagamentoVal,
       hora_pagamento: isBPI ? null : horaPagamentoVal,

       conta_bancaria_id: contaBancariaVal,
       centro_custo_id: data.centro_custo_id || current.centro_custo_id,
       categoria_id: data.categoria_id || current.categoria_id,
       tipo_baixa: data.tipo_baixa || 'financeira',
       desconto_valor: data.valor_desconto || 0,
       acrescimo_valor: data.valor_acrescimo || 0,
       motivo_ajuste: data.motivo_ajuste || null,
       motivo_desconto_id: data.motivo_desconto_id || null,
       motivo_acrescimo_id: data.motivo_acrescimo_id || null,
       valor_previsto: isAVR ? valorPagoEfetivo : (isBPI ? current.valor_previsto : subtotal),
       observacoes: observacaoFinal,
       valor_recebido: isBPI ? 0 : valorPagoEfetivo
     };

     if (isAVR) {
       updatePayload.valor_original = valorPagoEfetivo;
       // Se for AVR e não for master, o status de aprovação volta para digital para nova conferência do saldo real
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
           valor_original: valorPagoEfetivo,
           observacoes: (current.observacoes || '') + `\n[Valor ajustado via AVR propagado (${data.propagate_avr}) em ${new Date().toLocaleDateString('pt-BR')}]`
         })
         .eq('recorrencia_id', current.recorrencia_id);

       if (data.propagate_avr === 'open') {
         propagationQuery.eq('status_pagamento', 'aberto');
       }
       // Se for 'all', não adiciona filtro de status

       await propagationQuery;
     }

     return updated as LancamentoFinanceiro;
   }
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

    const { error } = await supabase
      .from('lancamentos_financeiros')
      .update(updatePayload)
      .in('id', ids);
    if (error) throw error;
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