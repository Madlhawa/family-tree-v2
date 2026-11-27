import { produce } from 'immer';
import { TB } from '../test/helpers';
import { findDuplicates, runChecks } from './checks';
import { childrenOf, orderedChildren, parentsOf, siblingsOf } from './graph';
import { addRelative, deletePerson, mergePeople, parentPlan, reorderChildren, sortByBirth } from './ops';
import { newEvent } from './people';

describe('adding relatives', () => {
  it('adds a father first, then mother into the same family', () => {
    const t = new TB();
    t.p('me', 'female');
    expect(parentPlan(t.tree, 'me')).toMatchObject({ mode: 'new-family', defaultSex: 'male' });
    const t1 = produce(t.tree, (d) => void addRelative(d, 'me', 'parent', { given: 'Dad', sex: 'male' }));
    expect(parentPlan(t1, 'me')).toMatchObject({ mode: 'second-parent', defaultSex: 'female' });
    const t2 = produce(t1, (d) => void addRelative(d, 'me', 'parent', { given: 'Mum', sex: 'female' }));
    expect(parentsOf(t2, 'me').map((p) => p.person.given).sort()).toEqual(['Dad', 'Mum']);
    expect(Object.keys(t2.families)).toHaveLength(1);
    expect(parentPlan(t2, 'me').mode).toBe('extra-parent');
    let note: string | undefined;
    const t3 = produce(t2, (d) => {
      note = addRelative(d, 'me', 'parent', { given: 'Step', sex: 'male' }).note;
    });
    expect(note).toMatch(/step parent/);
    expect(parentsOf(t3, 'me', ['step']).map((p) => p.person.given)).toEqual(['Step']);
  });

  it("makes a new partner the other parent of a single parent's children", () => {
    const t = new TB();
    t.p('mum', 'female');
    t.p('kid');
    t.fam('F', ['mum'], ['kid']);
    const t1 = produce(t.tree, (d) => void addRelative(d, 'mum', 'spouse', { given: 'Dad', sex: 'male' }));
    expect(parentsOf(t1, 'kid')).toHaveLength(2);
    expect(Object.keys(t1.families)).toHaveLength(1);
  });

  it('connects siblings through an unknown-parent placeholder', () => {
    const t = new TB();
    t.p('me');
    let res: ReturnType<typeof addRelative> | undefined;
    const t1 = produce(t.tree, (d) => {
      res = addRelative(d, 'me', 'sibling', { given: 'Bro', sex: 'male' });
    });
    expect(res!.createdPlaceholderId).toBeTruthy();
    expect(t1.people[res!.createdPlaceholderId!].placeholder).toBe(true);
    expect(siblingsOf(t1, 'me').map((s) => s.person.given)).toEqual(['Bro']);
  });

  it('refuses to make a descendant a parent', () => {
    const t = new TB();
    t.p('a');
    t.p('b');
    t.fam('F', ['a'], ['b']);
    expect(() => produce(t.tree, (d) => void addRelative(d, 'a', 'parent', 'b'))).toThrow();
  });

  it('removes empty families when a person is deleted', () => {
    const t = new TB();
    t.p('a');
    t.p('b');
    t.fam('F', ['a', 'b']);
    const t1 = produce(t.tree, (d) => deletePerson(d, 'b'));
    expect(Object.keys(t1.families)).toHaveLength(0);
  });
});

describe('sibling order', () => {
  it('sorts by birth unless a manual order is saved', () => {
    const t = new TB();
    t.p('p');
    t.p('old', 'male', '1900');
    t.p('young', 'male', '1910');
    t.p('mid', 'male', '1905');
    t.fam('F', ['p'], ['young', 'old', 'mid']);
    expect(orderedChildren(t.tree, t.tree.families.F).map((c) => c.id)).toEqual(['old', 'mid', 'young']);
    const t1 = produce(t.tree, (d) => reorderChildren(d, 'F', ['young', 'old', 'mid']));
    expect(t1.families.F.manualOrder).toBe(true);
    expect(childrenOf(t1, 'p').map((c) => c.person.id)).toEqual(['young', 'old', 'mid']);
    const t2 = produce(t1, (d) => sortByBirth(d, 'F'));
    expect(childrenOf(t2, 'p').map((c) => c.person.id)).toEqual(['old', 'mid', 'young']);
  });
});

describe('merging', () => {
  it('unites two records and re-points families', () => {
    const t = new TB();
    t.p('John_Smith', 'male', '1900', { occupation: 'Baker' });
    t.p('Jon_Smith', 'unknown', 'c. 1900', { bio: 'Loved bread' });
    t.p('wife', 'female');
    t.p('kid');
    t.p('dad', 'male');
    t.fam('A', ['John_Smith', 'wife'], ['kid']);
    t.fam('B', ['Jon_Smith', 'wife'], ['kid']);
    t.fam('C', ['dad'], ['Jon_Smith']);
    const dup = findDuplicates(t.tree);
    expect(dup[0]).toMatchObject({ a: expect.any(String), b: expect.any(String) });
    expect([dup[0].a, dup[0].b].sort()).toEqual(['John_Smith', 'Jon_Smith']);

    const t1 = produce(t.tree, (d) => mergePeople(d, 'John_Smith', 'Jon_Smith'));
    expect(t1.people.Jon_Smith).toBeUndefined();
    const p = t1.people.John_Smith;
    expect(p.occupation).toBe('Baker');
    expect(p.bio).toBe('Loved bread');
    expect(p.sex).toBe('male');
    // conflicting birth records kept, second marked disputed
    const births = p.events.filter((e) => e.type === 'birth');
    expect(births).toHaveLength(2);
    expect(births.filter((e) => e.disputed)).toHaveLength(1);
    // families A and B collapsed into one with one child entry
    const fams = Object.values(t1.families).filter((f) => f.partners.includes('wife'));
    expect(fams).toHaveLength(1);
    expect(fams[0].children).toEqual([{ id: 'kid', kind: 'birth' }]);
    expect(parentsOf(t1, 'John_Smith').map((x) => x.person.id)).toEqual(['dad']);
  });

  it('lets the user choose which value wins', () => {
    const t = new TB();
    t.p('a', 'male', undefined, { occupation: 'Smith' });
    t.p('b', 'male', undefined, { occupation: 'Farmer' });
    const t1 = produce(t.tree, (d) => mergePeople(d, 'a', 'b', { occupation: 'drop' }));
    expect(t1.people.a.occupation).toBe('Farmer');
  });
});

describe('data checks', () => {
  it('flags impossible dates', () => {
    const t = new TB();
    t.p('mum', 'female', '1900', { events: [newEvent({ type: 'birth', date: '1900' }), newEvent({ type: 'death', date: '1920' })] });
    t.p('young', 'male', '1905');
    t.fam('F', ['mum'], ['young']);
    t.p('late', 'male', '1930');
    t.fam('G', ['mum'], ['late']);
    t.p('weird', 'male', undefined, { events: [newEvent({ type: 'birth', date: '1950' }), newEvent({ type: 'death', date: '1940' })] });
    t.p('bad', 'male', 'sometime');
    t.p('old', 'male', '1850', { living: 'living' });
    const codes = (id: string) => runChecks(t.tree, 2026).filter((i) => i.personId === id).map((i) => i.code);
    expect(codes('young')).toContain('parent-too-young');
    expect(codes('late')).toContain('born-after-parent-death');
    expect(codes('weird')).toContain('death-before-birth');
    expect(codes('bad')).toContain('bad-date');
    expect(codes('old')).toContain('too-old');
  });

  it('flags a person who is their own ancestor', () => {
    const t = new TB();
    t.p('a');
    t.p('b');
    t.fam('F', ['a'], ['b']);
    t.fam('G', ['b'], ['a']);
    expect(runChecks(t.tree).some((i) => i.code === 'own-ancestor')).toBe(true);
  });
});
