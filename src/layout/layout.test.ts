import { TB } from '../test/helpers';
import { buildDemoTree } from '../demo/demo';
import type { TreeData } from '../model/types';
import { computeLayout, TILE_W, type Layout, type ViewMode } from './layout';

function assertNoOverlap(layout: Layout) {
  const byRow = new Map<number, number[]>();
  for (const n of layout.nodes.values()) {
    const arr = byRow.get(n.row) ?? [];
    arr.push(n.x);
    byRow.set(n.row, arr);
  }
  for (const [row, xs] of byRow) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `row ${row}`).toBeGreaterThanOrEqual(TILE_W);
  }
}

function assertParentsAbove(tree: TreeData, layout: Layout) {
  for (const f of Object.values(tree.families)) {
    for (const p of f.partners) {
      const pn = layout.nodes.get(p);
      if (!pn) continue;
      for (const c of f.children) {
        const cn = layout.nodes.get(c.id);
        if (cn) expect(cn.y, `${c.id} below ${p}`).toBeGreaterThan(pn.y);
      }
    }
  }
}

function inLawTree() {
  const t = new TB();
  t.p('dad', 'male', '1940');
  t.p('mum', 'female', '1942');
  t.p('bro', 'male', '1965');
  t.p('me', 'male', '1968');
  t.p('sis', 'female', '1970');
  t.p('wife', 'female', '1969');
  t.p('wdad', 'male', '1938');
  t.p('wmum', 'female', '1940');
  t.p('wsis', 'female', '1972');
  t.p('kid', 'female', '1995');
  t.fam('G', ['dad', 'mum'], ['bro', 'me', 'sis']);
  t.fam('W', ['wdad', 'wmum'], ['wife', 'wsis']);
  t.fam('M', ['me', 'wife'], ['kid']);
  return t.tree;
}

describe('layout invariants', () => {
  const views: ViewMode[] = ['family', 'ancestors', 'descendants'];

  it.each(views)('demo tree, %s view: no overlaps, parents above children', (view) => {
    const tree = buildDemoTree();
    for (const focusId of Object.keys(tree.people).slice(0, 25)) {
      const layout = computeLayout(tree, { view, focusId });
      assertNoOverlap(layout);
      assertParentsAbove(tree, layout);
    }
  });

  it('family view shows everyone connected', () => {
    const tree = buildDemoTree();
    const focus = tree.homeId!;
    const layout = computeLayout(tree, { view: 'family', focusId: focus });
    expect(layout.nodes.size).toBe(Object.keys(tree.people).length);
  });

  it('puts in-law parents beside the couple, never above another family’s children', () => {
    const tree = inLawTree();
    const cases: [string, string[], string[], string][] = [
      // focus, in-law parents, other family's children, existing couple member
      ['me', ['wdad', 'wmum'], ['bro', 'me', 'sis'], 'dad'],
      ['kid', ['wdad', 'wmum'], ['bro', 'me', 'sis'], 'dad'],
      ['bro', ['wdad', 'wmum'], ['bro', 'me', 'sis'], 'dad'],
      ['wife', ['dad', 'mum'], ['wife', 'wsis'], 'wdad'],
    ];
    for (const [focusId, inLaws, otherKids, couple] of cases) {
      const layout = computeLayout(tree, { view: 'family', focusId });
      assertNoOverlap(layout);
      assertParentsAbove(tree, layout);
      const kids = otherKids.map((id) => layout.nodes.get(id)!.x);
      const spanL = Math.min(...kids) - TILE_W / 2;
      const spanR = Math.max(...kids) + TILE_W / 2;
      for (const id of inLaws) {
        const n = layout.nodes.get(id)!;
        const l = n.x - TILE_W / 2;
        const r = n.x + TILE_W / 2;
        expect(r <= spanL || l >= spanR, `${id} (focus ${focusId}) above another family's children`).toBe(true);
        // the in-law parents sit on the same row as the existing couple
        expect(n.y).toBe(layout.nodes.get(couple)!.y);
      }
    }
  });

  it('respects a manual sibling order', () => {
    const t = new TB();
    t.p('p', 'male');
    t.p('a', 'male', '1900');
    t.p('b', 'male', '1901');
    t.p('c', 'male', '1902');
    t.fam('F', ['p'], ['c', 'a', 'b'], 'married', true);
    const layout = computeLayout(t.tree, { view: 'family', focusId: 'p' });
    const order = ['a', 'b', 'c'].sort((x, y) => layout.nodes.get(x)!.x - layout.nodes.get(y)!.x);
    expect(order).toEqual(['c', 'a', 'b']);
    t.tree.families.F.manualOrder = false;
    const l2 = computeLayout(t.tree, { view: 'family', focusId: 'p' });
    expect(['a', 'b', 'c'].sort((x, y) => l2.nodes.get(x)!.x - l2.nodes.get(y)!.x)).toEqual(['a', 'b', 'c']);
  });

  it('keeps partners side by side', () => {
    const layout = computeLayout(inLawTree(), { view: 'family', focusId: 'me' });
    const me = layout.nodes.get('me')!;
    const wife = layout.nodes.get('wife')!;
    expect(me.y).toBe(wife.y);
    expect(Math.abs(me.x - wife.x)).toBeLessThan(TILE_W * 1.5);
  });

  it('puts overlapping sibling bars on separate tracks and marks crossings', () => {
    const layout = computeLayout(inLawTree(), { view: 'family', focusId: 'me' });
    const bars = layout.segments.filter((s) => s.kind === 'bar');
    // bars in the same gap that overlap must have different y
    for (let i = 0; i < bars.length; i++)
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i];
        const b = bars[j];
        const overlap = a.x1 < b.x2 && b.x1 < a.x2;
        const sameGap = Math.abs(a.y1 - b.y1) < 80;
        if (overlap && sameGap) expect(a.y1).not.toBe(b.y1);
      }
    // wife's parents' line drops across the G sibling bar → a crossing gap
    expect(layout.crossings.length).toBeGreaterThan(0);
  });

  it('collapses ancestors and descendants with hidden counts', () => {
    const tree = inLawTree();
    const layout = computeLayout(tree, { view: 'family', focusId: 'me', collapsedUp: new Set(['me', 'wife']), collapsedDown: new Set(['me']) });
    expect(layout.nodes.has('dad')).toBe(false);
    expect(layout.nodes.has('kid')).toBe(false);
    expect(layout.nodes.get('me')!.hiddenUp).toBeGreaterThan(0);
    expect(layout.nodes.get('me')!.hiddenDown).toBe(1);
  });

  it('ancestors view is a pedigree', () => {
    const layout = computeLayout(inLawTree(), { view: 'ancestors', focusId: 'kid' });
    expect([...layout.nodes.keys()].sort()).toEqual(['dad', 'kid', 'me', 'mum', 'wdad', 'wife', 'wmum'].sort());
  });

  it('is fast enough for a big tree', () => {
    const t = new TB();
    // 6 generations, 3 kids each, each with a married-in spouse with parents
    let gen = [t.p('root', 'male')];
    let n = 0;
    for (let g = 0; g < 6; g++) {
      const next: string[] = [];
      for (const p of gen) {
        const s = t.p(`s${n++}`, 'female');
        if (g > 0) {
          const sp = t.p(`sp${n++}`, 'male');
          t.fam(`sf${n++}`, [sp], [s]);
        }
        const kids = [0, 1, 2].map(() => t.p(`k${n++}`, 'male'));
        t.fam(`f${n++}`, [p, s], kids);
        next.push(...kids);
      }
      gen = next.slice(0, 150);
    }
    const start = performance.now();
    const layout = computeLayout(t.tree, { view: 'family', focusId: gen[0] });
    const ms = performance.now() - start;
    expect(layout.nodes.size).toBeGreaterThan(500);
    assertNoOverlap(layout);
    expect(ms).toBeLessThan(3000);
  });
});
