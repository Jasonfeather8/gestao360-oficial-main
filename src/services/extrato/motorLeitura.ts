import type { ExtratoLido } from '../../types';
import { lerExtratoPdf } from './pdfReader';

/**
 * Contrato do motor de leitura de extrato.
 * O motor de IA será apenas mais uma implementação registrada em MOTORES.
 */
export interface MotorLeituraExtrato {
  id: 'pdf_texto' | 'ia';
  nome: string;
  aceita: (arquivo: File) => boolean;
  ler: (arquivo: File) => Promise<ExtratoLido>;
}

const motorPdfTexto: MotorLeituraExtrato = {
  id: 'pdf_texto',
  nome: 'PDF (texto)',
  aceita: (arquivo) =>
    arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf'),
  ler: lerExtratoPdf,
};

const MOTORES: MotorLeituraExtrato[] = [motorPdfTexto];

export function getMotorLeitura(arquivo: File): MotorLeituraExtrato {
  const motor = MOTORES.find((candidato) => candidato.aceita(arquivo));
  if (!motor) throw new Error('Formato não suportado. Envie o extrato em PDF.');
  return motor;
}

export async function lerExtrato(arquivo: File): Promise<ExtratoLido> {
  return getMotorLeitura(arquivo).ler(arquivo);
}
