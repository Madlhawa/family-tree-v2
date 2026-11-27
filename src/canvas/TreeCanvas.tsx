import { ChevronDown, ChevronUp, Home, Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { siblingBlocks, TILE_H, TILE_W, type Layout } from '../layout/layout';
import { issuesByPerson } from '../model/checks';
import { countAncestors, countDescendants, orderedChildren } from '../model/graph';
import { reorderChildren } from '../model/ops';
import { birthYear, deathYear, displayName, isLiving } from '../model/people';
import { commitWithToast, useStore, type AddFormState } from '../store/store';
import { Tile, type Detail } from './Tile';

interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.08;
const MAX_K = 2;

interface DragState {
  id: string;
  familyId: string;
  pointerId: number;
  startX: number;
  startWorldX: number;
  dx: number;
  insertAt: number;
  blocks: { id: string; left: number; right: number; x: number }[];
}

export function TreeCanvas({ layout }: { layout: Layout }) {
  const tree = useStore((s) => s.tree)!;
  const focusId = useStore((s) => s.focusId);
  const selectedId = useStore((s) => s.selectedId);
  const highlight = useStore((s) => s.highlight);
  const publicView = useStore((s) => s.publicView);
  const fly = useStore((s) => s.fly);
  const fitNonce = useStore((s) => s.fitNonce);
  const timeYear = useStore((s) => s.timeYear);
  const addForm = useStore((s) => s.addForm);
  const { select, openProfile, setAddForm, toggleCollapse, focus } = useStore.getState();

  const vpRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 0.8 });
  const tRef = useRef(t);
  tRef.current = t;
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const anim = useRef<number>();
  const isTouch = useRef(false);

  const issues = useMemo(() => issuesByPerson(tree), [tree]);
  const highlightSet = useMemo(() => new Set(highlight), [highlight]);
  const highlightFamilies = useMemo(() => {
    const out = new Set<string>();
    for (let i = 0; i + 1 < highlight.length; i++) {
      const a = highlight[i];
      const b = highlight[i + 1];
      for (const f of Object.values(tree.families)) {
        const members = new Set([...f.partners, ...f.children.map((c) => c.id)]);
        if (members.has(a) && members.has(b)) out.add(f.id);
      }
    }
    return out;
  }, [highlight, tree.families]);

  const detail: Detail = t.k >= 0.5 ? 'full' : t.k >= 0.26 ? 'medium' : 'dot';

  // ----- viewport size
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const animateTo = useCallback((target: Transform, ms = 380) => {
    cancelAnimationFrame(anim.current!);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = tRef.current;
    if (reduce || ms === 0) {
      setT(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setT({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  const fit = useCallback(
    (animate = true) => {
      const el = vpRef.current;
      if (!el || !layout.nodes.size) return;
      const { minX, minY, maxX, maxY } = layout.bounds;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const pad = 48;
      const k = Math.max(MIN_K, Math.min(1, (w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1)));
      const target = { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
      if (animate) animateTo(target);
      else setT(target);
    },
    [layout, animateTo],
  );

  const centerOn = useCallback(
    (id: string, animate = true) => {
      const n = layout.nodes.get(id);
      const el = vpRef.current;
      if (!n || !el) return;
      const k = Math.max(tRef.current.k, 0.75);
      const target = { k, x: el.clientWidth / 2 - n.x * k, y: el.clientHeight / 2 - (n.y + TILE_H / 2) * k };
      if (animate) animateTo(target);
      else setT(target);
    },
    [layout, animateTo],
  );

  // Fit on view/tree switch; keep focus person steady on relayout
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      if (layout.nodes.size > 12 && focusId) centerOn(focusId, false);
      else fit(false);
      return;
    }
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // When the focus changes the layout re-centres around the focus — keep it in view.
  const prevFocus = useRef(focusId);
  useEffect(() => {
    if (prevFocus.current !== focusId && focusId) centerOn(focusId);
    prevFocus.current = focusId;
  }, [focusId, layout, centerOn]);

  // After an edit the layout is rebuilt (e.g. a new parent row pushes everything down).
  // Keep the focus person at the same spot on screen so nothing jumps away.
  const prevLayout = useRef(layout);
  useLayoutEffect(() => {
    const prev = prevLayout.current;
    prevLayout.current = layout;
    if (prev === layout || !focusId || prevFocus.current !== focusId) return;
    const a = prev.nodes.get(focusId);
    const b = layout.nodes.get(focusId);
    if (!a || !b || (a.x === b.x && a.y === b.y)) return;
    setT((cur) => ({ ...cur, x: cur.x - (b.x - a.x) * cur.k, y: cur.y - (b.y - a.y) * cur.k }));
  }, [layout, focusId]);

  // Make sure a newly selected person (just added, or reached by arrow keys) is on screen.
  useEffect(() => {
    if (!selectedId) return;
    const id = requestAnimationFrame(() => {
      const n = layout.nodes.get(selectedId);
      const el = vpRef.current;
      if (!n || !el) return;
      const cur = tRef.current;
      const m = 72; // room for the + buttons
      const left = cur.x + (n.x - TILE_W / 2) * cur.k;
      const right = cur.x + (n.x + TILE_W / 2) * cur.k;
      const top = cur.y + n.y * cur.k;
      const bottom = cur.y + (n.y + TILE_H) * cur.k;
      let dx = 0;
      let dy = 0;
      if (left < m) dx = m - left;
      else if (right > el.clientWidth - m) dx = el.clientWidth - m - right;
      if (top < m) dy = m - top;
      else if (bottom > el.clientHeight - m - 40) dy = el.clientHeight - m - 40 - bottom;
      if (dx || dy) animateTo({ ...cur, x: cur.x + dx, y: cur.y + dy }, 250);
    });
    return () => cancelAnimationFrame(id);
  }, [selectedId, layout, animateTo]);

  useEffect(() => {
    if (fly) {
      // wait a frame so a new layout is in place
      requestAnimationFrame(() => centerOn(fly.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.nonce]);

  // ----- wheel zoom
  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    setT((cur) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, cur.k * factor));
      const f = k / cur.k;
      return { k, x: sx - (sx - cur.x) * f, y: sy - (sy - cur.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(anim.current!);
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const isPinch = e.ctrlKey;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Trackpad two-finger scroll (small, non-pinch, has deltaX) pans; mouse wheel / pinch zoom.
      if (!isPinch && Math.abs(e.deltaX) > 0 && Math.abs(dy) < 50 && e.deltaMode === 0) {
        setT((cur) => ({ ...cur, x: cur.x - e.deltaX, y: cur.y - dy }));
        return;
      }
      const factor = Math.exp(-dy * (isPinch ? 0.01 : 0.0015));
      zoomAt(sx, sy, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ----- pointer handling: pan, pinch, tile click, tile drag
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { type: 'pan'; lastX: number; lastY: number; moved: boolean }
    | { type: 'pinch'; dist: number; cx: number; cy: number }
    | { type: 'tile'; id: string; startX: number; startY: number; lastX: number; lastY: number; moved: boolean; pan: boolean }
    | null
  >(null);

  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - tRef.current.x) / tRef.current.k, y: (sy - tRef.current.y) / tRef.current.k });

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    isTouch.current = e.pointerType === 'touch';
    cancelAnimationFrame(anim.current!);
    const rect = vpRef.current!.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      setDrag(null);
      return;
    }
    const tileEl = (e.target as HTMLElement).closest<HTMLElement>('[data-person]');
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (tileEl) {
      gesture.current = { type: 'tile', id: tileEl.dataset.person!, startX: sx, startY: sy, lastX: sx, lastY: sy, moved: false, pan: false };
    } else {
      gesture.current = { type: 'pan', lastX: sx, lastY: sy, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = vpRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setT((cur) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, (cur.k * dist) / (g.dist || dist)));
        const f = k / cur.k;
        return { k, x: cx - (g.cx - cur.x) * f, y: cy - (g.cy - cur.y) * f };
      });
      g.dist = dist;
      g.cx = cx;
      g.cy = cy;
      return;
    }
    if (g.type === 'pan') {
      const dx = sx - g.lastX;
      const dy = sy - g.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 0) g.moved = true;
      g.lastX = sx;
      g.lastY = sy;
      setT((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
      return;
    }
    if (g.type === 'tile') {
      const d = dragRef.current;
      if (d) {
        const w = screenToWorld(sx, sy);
        const dx = w.x - d.startWorldX;
        const others = d.blocks.filter((b) => b.id !== d.id);
        let insertAt = others.filter((b) => (b.left + b.right) / 2 < w.x).length;
        insertAt = Math.max(0, Math.min(others.length, insertAt));
        setDrag({ ...d, dx, insertAt });
        return;
      }
      if (g.pan) {
        setT((cur) => ({ ...cur, x: cur.x + (sx - g.lastX), y: cur.y + (sy - g.lastY) }));
        g.lastX = sx;
        g.lastY = sy;
        return;
      }
      const mx = sx - g.startX;
      const my = sy - g.startY;
      if (Math.hypot(mx, my) > 6) {
        g.moved = true;
        const node = layout.nodes.get(g.id);
        const fam = node?.underFamily;
        const horizontal = Math.abs(mx) > Math.abs(my) * 1.3;
        if (fam && horizontal && !isTouch.current) {
          const blocks = siblingBlocks(layout, tree, fam);
          if (blocks.length >= 2) {
            const w = screenToWorld(g.startX, g.startY);
            const others = blocks.filter((b) => b.id !== g.id);
            const myIdx = blocks.findIndex((b) => b.id === g.id);
            setDrag({ id: g.id, familyId: fam, pointerId: e.pointerId, startX: g.startX, startWorldX: w.x, dx: 0, insertAt: Math.min(myIdx, others.length), blocks });
            setHoverId(null);
            return;
          }
        }
        g.pan = true;
        g.lastX = sx;
        g.lastY = sy;
      }
    }
  };

  const finishDrag = (commit: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || !commit) return;
    const others = d.blocks.filter((b) => b.id !== d.id).map((b) => b.id);
    const order = [...others.slice(0, d.insertAt), d.id, ...others.slice(d.insertAt)];
    const current = d.blocks.map((b) => b.id);
    if (order.join() === current.join()) return;
    // include children not drawn here (keep them in their current relative place at the end)
    const fam = tree.families[d.familyId];
    const full = [...order, ...orderedChildren(tree, fam).map((c) => c.id).filter((id) => !order.includes(id))];
    commitWithToast('Reordered siblings', (dr) => reorderChildren(dr, d.familyId, full), 'Sibling order saved');
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      else {
        const [p] = [...pointers.current.values()];
        gesture.current = { type: 'pan', lastX: p.x, lastY: p.y, moved: true };
      }
      return;
    }
    gesture.current = null;
    if (dragRef.current) {
      finishDrag(true);
      return;
    }
    if (g?.type === 'tile' && !g.moved) {
      if (isTouch.current && selectedId !== g.id) {
        select(g.id);
        setHoverId(g.id);
      } else openProfile(g.id);
    } else if (g?.type === 'pan' && !g.moved) {
      select(undefined);
      setAddForm(null);
      setHoverId(null);
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        gesture.current = null;
        finishDrag(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // ----- hover
  const onTileEnter = (id: string) => {
    if (isTouch.current || dragRef.current) return;
    clearTimeout(hoverTimer.current);
    setHoverId(id);
  };
  const onTileLeave = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverId(null), 220);
  };
  const keepHover = () => clearTimeout(hoverTimer.current);

  // ----- derived
  const nowYear = new Date().getFullYear();
  const aliveIn = (id: string, y: number) => {
    const p = tree.people[id];
    const b = birthYear(p);
    if (b === undefined) return false;
    const d = deathYear(p) ?? (isLiving(p) ? nowYear : b + 80);
    return b <= y && d >= y;
  };

  const activeId = addForm?.anchorId ?? (drag ? null : hoverId ?? selectedId ?? null);
  const activeNode = activeId ? layout.nodes.get(activeId) : undefined;

  const worldStyle: React.CSSProperties = {
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`,
    transformOrigin: '0 0',
  };

  // drop marker position
  let marker: { x: number; y: number } | null = null;
  if (drag) {
    const others = drag.blocks.filter((b) => b.id !== drag.id);
    const n = layout.nodes.get(drag.id)!;
    let x: number;
    if (drag.insertAt === 0) x = others[0].left - 14;
    else if (drag.insertAt >= others.length) x = others[others.length - 1].right + 14;
    else x = (others[drag.insertAt - 1].right + others[drag.insertAt].left) / 2;
    marker = { x, y: n.y };
  }

  const { minX, maxX, maxY } = layout.bounds;
  const svgPad = 40;

  return (
    <div
      ref={vpRef}
      className="absolute inset-0 overflow-hidden touch-none bg-bg"
      style={{ cursor: gesture.current?.type === 'pan' ? 'grabbing' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="tree-canvas"
      aria-label="Family tree. Use arrow keys to move between people, Enter to open a profile."
      role="application"
    >
      <div className="absolute left-0 top-0" style={worldStyle}>
        <svg
          className="absolute overflow-visible pointer-events-none"
          style={{ left: minX - svgPad, top: -svgPad }}
          width={maxX - minX + svgPad * 2}
          height={maxY + svgPad * 2}
          viewBox={`${minX - svgPad} ${-svgPad} ${maxX - minX + svgPad * 2} ${maxY + svgPad * 2}`}
          aria-hidden
        >
          <Lines layout={layout} highlightFamilies={highlightFamilies} />
        </svg>
        {[...layout.nodes.values()].map((n) => {
          const p = tree.people[n.id];
          if (!p) return null;
          const isDragged = drag?.id === n.id;
          return (
            <div key={n.id} onPointerEnter={() => onTileEnter(n.id)} onPointerLeave={onTileLeave}>
              <Tile
                person={p}
                node={n}
                detail={detail}
                selected={selectedId === n.id}
                highlighted={highlightSet.has(n.id)}
                dimmed={timeYear !== null ? !aliveIn(n.id, timeYear) : highlight.length > 0 && !highlightSet.has(n.id)}
                isFocus={focusId === n.id}
                isHome={tree.homeId === n.id}
                hasIssue={issues.has(n.id)}
                privacy={publicView}
                dragging={isDragged}
                dragDx={isDragged ? drag!.dx : 0}
              />
            </div>
          );
        })}
        {marker && (
          <div className="absolute rounded-full bg-accent pointer-events-none" style={{ left: marker.x - 3, top: marker.y - 8, width: 6, height: TILE_H + 16 }} />
        )}
      </div>

      {activeNode && !drag && (
        <HoverButtons
          id={activeNode.id}
          rect={{
            left: t.x + (activeNode.x - TILE_W / 2) * t.k,
            top: t.y + activeNode.y * t.k,
            width: TILE_W * t.k,
            height: TILE_H * t.k,
          }}
          k={t.k}
          onEnter={keepHover}
          onLeave={onTileLeave}
          onAdd={(rel, x, y) => {
            const rect = vpRef.current!.getBoundingClientRect();
            setAddForm({ anchorId: activeNode.id, rel, x: x + rect.left, y: y + rect.top } as AddFormState);
          }}
          collapsedUp={!!useStore.getState().collapsedUp[activeNode.id]}
          collapsedDown={!!useStore.getState().collapsedDown[activeNode.id]}
          onFold={(dir) => toggleCollapse(activeNode.id, dir)}
        />
      )}

      <Controls
        onZoom={(f) => zoomAt(size.w / 2, size.h / 2, f)}
        onFit={() => fit()}
        onHome={() => tree.homeId && focus(tree.homeId)}
      />
      <Minimap layout={layout} t={t} size={size} onJump={(wx, wy) => animateTo({ k: t.k, x: size.w / 2 - wx * t.k, y: size.h / 2 - wy * t.k }, 200)} />
      {drag && (
        <div data-ui className="absolute top-3 left-1/2 -translate-x-1/2 card px-3 py-2 text-sm text-muted no-print">
          Drop to reorder {displayName(tree.people[drag.id])} · Esc cancels
        </div>
      )}
    </div>
  );
}

function Lines({ layout, highlightFamilies }: { layout: Layout; highlightFamilies: Set<string> }) {
  const stroke = (fid: string) => (highlightFamilies.has(fid) ? 'rgb(var(--warn))' : 'rgb(var(--canvas-line))');
  const width = (fid: string) => (highlightFamilies.has(fid) ? 3.5 : 2);
  const horiz = layout.segments.filter((s) => s.kind === 'couple' || s.kind === 'bar');
  const vert = layout.segments.filter((s) => s.kind === 'drop' || s.kind === 'child');
  return (
    <g fill="none" strokeLinecap="round">
      {horiz.map((s, i) => (
        <line
          key={'h' + i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={stroke(s.familyId)}
          strokeWidth={s.kind === 'couple' ? width(s.familyId) + 0.5 : width(s.familyId)}
          strokeDasharray={s.dashed ? '6 5' : undefined}
        />
      ))}
      {layout.crossings.map((c, i) => (
        <line key={'c' + i} x1={c.x - 6} y1={c.y} x2={c.x + 6} y2={c.y} stroke="rgb(var(--bg))" strokeWidth={6} strokeLinecap="butt" />
      ))}
      {vert.map((s, i) => (
        <line
          key={'v' + i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={stroke(s.familyId)}
          strokeWidth={width(s.familyId)}
          strokeDasharray={s.dashed ? '5 5' : undefined}
        />
      ))}
    </g>
  );
}

function HoverButtons({
  id,
  rect,
  k,
  onAdd,
  onEnter,
  onLeave,
  onFold,
  collapsedUp,
  collapsedDown,
}: {
  id: string;
  rect: { left: number; top: number; width: number; height: number };
  k: number;
  onAdd: (rel: AddFormState['rel'], x: number, y: number) => void;
  onEnter: () => void;
  onLeave: () => void;
  onFold: (dir: 'up' | 'down') => void;
  collapsedUp: boolean;
  collapsedDown: boolean;
}) {
  const tree = useStore((s) => s.tree)!;
  const hasUp = useMemo(() => countAncestors(tree, id) > 0, [tree, id]);
  const hasDown = useMemo(() => countDescendants(tree, id) > 0, [tree, id]);
  const B = 40;
  const gap = 8;
  const photoY = rect.top + Math.min(rect.height * 0.28, 52 * k);
  const btn = (rel: AddFormState['rel'], label: string, x: number, y: number, testId: string) => (
    <button
      data-ui
      data-testid={testId}
      className="absolute flex items-center gap-1 h-10 px-3 rounded-full bg-accent text-accent-ink shadow-lift text-[13px] font-semibold hover:brightness-110 whitespace-nowrap"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        onAdd(rel, r.left - parent.left + r.width / 2, r.top - parent.top + r.height / 2);
      }}
      aria-label={`Add ${label.replace('+ ', '').toLowerCase()}`}
    >
      <Plus size={16} aria-hidden />
      {label.replace('+ ', '')}
    </button>
  );
  const cx = rect.left + rect.width / 2;
  return (
    <div className="absolute inset-0 pointer-events-none no-print" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className="pointer-events-auto">
        {btn('parent', '+ Parent', cx, rect.top - gap - B / 2, 'add-parent')}
        {btn('child', '+ Child', cx, rect.top + rect.height + gap + B / 2, 'add-child')}
        {btn('sibling', '+ Sibling', rect.left - gap - 44, photoY, 'add-sibling')}
        {btn('spouse', '+ Spouse', rect.left + rect.width + gap + 44, photoY, 'add-spouse')}
        {hasUp && (
          <button
            data-ui
            className="absolute w-7 h-7 rounded-full bg-surface border border-line shadow-soft flex items-center justify-center text-muted hover:text-ink"
            style={{ left: rect.left - 10, top: rect.top - 10 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onFold('up')}
            aria-label={collapsedUp ? 'Show ancestors' : 'Hide ancestors'}
            title={collapsedUp ? 'Show ancestors' : 'Hide ancestors'}
          >
            {collapsedUp ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        )}
        {hasDown && (
          <button
            data-ui
            className="absolute w-7 h-7 rounded-full bg-surface border border-line shadow-soft flex items-center justify-center text-muted hover:text-ink"
            style={{ left: rect.left + rect.width - 18, top: rect.top + rect.height - 18 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onFold('down')}
            aria-label={collapsedDown ? 'Show descendants' : 'Hide descendants'}
            title={collapsedDown ? 'Show descendants' : 'Hide descendants'}
          >
            {collapsedDown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Controls({ onZoom, onFit, onHome }: { onZoom: (f: number) => void; onFit: () => void; onHome: () => void }) {
  return (
    <div data-ui className="absolute left-3 bottom-3 card flex flex-col p-1 no-print pb-[max(0.25rem,env(safe-area-inset-bottom))]" onPointerDown={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => onZoom(1.25)} aria-label="Zoom in" title="Zoom in">
        <Plus size={18} />
      </button>
      <button className="icon-btn" onClick={() => onZoom(0.8)} aria-label="Zoom out" title="Zoom out">
        <Minus size={18} />
      </button>
      <button className="icon-btn" onClick={onFit} aria-label="Fit to screen" title="Fit to screen" data-testid="fit">
        <Maximize2 size={17} />
      </button>
      <button className="icon-btn" onClick={onHome} aria-label="Go to home person" title="Home person">
        <Home size={17} />
      </button>
    </div>
  );
}

function Minimap({ layout, t, size, onJump }: { layout: Layout; t: Transform; size: { w: number; h: number }; onJump: (x: number, y: number) => void }) {
  const W = 168;
  const H = 108;
  const { minX, maxX, maxY } = layout.bounds;
  const bw = maxX - minX || 1;
  const bh = maxY || 1;
  const s = Math.min(W / bw, H / bh) * 0.92;
  const ox = (W - bw * s) / 2 - minX * s;
  const oy = (H - bh * s) / 2;
  const vx = (-t.x / t.k) * s + ox;
  const vy = (-t.y / t.k) * s + oy;
  const vw = (size.w / t.k) * s;
  const vh = (size.h / t.k) * s;
  const ref = useRef<SVGSVGElement>(null);
  const jump = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onJump((e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s);
  };
  if (layout.nodes.size < 4) return null;
  return (
    <div data-ui className="absolute right-3 bottom-3 card p-1 hidden sm:block no-print" onPointerDown={(e) => e.stopPropagation()}>
      <svg
        ref={ref}
        width={W}
        height={H}
        className="cursor-pointer"
        role="img"
        aria-label="Minimap"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => e.buttons && jump(e)}
      >
        {[...layout.nodes.values()].map((n) => (
          <rect key={n.id} x={(n.x - TILE_W / 2) * s + ox} y={n.y * s + oy} width={Math.max(2, TILE_W * s)} height={Math.max(2, TILE_H * s)} rx={1} fill="rgb(var(--muted) / 0.45)" />
        ))}
        <rect x={vx} y={vy} width={vw} height={vh} fill="rgb(var(--accent) / 0.08)" stroke="rgb(var(--accent))" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  );
}
