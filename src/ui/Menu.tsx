import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  testId?: string;
}

export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

interface Props {
  button: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement> }) => ReactNode;
  groups: MenuGroup[];
  align?: 'left' | 'right' | 'center';
  width?: number;
  label: string;
}

export function Menu({ button, groups, align = 'right', width = 280, label }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((g) => g.items);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    const first = menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])');
    first?.focus();
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    }
  };

  const pos = align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div className="relative">
      {button({ open, toggle: () => setOpen((o) => !o), ref: btnRef })}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          style={{ width }}
          className={`absolute ${pos} mt-2 z-40 card p-1.5 max-h-[calc(100vh-80px)] overflow-y-auto animate-pop max-w-[calc(100vw-16px)]`}
        >
          {groups.map((g, gi) => (
            <div key={gi} role="group" aria-label={g.label} className={gi ? 'border-t border-line mt-1.5 pt-1.5' : ''}>
              {g.label && <div className="px-2.5 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</div>}
              {g.items.map((it) => (
                <button
                  key={it.label}
                  role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={it.checked}
                  disabled={it.disabled}
                  data-testid={it.testId}
                  className={`w-full flex items-center gap-3 px-2.5 h-10 rounded text-sm text-left hover:bg-subtle focus:bg-subtle focus:outline-none disabled:opacity-40 ${
                    it.danger ? 'text-danger' : 'text-ink'
                  }`}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  <span className="w-5 flex justify-center text-muted" aria-hidden>
                    {it.icon}
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.checked && <Check size={16} className="text-accent" aria-hidden />}
                  {it.shortcut && <kbd className="text-[11px] text-muted font-sans border border-line rounded px-1.5 py-0.5">{it.shortcut}</kbd>}
                </button>
              ))}
            </div>
          ))}
          {all.length === 0 && <div className="p-3 text-sm text-muted">Nothing here</div>}
        </div>
      )}
    </div>
  );
}
