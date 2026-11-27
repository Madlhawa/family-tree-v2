import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: React.RefObject<HTMLElement>, active = true, onEscape?: () => void) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  description?: ReactNode;
  /** Hide the title row (custom header in children) */
  bare?: boolean;
  labelledBy?: string;
}

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

export function Dialog({ title, onClose, children, footer, size = 'md', description, bare }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(ref, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-6 no-print">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className={`relative flex flex-col w-full ${SIZES[size]} bg-surface sm:rounded-xl shadow-lift sm:max-h-[min(90vh,900px)] h-full sm:h-auto animate-pop outline-none`}
      >
        <div className={bare ? 'sr-only' : 'flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line'}>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-lg font-semibold truncate">
              {title}
            </h2>
            {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
          </div>
          {!bare && (
            <button className="icon-btn -mr-2 shrink-0" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-line pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
