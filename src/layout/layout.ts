/**
 * Family-graph layout.
 *
 *  1. Positions: people are placed on integer rows (generations) with an x centre.
 *     - Descendant subtrees are built bottom-up and packed with contours (tidy tree).
 *     - Partners sit side by side in a block.
 *     - In the Family view the main tree grows down from the focus person's top
 *       paternal-line ancestor; everyone else (other parents' lines, in-laws) is
 *       "hung" next to the person they connect to, using a free-slot search that also
 *       keeps in-law parents from sitting directly above another family's children.
 *  2. Rows get y positions; the gap between rows grows with the number of line tracks.
 *  3. Connectors: couple lines, descent bars (on separate tracks when they would overlap)
 *     and crossing points (drawn as small gaps so a crossing never looks like a join).
 */
import { childrenOf, countAncestors, countDescendants, orderedChildren, parentFamiliesOf, partnerFamiliesOf, primaryParentFamily } from '../model/graph';
import type { ChildKind, Family, FamilyStatus, TreeData } from '../model/types';

export const TILE_W = 148;
export const TILE_H = 184;
export const PHOTO_Y = 52; // y of the couple line, level with the photo centre
const PARTNER_GAP = 24;
const SIB_GAP = 28;
const FAMILY_GAP = 44;
const SUBTREE_GAP = 36;
const ROW_GAP = 88;
const TRACK_SPACING = 14;

export type ViewMode = 'family' | 'ancestors' | 'descendants';

export interface LayoutOptions {
  view: ViewMode;
  focusId: string;
  collapsedUp?: Set<string>;
  collapsedDown?: Set<string>;
}

export interface LayoutNode {
  id: string;
  /** centre x */
  x: number;
  /** top y */
  y: number;
  row: number;
  /** family whose descent line this person hangs from */
  underFamily?: string;
  /** block (person + partners) this node belongs to */
  block: string;
  hiddenUp?: number;
  hiddenDown?: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  familyId: string;
  kind: 'couple' | 'drop' | 'bar' | 'child';
  dashed?: boolean;
  status?: FamilyStatus;
  childKind?: ChildKind;
}

export interface Crossing {
  x: number;
  y: number;
}

export interface Layout {
  nodes: Map<string, LayoutNode>;
  segments: Segment[];
  crossings: Crossing[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** child-span per family, for drag & drop */
  blocks: Map<string, { left: number; right: number; row: number; members: string[] }>;
  rowsY: Map<number, number>;
}

// ---------------------------------------------------------------------------
// Shapes (relative positioned groups with a per-row contour)

interface Item {
  id: string;
  x: number;
  row: number;
  underFamily?: string;
  block: string;
}

interface Shape {
  items: Item[];
  rows: Map<number, [number, number]>;
  /** drop points per family: x of where the family's children hang from */
  drops: Map<string, number>;
  blocks: Map<string, { left: number; right: number; row: number; members: string[] }>;
}

const emptyShape = (): Shape => ({ items: [], rows: new Map(), drops: new Map(), blocks: new Map() });

function shiftShape(s: Shape, dx: number, drow = 0) {
  if (dx === 0 && drow === 0) return;
  for (const it of s.items) {
    it.x += dx;
    it.row += drow;
  }
  const rows = new Map<number, [number, number]>();
  for (const [r, [l, rt]] of s.rows) rows.set(r + drow, [l + dx, rt + dx]);
  s.rows = rows;
  for (const [k, v] of s.drops) s.drops.set(k, v + dx);
  for (const b of s.blocks.values()) {
    b.left += dx;
    b.right += dx;
    b.row += drow;
  }
}

function mergeInto(a: Shape, b: Shape) {
  a.items.push(...b.items);
  for (const [r, [l, rt]] of b.rows) {
    const cur = a.rows.get(r);
    a.rows.set(r, cur ? [Math.min(cur[0], l), Math.max(cur[1], rt)] : [l, rt]);
  }
  for (const [k, v] of b.drops) a.drops.set(k, v);
  for (const [k, v] of b.blocks) a.blocks.set(k, v);
}

/** Minimal dx so that b (shifted by dx) sits right of a. */
function separation(a: Shape, b: Shape, gap: number): number {
  let need = -Infinity;
  for (const [r, [, ar]] of a.rows) {
    const br = b.rows.get(r);
    if (!br) continue;
    need = Math.max(need, ar - br[0] + gap);
  }
  return need;
}

function addRow(s: Shape, row: number, l: number, r: number) {
  const cur = s.rows.get(row);
  s.rows.set(row, cur ? [Math.min(cur[0], l), Math.max(cur[1], r)] : [l, r]);
}

// ---------------------------------------------------------------------------

class Builder {
  placed = new Set<string>();
  hiddenUp = new Map<string, number>();
  hiddenDown = new Map<string, number>();
  constructor(
    public tree: TreeData,
    public opts: LayoutOptions,
  ) {}

  collapsedUp(id: string) {
    return this.opts.collapsedUp?.has(id) ?? false;
  }
  collapsedDown(id: string) {
    return this.opts.collapsedDown?.has(id) ?? false;
  }

  /**
   * Descendant shape rooted at `pid` (pid at x=0,row=0). Partners join pid's block;
   * a partner's other partners join on the far side.
   */
  desc(pid: string, underFamily?: string): Shape {
    const tree = this.tree;
    const shape = emptyShape();
    this.placed.add(pid);
    const me = tree.people[pid];
    const fams = partnerFamiliesOf(tree, pid);

    // ----- block members
    type Member = { id: string; fam?: Family };
    const right: Member[] = [];
    const left: Member[] = [];
    const famDropOwner: { fam: Family; a: string; b?: string }[] = [];
    let toggle = me?.sex !== 'female';
    for (const f of fams) {
      const other = f.partners.find((x) => x !== pid);
      if (other && !this.placed.has(other) && tree.people[other]) {
        this.placed.add(other);
        const side = toggle ? right : left;
        side.push({ id: other, fam: f });
        famDropOwner.push({ fam: f, a: pid, b: other });
        // partner's other partnerships
        for (const of of partnerFamiliesOf(tree, other)) {
          if (of.id === f.id) continue;
          const third = of.partners.find((x) => x !== other);
          if (third && !this.placed.has(third) && tree.people[third]) {
            this.placed.add(third);
            side.push({ id: third, fam: of });
            famDropOwner.push({ fam: of, a: other, b: third });
          } else if (!third || this.placed.has(third)) {
            famDropOwner.push({ fam: of, a: other });
          }
        }
        toggle = !toggle;
      } else {
        famDropOwner.push({ fam: f, a: pid, b: other && tree.people[other] ? other : undefined });
      }
    }
    const members = [...left.reverse().map((m) => m.id), pid, ...right.map((m) => m.id)];
    const meIdx = left.length;
    const pos = new Map<string, number>();
    members.forEach((id, i) => pos.set(id, (i - meIdx) * (TILE_W + PARTNER_GAP)));
    for (const id of members) shape.items.push({ id, x: pos.get(id)!, row: 0, block: pid, underFamily: id === pid ? underFamily : undefined });
    const blockL = Math.min(...pos.values()) - TILE_W / 2;
    const blockR = Math.max(...pos.values()) + TILE_W / 2;
    addRow(shape, 0, blockL, blockR);
    shape.blocks.set(pid, { left: blockL, right: blockR, row: 0, members });

    // ----- children
    if (this.collapsedDown(pid)) {
      const n = countDescendants(tree, pid);
      if (n) this.hiddenDown.set(pid, n);
      return shape;
    }
    const groups: { fam: Family; drop: number; subs: Shape[] }[] = [];
    for (const { fam, a, b } of famDropOwner) {
      const ax = pos.get(a);
      const bx = b !== undefined ? pos.get(b) : undefined;
      if (ax === undefined) continue;
      const drop = bx !== undefined ? (ax + bx) / 2 : ax;
      shape.drops.set(fam.id, drop);
      const subs: Shape[] = [];
      for (const c of orderedChildren(tree, fam)) {
        if (this.placed.has(c.id) || !tree.people[c.id]) continue;
        // A child shown under a partner who is not the block root but whose own block would
        // otherwise make a cycle – fine, `desc` handles placement marks.
        subs.push(this.desc(c.id, fam.id));
      }
      if (subs.length) groups.push({ fam, drop, subs });
    }
    if (!groups.length) return shape;

    // pack all children left → right
    const kids = emptyShape();
    const groupSpans: { drop: number; l: number; r: number }[] = [];
    groups.forEach((g, gi) => {
      let first: number | undefined;
      let last = 0;
      g.subs.forEach((s, si) => {
        if (kids.items.length) {
          const gap = si === 0 && gi > 0 ? FAMILY_GAP : SIB_GAP;
          const dx = separation(kids, s, gap);
          shiftShape(s, Number.isFinite(dx) ? dx : 0);
        }
        // the root of s is the first item
        const rootX = s.items[0].x;
        first ??= rootX;
        last = rootX;
        mergeInto(kids, s);
      });
      groupSpans.push({ drop: g.drop, l: first!, r: last });
    });
    // centre: average offset between each family's children midpoint and its drop point
    let sum = 0;
    for (const g of groupSpans) sum += g.drop - (g.l + g.r) / 2;
    let dx = sum / groupSpans.length;
    shiftShape(kids, dx, 1);
    // make sure kids don't need to move — parents block only occupies row 0 so no overlap
    mergeInto(shape, kids);
    dx = 0;
    return shape;
  }

  /** Pedigree shape (Ancestors view): pid at x=0,row=0, parents above. */
  pedigree(pid: string): Shape {
    const tree = this.tree;
    const shape = emptyShape();
    this.placed.add(pid);
    shape.items.push({ id: pid, x: 0, row: 0, block: pid });
    addRow(shape, 0, -TILE_W / 2, TILE_W / 2);
    shape.blocks.set(pid, { left: -TILE_W / 2, right: TILE_W / 2, row: 0, members: [pid] });
    const fam = primaryParentFamily(tree, pid);
    if (!fam) return shape;
    if (this.collapsedUp(pid)) {
      const n = countAncestors(tree, pid);
      if (n) this.hiddenUp.set(pid, n);
      return shape;
    }
    const parents = [...fam.partners]
      .filter((x) => tree.people[x] && !this.placed.has(x))
      .sort((a, b) => sexRank(tree, a) - sexRank(tree, b));
    const subs = parents.map((p) => this.pedigree(p));
    const up = emptyShape();
    subs.forEach((s) => {
      // rows are negative going up: shift by -1
      shiftShape(s, 0, -1);
      if (up.items.length) {
        const dx = separation(up, s, PARTNER_GAP);
        shiftShape(s, Number.isFinite(dx) ? dx : 0);
      }
      mergeInto(up, s);
    });
    if (subs.length) {
      const xs = subs.map((s) => s.items[0].x);
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      shiftShape(up, -mid);
      mergeInto(shape, up);
      shape.drops.set(fam.id, 0);
    }
    return shape;
  }
}

function sexRank(tree: TreeData, id: string) {
  const s = tree.people[id]?.sex;
  return s === 'male' ? 0 : s === 'female' ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Occupancy for the free-slot search

class Occupancy {
  rows = new Map<number, [number, number][]>();
  add(row: number, l: number, r: number) {
    const arr = this.rows.get(row) ?? [];
    arr.push([l, r]);
    this.rows.set(row, arr);
  }
  addShape(s: Shape) {
    for (const it of s.items) this.add(it.row, it.x - TILE_W / 2, it.x + TILE_W / 2);
  }
}

/** Find the dx closest to `ideal` such that `shape` + dx collides with nothing. */
function freeOffset(
  shape: Shape,
  ideal: number,
  occ: Occupancy,
  extraForbidden: { row: number; l: number; r: number }[] = [],
): number {
  const forbidden: [number, number][] = [];
  const check = (row: number, l: number, r: number, gap: number) => {
    const sr = shape.rows.get(row);
    if (!sr) return;
    forbidden.push([l - gap - sr[1], r + gap - sr[0]]);
  };
  for (const [row, arr] of occ.rows) for (const [l, r] of arr) check(row, l, r, SUBTREE_GAP);
  for (const f of extraForbidden) check(f.row, f.l, f.r, SUBTREE_GAP / 2);
  if (!forbidden.length) return ideal;
  forbidden.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of forbidden) {
    const last = merged[merged.length - 1];
    if (last && iv[0] < last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  const hit = merged.find(([a, b]) => ideal > a && ideal < b);
  if (!hit) return ideal;
  return ideal - hit[0] <= hit[1] - ideal ? hit[0] : hit[1];
}

// ---------------------------------------------------------------------------

function bfsDistances(tree: TreeData, from: string): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    const fams = [...partnerFamiliesOf(tree, cur), ...parentFamiliesOf(tree, cur).map((l) => l.family)];
    for (const f of fams)
      for (const x of [...f.partners, ...f.children.map((c) => c.id)])
        if (!dist.has(x) && tree.people[x]) {
          dist.set(x, d + 1);
          q.push(x);
        }
  }
  return dist;
}

function familyLayout(b: Builder): Shape {
  const { tree, opts } = b;
  // Climb the focus's first (paternal-first) line to the apex.
  let apex = opts.focusId;
  const seen = new Set([apex]);
  for (;;) {
    if (b.collapsedUp(apex)) break;
    const fam = primaryParentFamily(tree, apex);
    if (!fam) break;
    const ps = fam.partners.filter((x) => tree.people[x]).sort((a, c) => sexRank(tree, a) - sexRank(tree, c));
    if (!ps.length || seen.has(ps[0])) break;
    apex = ps[0];
    seen.add(apex);
  }
  const main = b.desc(apex);
  const all = main;
  const occ = new Occupancy();
  occ.addShape(main);

  const dist = bfsDistances(tree, opts.focusId);
  const where = new Map(all.items.map((it) => [it.id, it]));
  const byDist = (x: Item, y: Item) => (dist.get(x.id) ?? 1e9) - (dist.get(y.id) ?? 1e9);
  let queue = [...all.items].sort(byDist);
  let qi = 0;

  const childSpans = (row: number, exceptFamily: string) => {
    const byFam = new Map<string, [number, number]>();
    for (const it of all.items) {
      if (it.row !== row || !it.underFamily || it.underFamily === exceptFamily) continue;
      const cur = byFam.get(it.underFamily);
      byFam.set(it.underFamily, cur ? [Math.min(cur[0], it.x), Math.max(cur[1], it.x)] : [it.x, it.x]);
    }
    return [...byFam.values()].map(([l, r]) => ({ row: row - 1, l: l - TILE_W / 2, r: r + TILE_W / 2 }));
  };

  const place = (shape: Shape, row: number, idealDx: number, avoid: { row: number; l: number; r: number }[] = []) => {
    shiftShape(shape, 0, row);
    const dx = freeOffset(shape, idealDx, occ, avoid);
    shiftShape(shape, dx);
    occ.addShape(shape);
    mergeInto(all, shape);
    for (const it of shape.items) where.set(it.id, it);
    queue = [...queue.slice(qi), ...shape.items].sort(byDist);
    qi = 0;
  };

  while (qi < queue.length) {
    const it = queue[qi++];
    const at = where.get(it.id)!;

    // 1) Parents not yet shown → hang them above, beside existing couples.
    if (!b.collapsedUp(it.id)) {
      for (const link of parentFamiliesOf(tree, it.id)) {
        const fam = link.family;
        const unplaced = fam.partners.filter((x) => tree.people[x] && !b.placed.has(x)).sort((a, c) => sexRank(tree, a) - sexRank(tree, c));
        if (!unplaced.length) continue;
        const shape = b.desc(unplaced[0]);
        const drop = shape.drops.get(fam.id) ?? 0;
        place(shape, at.row - 1, at.x - drop, childSpans(at.row, fam.id));
      }
    } else if (parentFamiliesOf(tree, it.id).length && !b.hiddenUp.has(it.id)) {
      const n = countAncestors(tree, it.id);
      if (n) b.hiddenUp.set(it.id, n);
    }
    // 2) Partners / children not yet shown (e.g. a partner's earlier spouse) → place beside.
    for (const fam of partnerFamiliesOf(tree, it.id)) {
      for (const pid of fam.partners) {
        if (pid === it.id || b.placed.has(pid) || !tree.people[pid]) continue;
        const shape = b.desc(pid);
        place(shape, at.row, at.x + TILE_W + PARTNER_GAP);
      }
      if (fam.partners.some((x) => b.collapsedDown(x))) continue;
      for (const c of orderedChildren(tree, fam)) {
        if (b.placed.has(c.id) || !tree.people[c.id]) continue;
        const shape = b.desc(c.id, fam.id);
        place(shape, at.row + 1, at.x);
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------

export function computeLayout(tree: TreeData, opts: LayoutOptions): Layout {
  const empty: Layout = {
    nodes: new Map(),
    segments: [],
    crossings: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    blocks: new Map(),
    rowsY: new Map(),
  };
  if (!tree.people[opts.focusId]) return empty;
  const b = new Builder(tree, opts);
  let shape: Shape;
  if (opts.view === 'ancestors') shape = b.pedigree(opts.focusId);
  else if (opts.view === 'descendants') {
    shape = b.desc(opts.focusId);
    if (primaryParentFamily(tree, opts.focusId)) {
      const n = countAncestors(tree, opts.focusId);
      if (n) b.hiddenUp.set(opts.focusId, n);
    }
  } else shape = familyLayout(b);

  // Normalise: focus at x=0, top row = 0
  const focus = shape.items.find((i) => i.id === opts.focusId)!;
  const minRow = Math.min(...shape.items.map((i) => i.row));
  shiftShape(shape, -focus.x, -minRow);

  // ---- connectors (in x / row space first)
  const where = new Map(shape.items.map((i) => [i.id, i]));
  interface Bar {
    fam: Family;
    gapRow: number; // gap below this row
    x0: number;
    x1: number;
    dropX: number;
    parentRow: number;
    parents: string[];
    kids: { id: string; kind: ChildKind }[];
    track: number;
  }
  const bars: Bar[] = [];
  const couples: { fam: Family; a: Item; b: Item }[] = [];
  for (const fam of Object.values(tree.families)) {
    const parents = fam.partners.map((p) => where.get(p)).filter((x): x is Item => !!x);
    if (parents.length === 2 && parents[0].row === parents[1].row) couples.push({ fam, a: parents[0], b: parents[1] });
    if (!parents.length) continue;
    const parentRow = Math.max(...parents.map((p) => p.row));
    // connect every drawn child below this family (birth, adoptive and step lines alike)
    const mine = fam.children
      .map((c) => ({ c, it: where.get(c.id) }))
      .filter((x) => x.it && x.it.row > parentRow);
    if (!mine.length) continue;
    let dropX: number;
    const sameRow = parents.filter((p) => p.row === parentRow);
    if (sameRow.length === 2) dropX = (sameRow[0].x + sameRow[1].x) / 2;
    else if (shape.drops.has(fam.id) && parents.length === 1) dropX = shape.drops.get(fam.id)!;
    else dropX = sameRow[0].x;
    const childRow = Math.min(...mine.map((k) => k.it!.row));
    const xs = mine.map((k) => k.it!.x);
    bars.push({
      fam,
      gapRow: childRow - 1,
      x0: Math.min(dropX, ...xs),
      x1: Math.max(dropX, ...xs),
      dropX,
      parentRow,
      parents: sameRow.map((p) => p.id),
      kids: mine.map((k) => ({ id: k.it!.id, kind: k.c.kind })),
      track: 0,
    });
  }

  // tracks per gap: greedy interval colouring
  const tracksPerGap = new Map<number, number>();
  const byGap = new Map<number, Bar[]>();
  for (const bar of bars) {
    const arr = byGap.get(bar.gapRow) ?? [];
    arr.push(bar);
    byGap.set(bar.gapRow, arr);
  }
  for (const [gap, arr] of byGap) {
    arr.sort((p, q) => p.x0 - q.x0 || p.x1 - q.x1);
    const ends: number[] = [];
    for (const bar of arr) {
      let t = ends.findIndex((e) => e + 12 < bar.x0);
      if (t < 0) {
        t = ends.length;
        ends.push(bar.x1);
      } else ends[t] = bar.x1;
      bar.track = t;
    }
    tracksPerGap.set(gap, ends.length);
  }

  // rows → y
  const maxRow = Math.max(...shape.items.map((i) => i.row));
  const rowsY = new Map<number, number>();
  const gapH = new Map<number, number>();
  let y = 0;
  for (let r = 0; r <= maxRow; r++) {
    rowsY.set(r, y);
    const tracks = tracksPerGap.get(r) ?? 1;
    const h = Math.max(ROW_GAP, (tracks + 1) * TRACK_SPACING + 24);
    gapH.set(r, h);
    y += TILE_H + h;
  }

  const nodes = new Map<string, LayoutNode>();
  for (const it of shape.items) {
    nodes.set(it.id, {
      id: it.id,
      x: it.x,
      y: rowsY.get(it.row)!,
      row: it.row,
      underFamily: it.underFamily,
      block: it.block,
      hiddenUp: b.hiddenUp.get(it.id),
      hiddenDown: b.hiddenDown.get(it.id),
    });
  }

  const segments: Segment[] = [];
  for (const c of couples) {
    const ya = rowsY.get(c.a.row)! + PHOTO_Y;
    const [l, r] = c.a.x < c.b.x ? [c.a, c.b] : [c.b, c.a];
    segments.push({
      x1: l.x + TILE_W / 2,
      y1: ya,
      x2: r.x - TILE_W / 2,
      y2: ya,
      familyId: c.fam.id,
      kind: 'couple',
      dashed: c.fam.status === 'divorced',
      status: c.fam.status,
    });
  }
  for (const bar of bars) {
    const tracks = tracksPerGap.get(bar.gapRow) ?? 1;
    const gapTop = rowsY.get(bar.gapRow)! + TILE_H;
    const barY = gapTop + (gapH.get(bar.gapRow)! * (bar.track + 1)) / (tracks + 1);
    const fromY = bar.parents.length === 2 ? rowsY.get(bar.parentRow)! + PHOTO_Y : rowsY.get(bar.parentRow)! + TILE_H;
    segments.push({ x1: bar.dropX, y1: fromY, x2: bar.dropX, y2: barY, familyId: bar.fam.id, kind: 'drop' });
    if (bar.x1 > bar.x0) segments.push({ x1: bar.x0, y1: barY, x2: bar.x1, y2: barY, familyId: bar.fam.id, kind: 'bar' });
    for (const k of bar.kids) {
      const n = nodes.get(k.id)!;
      segments.push({
        x1: n.x,
        y1: barY,
        x2: n.x,
        y2: n.y,
        familyId: bar.fam.id,
        kind: 'child',
        dashed: k.kind !== 'birth',
        childKind: k.kind,
      });
    }
  }

  // crossings: vertical segment through a horizontal bar of another family
  const crossings: Crossing[] = [];
  const horiz = segments.filter((s) => s.kind === 'bar');
  const vert = segments.filter((s) => s.kind === 'drop' || s.kind === 'child');
  for (const v of vert) {
    const y0 = Math.min(v.y1, v.y2);
    const y1 = Math.max(v.y1, v.y2);
    for (const h of horiz) {
      if (h.familyId === v.familyId) continue;
      if (v.x1 > h.x1 + 1 && v.x1 < h.x2 - 1 && h.y1 > y0 + 1 && h.y1 < y1 - 1) crossings.push({ x: v.x1, y: h.y1 });
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x - TILE_W / 2);
    maxX = Math.max(maxX, n.x + TILE_W / 2);
    maxY = Math.max(maxY, n.y + TILE_H);
  }
  const blocks = new Map<string, { left: number; right: number; row: number; members: string[] }>();
  for (const [k, v] of shape.blocks) blocks.set(k, v);
  return { nodes, segments, crossings, bounds: { minX, minY: 0, maxX, maxY }, blocks, rowsY };
}

/** Children of a family in left-to-right screen order (for drag & drop). */
export function siblingBlocks(layout: Layout, tree: TreeData, familyId: string) {
  const fam = tree.families[familyId];
  if (!fam) return [];
  const out: { id: string; left: number; right: number; x: number }[] = [];
  for (const c of fam.children) {
    const n = layout.nodes.get(c.id);
    if (!n || n.underFamily !== familyId) continue;
    const blk = layout.blocks.get(c.id);
    out.push({ id: c.id, left: blk?.left ?? n.x - TILE_W / 2, right: blk?.right ?? n.x + TILE_W / 2, x: n.x });
  }
  return out.sort((a, b) => a.x - b.x);
}

export { childrenOf };
