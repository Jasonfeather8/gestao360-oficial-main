import type { ExtratoLido, ProgressoLeituraExtrato } from '../../types';
import { lerExtratoIA } from './motorIA';
import { lerExtratoPdf } from './pdfReader';

/**
 * Contrato do motor de leitura de extrato.
 */
export interface MotorLeituraExtrato {
  id: 'pdf_texto' | 'ia';
  nome: string;
  aceita: (arquivo: File) => boolean;
  ler: (arquivo: File, onProgress?: (progresso: ProgressoLeituraExtrato) => void) => Promise<ExtratoLido>;
}

const motorIA: MotorLeituraExtrato = {
  id: 'ia',
  nome: 'IA (OpenAI)',
  aceita: (arquivo) =>
    arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf'),
  ler: lerExtratoIA,
};

const motorPdfTexto: MotorLeituraExtrato = {
  id: 'pdf_texto',
  nome: 'PDF (texto)',
  aceita: (arquivo) =>
    arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf'),
  ler: lerExtratoPdf,
};

const MOTORES: MotorLeituraExtrato[] = [motorIA, motorPdfTexto];

export function getMotorLeitura(arquivo: File): MotorLeituraExtrato {
  const motor = MOTORES.find((candidato) => candidato.aceita(arquivo));
  if (!motor) throw new Error('Formato não suportado. Envie o extrato em PDF.');
  return motor;
}

export async function lerExtrato(
  arquivo: File,
  onProgress?: (progresso: ProgressoLeituraExtrato) => void,
): Promise<ExtratoLido> {
  return getMotorLeitura(arquivo).ler(arquivo, onProgress);
}
