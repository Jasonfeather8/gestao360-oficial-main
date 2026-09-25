import { AlertTriangle, CheckCircle2, Database, LockKeyhole, Monitor, Wifi } from 'lucide-react';
import { DataBridgeIntegrityResult } from '../services/dataBridgeIntegrityService';

type IntegrityBannerProps = {
  result: DataBridgeIntegrityResult | null;
};

function valueLabel(value: string) {
  return value === 'connected' ? 'Conectada' : value === 'partial' ? 'Parcial' : 'Falhou';
}

export default function IntegrityBanner({ result }: IntegrityBannerProps) {
  if (!result) {
    return (
      <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Wifi className="h-5 w-5" />
          <div>
            <h2 className="text-sm font-black text-on-surface">Integridade do Data-Bridge</h2>
            <p className="mt-1 text-xs">Selecione um profile e execute o diagnóstico para iniciar a leitura.</p>
          </div>
        </div>
      </section>
    );
  }

  const critical = result.mismatchReport.severity === 'critical';
  const healthy = result.connectionStatus === 'connected' && result.permissionStatus === 'validated' && !critical;
  const tone = healthy ? 'border-emerald-200 bg-emerald-50' : critical ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50';
  const textTone = healthy ? 'text-emerald-800' : critical ? 'text-red-800' : 'text-amber-800';

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${tone}`} aria-live="polite">
      <div className="flex items-start gap-3">
        {critical ? <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${textTone}`} /> : healthy ? <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${textTone}`} /> : <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${textTone}`} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={`text-sm font-black ${textTone}`}>{critical ? 'Ponte de Dados Quebrada' : 'Data-Bridge verificado'}</h2>
            <span className={`text-[10px] font-black uppercase tracking-wider ${textTone}`}>{result.scanId}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Indicator icon={<Wifi className="h-4 w-4" />} label="Status da Conexão" value={valueLabel(result.connectionStatus)} tone={textTone} />
            <Indicator icon={<LockKeyhole className="h-4 w-4" />} label="Permissão do Usuário" value={result.permissionStatus === 'validated' ? 'Validada' : result.permissionStatus === 'blocked' ? 'Bloqueada' : 'Indisponível'} tone={textTone} />
            <Indicator icon={<Database className="h-4 w-4" />} label="Registros no Banco" value={String(result.mismatchReport.databaseCount ?? '—')} tone={textTone} />
            <Indicator icon={<Monitor className="h-4 w-4" />} label="Registros na UI" value={String(result.mismatchReport.uiCount ?? '—')} tone={textTone} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Indicator({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-current/10 bg-white/50 p-3">
      <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wide ${tone}`}>{icon}{label}</div>
      <p className={`mt-2 text-sm font-black ${tone}`}>{value}</p>
    </div>
  );
}
