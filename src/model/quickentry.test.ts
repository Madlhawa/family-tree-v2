import { produce } from 'immer';
import { childrenOf, parentsOf, partnersOf, siblingsOf } from './graph';
import { birthOf, emptyTree, fullName } from './people';
import { applyQuickEntry, parseEntry, parseQuickEntry } from './quickentry';
import { computeStats, onThisDay } from './stats';
import { buildDemoTree } from '../demo/demo';

describe('quick entry', () => {
  it('parses entries forgivingly', () => {
    expect(parseEntry('Rose (F, 1905)')).toMatchObject({ given: 'Rose', sex: 'female', born: '1905' });
    expect(parseEntry('John Smith (M, 1870–1940, blacksmith)')).toMatchObject({ given: 'John', surname: 'Smith', born: '1870', died: '1940', occupation: 'blacksmith' });
    expect(parseEntry('Ann Mary Lee (b. c. 1850, d. 12 Mar 1902)')).toMatchObject({ given: 'Ann Mary', surname: 'Lee', born: 'c. 1850', died: '12 Mar 1902' });
  });

  it('builds a family', () => {
    const plan = parseQuickEntry(`John Smith (M, 1870)
spouse: Mary Jones (F, 1875)
children: Tom (1903), Rose (F, 1905)
parents: William (1840), Ann Brown (1845)
sister: Jane`);
    expect(plan.errors).toEqual([]);
    expect(plan.relatives).toHaveLength(6);
    let id = '';
    const tree = produce(emptyTree(), (d) => {
      id = applyQuickEntry(d, plan);
    });
    expect(fullName(tree.people[id])).toBe('John Smith');
    expect(partnersOf(tree, id).map((p) => fullName(p.person))).toEqual(['Mary Jones']);
    const kids = childrenOf(tree, id).map((c) => fullName(c.person));
    expect(kids).toEqual(['Tom Smith', 'Rose Smith']);
    expect(parentsOf(tree, kids.length ? childrenOf(tree, id)[0].person.id : '').length).toBe(2);
    expect(parentsOf(tree, id).map((p) => fullName(p.person)).sort()).toEqual(['Ann Brown', 'William Smith']);
    expect(siblingsOf(tree, id).map((s) => fullName(s.person))).toEqual(['Jane Smith']);
    expect(birthOf(tree.people[id])?.date).toBe('1870');
  });

  it('reports unknown keys', () => {
    expect(parseQuickEntry('cousin: Bob').errors[0]).toMatch(/cousin/);
  });
});

describe('statistics', () => {
  it('computes basics for the demo', () => {
    const tree = buildDemoTree();
    const s = computeStats(tree);
    expect(s.people).toBe(Object.keys(tree.people).length);
    expect(s.earliest?.year).toBe(1895);
    expect(s.completeness[0]).toEqual({ generation: 1, found: 2, possible: 2 });
    expect(s.longest[0].years).toBeGreaterThan(80);
  });
  it('finds on-this-day entries', () => {
    const tree = buildDemoTree();
    const e = onThisDay(tree, 3, 17);
    expect(e.some((x) => x.personIds.includes('emma') && x.kind === 'birthday')).toBe(true);
    expect(onThisDay(tree, 4, 10, 5).some((x) => x.kind === 'anniversary')).toBe(true);
  });
});
