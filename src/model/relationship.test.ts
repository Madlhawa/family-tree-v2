import { TB } from '../test/helpers';
import { relationship } from './relationship';

function family() {
  const t = new TB();
  t.p('gg1', 'male');
  t.p('gg2', 'female');
  t.p('g1', 'male');
  t.p('g2', 'female');
  t.p('f', 'male');
  t.p('m', 'female');
  t.p('aunt', 'female');
  t.p('uncle', 'male');
  t.p('me', 'female');
  t.p('sis', 'female');
  t.p('half', 'male');
  t.p('cousin', 'male');
  t.p('cousinKid', 'female');
  t.p('kid', 'male');
  t.p('husband', 'male');
  t.p('mil', 'female');
  t.p('stepmum', 'female');
  t.p('stepbro', 'male');
  t.p('kidWife', 'female');
  t.p('sisHusband', 'male');
  t.fam('F0', ['gg1', 'gg2'], ['g1']);
  t.fam('F1', ['g1', 'g2'], ['f', 'aunt']);
  t.fam('F2', ['f', 'm'], ['me', 'sis']);
  t.fam('F2b', ['f', 'stepmum'], ['half']);
  t.fam('F2c', ['stepmum'], ['stepbro']);
  t.fam('F3', ['aunt', 'uncle'], ['cousin']);
  t.fam('F4', ['cousin'], ['cousinKid']);
  t.fam('F5', ['me', 'husband'], ['kid']);
  t.fam('F6', ['mil'], ['husband']);
  t.fam('F7', ['kid', 'kidWife']);
  t.fam('F8', ['sis', 'sisHusband']);
  return t.tree;
}

describe('relationship terms', () => {
  const tree = family();
  const term = (a: string, b: string) => relationship(tree, a, b).term;
  it.each([
    ['f', 'me', 'father'],
    ['me', 'f', 'daughter'],
    ['g1', 'me', 'grandfather'],
    ['gg1', 'me', 'great-grandfather'],
    ['me', 'gg2', 'great-granddaughter'],
    ['sis', 'me', 'sister'],
    ['half', 'me', 'half-brother'],
    ['aunt', 'me', 'aunt'],
    ['me', 'aunt', 'niece'],
    ['cousin', 'me', '1st cousin'],
    ['cousinKid', 'me', '1st cousin once removed'],
    ['me', 'cousinKid', '1st cousin once removed'],
    ['kid', 'cousinKid', '2nd cousin'],
    ['husband', 'me', 'husband'],
    ['me', 'husband', 'wife'],
    ['mil', 'me', 'mother-in-law'],
    ['me', 'mil', 'daughter-in-law'],
    ['sisHusband', 'me', 'brother-in-law'],
    ['me', 'sisHusband', 'sister-in-law'],
    ['stepmum', 'me', 'stepmother'],
    ['me', 'stepmum', 'stepdaughter'],
    ['stepbro', 'me', 'stepbrother'],
    ['kidWife', 'me', 'daughter-in-law'],
    ['uncle', 'me', 'uncle by marriage'],
    ['husband', 'kid', 'father'],
  ])('%s → %s = %s', (a, b, expected) => {
    expect(term(a, b)).toBe(expected);
  });

  it('handles twice removed and great-aunts', () => {
    const t = new TB();
    ['a', 'b', 'c', 'd', 'e', 'x', 'y'].forEach((id) => t.p(id, 'female'));
    t.fam('1', ['a'], ['b', 'x']);
    t.fam('2', ['b'], ['c']);
    t.fam('3', ['c'], ['d']);
    t.fam('4', ['d'], ['e']);
    t.fam('5', ['x'], ['y']);
    expect(relationship(t.tree, 'y', 'e').term).toBe('1st cousin twice removed');
    expect(relationship(t.tree, 'x', 'e').term).toBe('great-great-aunt');
    expect(relationship(t.tree, 'x', 'd').term).toBe('great-aunt');
  });

  it('returns a connecting path', () => {
    const r = relationship(tree, 'cousin', 'me');
    expect(r.path[0]).toBe('cousin');
    expect(r.path[r.path.length - 1]).toBe('me');
    expect(r.path).toContain('g1');
  });
});
