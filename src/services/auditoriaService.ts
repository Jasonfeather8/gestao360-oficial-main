import { supabase } from '@/integrations/supabase/client';
import { AuditoriaLog } from '../types';

export const auditoriaService = {
  getAll: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('auditoria_logs')
      .select('*, profiles(nome, email)')
      .order('data_hora', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data;
  }
};
