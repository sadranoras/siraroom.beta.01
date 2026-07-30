import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToasts } from '@/lib/toast';

export default function Toaster() {
  const toasts = useToasts();
  return (
    <div className="fixed bottom-5 left-5 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass-strong rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 anim-slide-in min-w-[260px] ${
            t.kind === 'success'
              ? 'border-success-500/40'
              : t.kind === 'error'
              ? 'border-error-500/40'
              : 'border-sky-500/40'
          }`}
        >
          {t.kind === 'success' && <CheckCircle2 className="w-5 h-5 text-success-400 shrink-0" />}
          {t.kind === 'error' && <AlertCircle className="w-5 h-5 text-error-400 shrink-0" />}
          {t.kind === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
          <span className="text-sm text-slate-100">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
