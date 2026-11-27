import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useStore } from '../store/store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const undo = useStore((s) => s.undo);
  return (
    <div
      className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center w-[min(100%-32px,480px)] pointer-events-none no-print pb-[env(safe-area-inset-bottom)]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto w-full flex items-center gap-3 rounded-lg bg-ink text-bg shadow-lift px-4 py-2.5 text-sm animate-pop"
        >
          {t.kind === 'error' ? (
            <XCircle size={18} className="shrink-0 text-danger" aria-hidden />
          ) : t.kind === 'success' ? (
            <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden />
          ) : (
            <Info size={18} className="shrink-0 opacity-70" aria-hidden />
          )}
          <span className="flex-1">{t.message}</span>
          {t.undo && (
            <button
              className="font-semibold underline-offset-2 hover:underline px-1 min-h-[32px]"
              onClick={() => {
                undo();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          {t.action && (
            <button
              className="font-semibold underline-offset-2 hover:underline px-1 min-h-[32px]"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="opacity-60 hover:opacity-100 p-1" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
