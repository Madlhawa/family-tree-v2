import { useEffect } from 'react';
import type { Layout } from '../layout/layout';
import { childrenOf, parentsOf, partnersOf } from '../model/graph';
import { useStore } from '../store/store';

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** Nearest person in a direction, using the layout. */
function neighbour(layout: Layout, id: string, dir: 'up' | 'down' | 'left' | 'right'): string | undefined {
  const me = layout.nodes.get(id);
  if (!me) return undefined;
  let best: string | undefined;
  let bestScore = Infinity;
  for (const n of layout.nodes.values()) {
    if (n.id === id) continue;
    const dx = n.x - me.x;
    const dy = n.y - me.y;
    let ok = false;
    if (dir === 'left') ok = dy === 0 && dx < 0;
    if (dir === 'right') ok = dy === 0 && dx > 0;
    if (dir === 'up') ok = dy < 0;
    if (dir === 'down') ok = dy > 0;
    if (!ok) continue;
    const score = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy) * 3 + Math.abs(dx);
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

export function useShortcuts(layout: Layout | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !isTyping(e.target)) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          s.undo();
          return;
        }
        if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          s.redo();
          return;
        }
      }
      if (mod || e.altKey || isTyping(e.target)) return;
      if (s.dialog || s.profile || s.addForm || !s.tree) return;
      if (e.key === 'Escape') {
        if (s.highlight.length) s.setHighlight([]);
        else s.select(undefined);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        s.setDialog({ type: 'search' });
        return;
      }
      if (e.key === '?') {
        s.setDialog({ type: 'shortcuts' });
        return;
      }
      const tree = s.tree;
      const cur = s.selectedId ?? s.focusId;
      if (!cur || !tree.people[cur]) return;
      const k = e.key.toLowerCase();
      if (k === 'f') return s.fitView();
      if (k === 'h' && tree.homeId) return s.focus(tree.homeId);
      const relKey: Record<string, 'parent' | 'spouse' | 'child' | 'sibling'> = { p: 'parent', s: 'spouse', c: 'child', b: 'sibling' };
      if (relKey[k]) {
        e.preventDefault();
        const el = document.querySelector(`[data-person="${cur}"]`)?.getBoundingClientRect();
        s.setAddForm({ anchorId: cur, rel: relKey[k], x: el ? el.left + el.width / 2 : window.innerWidth / 2, y: el ? (k === 'p' ? el.top - 300 : el.bottom) : 160 });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        s.openProfile(cur);
        return;
      }
      const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      let next: string | undefined;
      if (s.view === 'fan') {
        if (dir === 'up') next = parentsOf(tree, cur)[0]?.person.id;
        if (dir === 'down') next = childrenOf(tree, cur)[0]?.person.id;
        if (next) s.focus(next);
        return;
      }
      if (layout) {
        // Prefer real family links when walking up/down
        if (dir === 'up') next = parentsOf(tree, cur).find((p) => layout.nodes.has(p.person.id))?.person.id;
        if (dir === 'down') next = childrenOf(tree, cur).find((c) => layout.nodes.has(c.person.id))?.person.id;
        if (!next && (dir === 'left' || dir === 'right')) next = neighbour(layout, cur, dir);
        if (!next) next = neighbour(layout, cur, dir);
        if (!next && dir === 'right') next = partnersOf(tree, cur)[0]?.person.id;
      }
      if (next) useStore.setState({ selectedId: next, fly: { id: next, nonce: Date.now() } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout]);
}
