import { parentFamiliesOf, parentsOf, partnerFamiliesOf } from './graph';
import { fullName } from './people';
import type { Person, Sex, TreeData } from './types';

export interface Relationship {
  /** "A is B's <term>" */
  term: string;
  /** Sentence: "Anna is Ben's 1st cousin twice removed." */
  sentence: string;
  /** Path of person ids from A to B through family links (for highlighting). */
  path: string[];
  kind: 'self' | 'blood' | 'partner' | 'in-law' | 'step' | 'distant' | 'none';
}

const g = (sex: Sex, m: string, f: string, n: string) => (sex === 'male' ? m : sex === 'female' ? f : n);

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function removedWord(n: number): string {
  if (n === 1) return 'once removed';
  if (n === 2) return 'twice removed';
  if (n === 3) return 'three times removed';
  return `${n} times removed`;
}

function greats(n: number): string {
  // n = number of "greats"
  if (n <= 0) return '';
  if (n === 1) return 'great-';
  if (n === 2) return 'great-great-';
  return `${ordinal(n)} great-`;
}

/** Up-distances via birth/adoptive parents (self = 0). */
function ancestorDistances(tree: TreeData, id: string): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const p of parentsOf(tree, cur, ['birth', 'adopted'])) {
      if (!dist.has(p.person.id)) {
        dist.set(p.person.id, d + 1);
        queue.push(p.person.id);
      }
    }
  }
  return dist;
}

interface Blood {
  up: number; // generations from A up to the common ancestor
  down: number; // generations from B up to the common ancestor
  half: boolean;
}

function bloodRelation(tree: TreeData, a: string, b: string): Blood | null {
  const da = ancestorDistances(tree, a);
  const db = ancestorDistances(tree, b);
  let best: { up: number; down: number } | null = null;
  const commons: string[] = [];
  for (const [id, x] of da) {
    const y = db.get(id);
    if (y === undefined) continue;
    if (!best || x + y < best.up + best.down) {
      best = { up: x, down: y };
    }
  }
  if (!best) return null;
  for (const [id, x] of da) if (db.get(id) !== undefined && x === best.up && db.get(id) === best.down) commons.push(id);
  let half = false;
  if (best.up > 0 && best.down > 0) {
    // The two lines meet at children of the common ancestor(s). Half if those
    // two children each have a recorded parent the other lacks.
    const commonSet = new Set(commons);
    const pick = (dist: Map<string, number>, level: number) => {
      for (const [id, x] of dist) {
        if (x !== level) continue;
        const ps = parentsOf(tree, id, ['birth', 'adopted']).map((p) => p.person.id);
        if (ps.some((p) => commonSet.has(p))) return new Set(ps);
      }
      return new Set<string>();
    };
    const pa = pick(da, best.up - 1);
    const pb = pick(db, best.down - 1);
    const aOnly = [...pa].some((x) => !pb.has(x));
    const bOnly = [...pb].some((x) => !pa.has(x));
    half = aOnly && bOnly;
  }
  return { ...best, half };
}

function bloodTerm(r: Blood, sex: Sex): string {
  const { up, down, half } = r;
  const h = half ? 'half-' : '';
  if (up === 0 && down === 0) return 'self';
  if (up === 0) {
    if (down === 1) return g(sex, 'father', 'mother', 'parent');
    return greats(down - 2) + g(sex, 'grandfather', 'grandmother', 'grandparent');
  }
  if (down === 0) {
    if (up === 1) return g(sex, 'son', 'daughter', 'child');
    return greats(up - 2) + g(sex, 'grandson', 'granddaughter', 'grandchild');
  }
  if (up === 1 && down === 1) return h + g(sex, 'brother', 'sister', 'sibling');
  if (up === 1) return h + greats(down - 2) + g(sex, 'uncle', 'aunt', 'aunt/uncle');
  if (down === 1) return h + greats(up - 2) + g(sex, 'nephew', 'niece', 'niece/nephew');
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  return `${half ? 'half ' : ''}${ordinal(degree)} cousin${removed ? ' ' + removedWord(removed) : ''}`;
}

function partnersOfId(tree: TreeData, id: string) {
  const out: { id: string; status: string }[] = [];
  for (const f of partnerFamiliesOf(tree, id)) for (const p of f.partners) if (p !== id) out.push({ id: p, status: f.status });
  return out;
}

/** Shortest path through parent/child/partner links. */
export function familyPath(tree: TreeData, a: string, b: string): string[] {
  if (a === b) return [a];
  const prev = new Map<string, string>([[a, '']]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    const next: string[] = [];
    for (const l of parentFamiliesOf(tree, cur)) next.push(...l.family.partners, ...l.family.children.map((c) => c.id).filter((x) => x !== cur && l.family.partners.length === 0));
    for (const f of partnerFamiliesOf(tree, cur)) next.push(...f.partners, ...f.children.map((c) => c.id));
    for (const n of next) {
      if (prev.has(n) || !tree.people[n]) continue;
      prev.set(n, cur);
      if (n === b) {
        const path = [b];
        let x = cur;
        while (x) {
          path.unshift(x);
          x = prev.get(x)!;
        }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

export function relationship(tree: TreeData, aId: string, bId: string): Relationship {
  const A = tree.people[aId];
  const B = tree.people[bId];
  if (!A || !B) return { term: '', sentence: '', path: [], kind: 'none' };
  const path = familyPath(tree, aId, bId);
  const mk = (term: string, kind: Relationship['kind']): Relationship => ({
    term,
    kind,
    path,
    sentence: sentence(A, B, term, kind),
  });
  if (aId === bId) return mk('self', 'self');

  // Partners
  const direct = partnersOfId(tree, aId).find((p) => p.id === bId);
  if (direct) {
    const base = g(A.sex, 'husband', 'wife', 'spouse');
    if (direct.status === 'divorced') return mk('ex-' + base, 'partner');
    if (direct.status === 'partners') return mk('partner', 'partner');
    return mk(base, 'partner');
  }

  const blood = bloodRelation(tree, aId, bId);
  if (blood) return mk(bloodTerm(blood, A.sex), 'blood');

  // Recorded step-child links (e.g. a step-parent family)
  for (const f of partnerFamiliesOf(tree, aId))
    if (f.children.some((c) => c.id === bId && (c.kind === 'step' || c.kind === 'foster')))
      return mk((f.children.find((c) => c.id === bId)!.kind === 'foster' ? 'foster ' : 'step') + g(A.sex, 'father', 'mother', 'parent'), 'step');
  for (const f of partnerFamiliesOf(tree, bId))
    if (f.children.some((c) => c.id === aId && (c.kind === 'step' || c.kind === 'foster')))
      return mk((f.children.find((c) => c.id === aId)!.kind === 'foster' ? 'foster ' : 'step') + g(A.sex, 'son', 'daughter', 'child'), 'step');

  // A is the partner of someone (X) blood-related to B
  for (const x of partnersOfId(tree, aId)) {
    const r = bloodRelation(tree, x.id, bId);
    if (!r) continue;
    const { up, down } = r;
    if (up === 0 && down === 1) return mk('step' + g(A.sex, 'father', 'mother', 'parent'), 'step');
    if (up === 0 && down === 2) return mk('step-' + g(A.sex, 'grandfather', 'grandmother', 'grandparent'), 'step');
    if (up === 1 && down === 1) return mk(g(A.sex, 'brother', 'sister', 'sibling') + '-in-law', 'in-law');
    if (up === 1 && down === 0) return mk(g(A.sex, 'son', 'daughter', 'child') + '-in-law', 'in-law');
    if (up === 2 && down === 0) return mk(g(A.sex, 'grandson', 'granddaughter', 'grandchild') + '-in-law', 'in-law');
    if (up === 1 && down >= 2) return mk(greats(down - 2) + g(A.sex, 'uncle', 'aunt', 'aunt/uncle') + ' by marriage', 'in-law');
    if (down === 1 && up >= 2) return mk(greats(up - 2) + g(A.sex, 'nephew', 'niece', 'niece/nephew') + ' by marriage', 'in-law');
    const X = tree.people[x.id];
    return mk(`${g(A.sex, 'husband', 'wife', 'partner')} of ${bloodTerm(r, X.sex)}`, 'in-law');
  }
  // B is the partner of someone (Y) blood-related to A
  for (const y of partnersOfId(tree, bId)) {
    const r = bloodRelation(tree, aId, y.id);
    if (!r) continue;
    const { up, down } = r;
    if (up === 0 && down === 1) return mk(g(A.sex, 'father', 'mother', 'parent') + '-in-law', 'in-law');
    if (up === 0 && down === 2) return mk(g(A.sex, 'grandfather', 'grandmother', 'grandparent') + '-in-law', 'in-law');
    if (up === 1 && down === 1) return mk(g(A.sex, 'brother', 'sister', 'sibling') + '-in-law', 'in-law');
    if (up === 1 && down === 0) return mk('step' + g(A.sex, 'son', 'daughter', 'child'), 'step');
    if (up === 2 && down === 0) return mk('step-' + g(A.sex, 'grandson', 'granddaughter', 'grandchild'), 'step');
    if (up === 1 && down >= 2) return mk(greats(down - 2) + g(A.sex, 'uncle', 'aunt', 'aunt/uncle') + ' by marriage', 'in-law');
    if (down === 1 && up >= 2) return mk(greats(up - 2) + g(A.sex, 'nephew', 'niece', 'niece/nephew') + ' by marriage', 'in-law');
    return mk(`${bloodTerm(r, A.sex)} of partner`, 'in-law');
  }
  // Step-siblings: a parent of A is the partner of a parent of B
  const pa = parentsOf(tree, aId).map((p) => p.person.id);
  const pb = new Set(parentsOf(tree, bId).map((p) => p.person.id));
  for (const p of pa) for (const q of partnersOfId(tree, p)) if (pb.has(q.id)) return mk('step' + g(A.sex, 'brother', 'sister', 'sibling'), 'step');

  // Co-in-laws: partners of siblings
  for (const x of partnersOfId(tree, aId))
    for (const y of partnersOfId(tree, bId)) {
      const r = bloodRelation(tree, x.id, y.id);
      if (r && r.up === 1 && r.down === 1) return mk(g(A.sex, 'brother', 'sister', 'sibling') + '-in-law', 'in-law');
    }

  if (path.length) return mk('relative by marriage', 'distant');
  return { term: 'not related', kind: 'none', path: [], sentence: `No family connection found between ${fullName(A)} and ${fullName(B)}.` };
}

function possessive(name: string) {
  return name.endsWith('s') ? `${name}’` : `${name}'s`;
}

function sentence(A: Person, B: Person, term: string, kind: Relationship['kind']): string {
  if (kind === 'self') return 'That is the same person.';
  return `${fullName(A)} is ${possessive(fullName(B))} ${term}.`;
}
