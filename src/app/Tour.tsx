import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from '../store/store';

const STEPS = [
  { target: '[data-person]', title: 'Your people', text: 'Click a card to open the profile. Hover (or tap) to see the + Parent, + Sibling, + Spouse and + Child buttons.' },
  { target: '[data-tour="views"]', title: 'Different views', text: 'Switch between the whole family, ancestors only, descendants only, or a fan chart.' },
  { target: '[data-tour="treename"]', title: 'Several trees', text: 'Keep more than one tree. Switch, rename, copy or import here.' },
  { target: '[data-tour="menu"]', title: 'Everything else', text: 'Search, relationship finder, statistics, data checks, backups and more live in the menu.' },
];

export function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];
  const homeId = useStore((s) => s.tree?.homeId);
  useLayoutEffect(() => {
    const el = (i === 0 && homeId && document.querySelector(`[data-person="${homeId}"]`)) || document.querySelector(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step, i, homeId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  const W = 300;
  const below = !rect || rect.top < window.innerHeight / 2;
  const left = rect ? Math.max(12, Math.min(window.innerWidth - W - 12, rect.left + rect.width / 2 - W / 2)) : window.innerWidth / 2 - W / 2;
  const top = rect ? (below ? rect.bottom + 12 : rect.top - 12) : window.innerHeight / 3;
  return (
    <div className="fixed inset-0 z-[55] no-print" role="dialog" aria-modal="false" aria-label="Quick tour">
      {rect && (
        <div
          className="absolute rounded-lg ring-4 ring-accent/60 pointer-events-none transition-all"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.25)' }}
        />
      )}
      <div className="absolute card shadow-lift p-4 animate-pop" style={{ left, top, width: W, transform: below ? undefined : 'translateY(-100%)' }}>
        <p className="text-xs text-muted">
          {i + 1} of {STEPS.length}
        </p>
        <p className="font-semibold mt-0.5">{step.title}</p>
        <p className="text-sm text-muted mt-1">{step.text}</p>
        <div className="flex justify-between mt-3">
          <button className="btn-ghost h-9" onClick={onDone}>
            Skip
          </button>
          <button className="btn-primary h-9" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())} autoFocus>
            {i < STEPS.length - 1 ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useTourGate() {
  const seen = useStore((s) => s.tourSeen);
  return !seen;
}
