import { monthDay, parseDate } from './dates';
import { parentsOf, partnerFamiliesOf } from './graph';
import { birthDate, birthYear, deathOf, fullName, isLiving, lifespan, normalize } from './people';
import type { Person, TreeData } from './types';

export interface TreeStats {
  people: number;
  surnames: number;
  living: number;
  earliest?: { person: Person; year: number };
  longest: { person: Person; years: number }[];
  largestFamilies: { familyId: string; label: string; children: number }[];
  lifespanByCentury: { century: string; avg: number; count: number }[];
  commonGiven: { name: string; count: number }[];
  commonSurnames: { name: string; count: number }[];
  completeness: { generation: number; found: number; possible: number }[];
}

export function computeStats(tree: TreeData, homeId = tree.homeId): TreeStats {
  const people = Object.values(tree.people).filter((p) => !p.placeholder);
  const surnames = new Map<string, number>();
  const given = new Map<string, number>();
  for (const p of people) {
    for (const s of new Set([p.surname, p.birthSurname].filter(Boolean) as string[])) surnames.set(s, (surnames.get(s) ?? 0) + 1);
    const first = p.given.split(/\s+/)[0];
    if (first) given.set(first, (given.get(first) ?? 0) + 1);
  }
  let earliest: TreeStats['earliest'];
  for (const p of people) {
    const y = birthYear(p);
    if (y !== undefined && (!earliest || y < earliest.year)) earliest = { person: p, year: y };
  }
  const spans = people.map((p) => ({ person: p, years: lifespan(p) })).filter((x): x is { person: Person; years: number } => x.years !== undefined);
  const longest = [...spans].sort((a, b) => b.years - a.years).slice(0, 5);
  const largestFamilies = Object.values(tree.families)
    .map((f) => ({
      familyId: f.id,
      label: f.partners.map((id) => (tree.people[id] ? fullName(tree.people[id]) : '?')).join(' & ') || 'Unknown parents',
      children: f.children.length,
    }))
    .filter((f) => f.children > 0)
    .sort((a, b) => b.children - a.children)
    .slice(0, 5);
  const byCentury = new Map<number, number[]>();
  for (const s of spans) {
    const y = birthYear(s.person)!;
    const c = Math.floor(y / 100);
    byCentury.set(c, [...(byCentury.get(c) ?? []), s.years]);
  }
  const lifespanByCentury = [...byCentury.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, arr]) => ({ century: `${c}00s`, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), count: arr.length }));
  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

  // Ancestry completeness from the home person
  const completeness: TreeStats['completeness'] = [];
  if (homeId && tree.people[homeId]) {
    let gen = [homeId];
    for (let g = 1; g <= 8; g++) {
      const next: string[] = [];
      for (const id of gen) for (const p of parentsOf(tree, id, ['birth', 'adopted'])) if (!p.person.placeholder) next.push(p.person.id);
      completeness.push({ generation: g, found: new Set(next).size, possible: 2 ** g });
      if (!next.length) break;
      gen = next;
    }
  }
  return {
    people: people.length,
    surnames: surnames.size,
    living: people.filter((p) => isLiving(p)).length,
    earliest,
    longest,
    largestFamilies,
    lifespanByCentury,
    commonGiven: top(given),
    commonSurnames: top(surnames),
    completeness,
  };
}

export interface DayEntry {
  kind: 'birthday' | 'anniversary' | 'remembrance';
  personIds: string[];
  month: number;
  day: number;
  year: number;
  label: string;
}

export function onThisDay(tree: TreeData, month: number, day: number, window = 0): DayEntry[] {
  const out: DayEntry[] = [];
  const inWindow = (m: number, d: number) => {
    if (!window) return m === month && d === day;
    const ref = Date.UTC(2000, month - 1, day);
    const x = Date.UTC(2000, m - 1, d);
    const diff = (x - ref) / 86400000;
    return (diff >= 0 && diff <= window) || diff + 366 <= window;
  };
  for (const p of Object.values(tree.people)) {
    const b = p.events.find((e) => e.type === 'birth' && !e.disputed);
    const md = monthDay(b?.date);
    if (md && inWindow(md.month, md.day))
      out.push({ kind: isLiving(p) ? 'birthday' : 'remembrance', personIds: [p.id], ...md, year: parseDate(b!.date).year!, label: isLiving(p) ? 'Birthday' : 'Born' });
    const d = deathOf(p);
    const dm = monthDay(d?.date);
    if (dm && inWindow(dm.month, dm.day)) out.push({ kind: 'remembrance', personIds: [p.id], ...dm, year: parseDate(d!.date).year!, label: 'Died' });
  }
  for (const f of Object.values(tree.families)) {
    const md = monthDay(f.date);
    if (md && inWindow(md.month, md.day)) out.push({ kind: 'anniversary', personIds: f.partners, ...md, year: parseDate(f.date).year!, label: 'Wedding anniversary' });
  }
  return out.sort((a, b) => a.month - b.month || a.day - b.day || a.year - b.year);
}

export interface PlaceInfo {
  name: string;
  key: string;
  events: { personId: string; type: string; year?: number }[];
}

export function placesOf(tree: TreeData): PlaceInfo[] {
  const m = new Map<string, PlaceInfo>();
  const add = (place: string | undefined, personId: string, type: string, date?: string) => {
    if (!place?.trim()) return;
    const key = normalize(place);
    const cur = m.get(key) ?? { name: place.trim(), key, events: [] };
    cur.events.push({ personId, type, year: parseDate(date).year });
    m.set(key, cur);
  };
  for (const p of Object.values(tree.people)) for (const e of p.events) add(e.place, p.id, e.type, e.date);
  for (const f of Object.values(tree.families)) for (const pid of f.partners) add(f.place, pid, 'marriage', f.date);
  return [...m.values()].sort((a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name));
}

export function aliveInYear(p: Person, year: number, nowYear = new Date().getFullYear()): boolean {
  const b = birthDate(p).year;
  if (b === undefined) return false;
  const d = parseDate(deathOf(p)?.date).year ?? (isLiving(p) ? nowYear : b + 80);
  return b <= year && d >= year;
}

export function yearRange(tree: TreeData): [number, number] {
  let min = Infinity;
  const nowYear = new Date().getFullYear();
  for (const p of Object.values(tree.people)) {
    const y = birthYear(p);
    if (y !== undefined) min = Math.min(min, y);
  }
  return [Number.isFinite(min) ? min : nowYear - 100, nowYear];
}

export function familyCount(tree: TreeData, id: string) {
  return partnerFamiliesOf(tree, id).length;
}
