import { parseDate } from './dates';
import { childrenOf, isAncestor, parentsOf } from './graph';
import { birthDate, birthYear, deathDate, fullName, isLiving, MAX_AGE, normalize } from './people';
import type { Person, TreeData } from './types';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  personId: string;
  level: IssueLevel;
  code: string;
  message: string;
}

const cache = new WeakMap<TreeData, Issue[]>();

export function runChecks(tree: TreeData, nowYear = new Date().getFullYear()): Issue[] {
  const hit = cache.get(tree);
  if (hit) return hit;
  const out: Issue[] = [];
  for (const p of Object.values(tree.people)) out.push(...checkPerson(tree, p, nowYear));
  cache.set(tree, out);
  return out;
}

export function issuesByPerson(tree: TreeData): Map<string, Issue[]> {
  const m = new Map<string, Issue[]>();
  for (const i of runChecks(tree)) {
    const arr = m.get(i.personId) ?? [];
    arr.push(i);
    m.set(i.personId, arr);
  }
  return m;
}

export function checkPerson(tree: TreeData, p: Person, nowYear = new Date().getFullYear()): Issue[] {
  const out: Issue[] = [];
  const add = (level: IssueLevel, code: string, message: string) => out.push({ personId: p.id, level, code, message });

  for (const e of p.events) {
    if (e.date && e.date.trim() && !parseDate(e.date).valid)
      add('warning', 'bad-date', `Can't read the ${e.type === 'custom' ? e.label || 'event' : e.type} date “${e.date}”.`);
  }
  const b = birthDate(p);
  const d = deathDate(p);
  if (b.sortKey !== undefined && d.sortKey !== undefined && d.sortKey < b.sortKey - 0.01)
    add('error', 'death-before-birth', 'Death is recorded before birth.');
  if (b.year !== undefined && isLiving(p, nowYear) && p.living === 'living' && nowYear - b.year > MAX_AGE)
    add('warning', 'too-old', `Marked as living but would be ${nowYear - b.year} years old.`);
  if (b.year !== undefined && d.year !== undefined && d.year - b.year > MAX_AGE)
    add('warning', 'long-life', `Lived ${d.year - b.year} years — please double-check.`);

  // Against parents
  if (b.sortKey !== undefined) {
    for (const par of parentsOf(tree, p.id, ['birth'])) {
      const pb = birthDate(par.person);
      const pd = deathDate(par.person);
      const name = fullName(par.person);
      if (pb.year !== undefined && b.year !== undefined) {
        const age = b.year - pb.year;
        if (age < 12) add('error', 'parent-too-young', `${name} would have been ${age < 0 ? 'not yet born' : age} at this birth.`);
        else if (par.person.sex === 'female' && age > 55) add('warning', 'mother-too-old', `${name} would have been ${age} at this birth.`);
        else if (age > 80) add('warning', 'parent-too-old', `${name} would have been ${age} at this birth.`);
      }
      if (pd.sortKey !== undefined) {
        // fathers can die up to ~9 months before the birth
        const slack = par.person.sex === 'male' ? 0.75 : 0;
        if (b.sortKey > pd.sortKey + slack + 0.01) add('error', 'born-after-parent-death', `Born after ${name} died.`);
      }
    }
  }
  if (isAncestor(tree, p.id, p.id)) add('error', 'own-ancestor', 'Listed as their own ancestor.');
  return out;
}

/** Simple similarity in [0,1] between two strings (Dice coefficient over bigrams). */
export function similarity(a: string, b: string): number {
  const x = normalize(a).replace(/ /g, '');
  const y = normalize(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (Math.min(x.length, y.length) >= 3 && levenshtein(x, y) <= 1) return 0.9;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return (2 * inter) / (x.length - 1 + (y.length - 1) || 1);
}

export interface DuplicatePair {
  a: string;
  b: string;
  score: number;
  reasons: string[];
}

export function findDuplicates(tree: TreeData, threshold = 0.78): DuplicatePair[] {
  const people = Object.values(tree.people).filter((p) => !p.placeholder && (p.given || p.surname));
  const out: DuplicatePair[] = [];
  // bucket by first letter of surname/birth surname to keep it quick
  const buckets = new Map<string, Person[]>();
  for (const p of people) {
    const keys = new Set([normalize(p.surname)[0] ?? '', normalize(p.birthSurname ?? '')[0] ?? ''].filter((k) => k !== undefined));
    for (const k of keys) {
      const arr = buckets.get(k) ?? [];
      arr.push(p);
      buckets.set(k, arr);
    }
  }
  const seen = new Set<string>();
  for (const arr of buckets.values()) {
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = scorePair(tree, a, b);
        if (r.score >= threshold) out.push({ a: a.id, b: b.id, ...r });
      }
  }
  return out.sort((x, y) => y.score - x.score);
}

function scorePair(tree: TreeData, a: Person, b: Person): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const given = similarity(a.given, b.given);
  const sur = Math.max(
    similarity(a.surname, b.surname),
    similarity(a.birthSurname ?? a.surname, b.birthSurname ?? b.surname),
  );
  let score = given * 0.5 + sur * 0.35;
  if (given > 0.85 && sur > 0.85) reasons.push('Very similar names');
  if (a.sex !== 'unknown' && b.sex !== 'unknown' && a.sex !== b.sex) return { score: 0, reasons };
  const ya = birthYear(a);
  const yb = birthYear(b);
  if (ya !== undefined && yb !== undefined) {
    const diff = Math.abs(ya - yb);
    if (diff === 0) {
      score += 0.15;
      reasons.push(`Both born ${ya}`);
    } else if (diff <= 2) {
      score += 0.08;
      reasons.push('Born within two years');
    } else if (diff > 10) score -= 0.4;
  } else score += 0.05;
  // Already directly related (parent/child) are unlikely duplicates
  if (parentsOf(tree, a.id).some((x) => x.person.id === b.id) || childrenOf(tree, a.id).some((x) => x.person.id === b.id)) score -= 0.5;
  return { score, reasons };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
