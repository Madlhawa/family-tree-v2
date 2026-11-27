import { parseDate, type ParsedDate } from './dates';
import type { Family, LifeEvent, Person, Sex, TreeData } from './types';

let counter = 0;
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1e6;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function newPerson(init: Partial<Person> = {}): Person {
  const now = Date.now();
  return {
    id: uid('p'),
    given: '',
    surname: '',
    otherNames: [],
    sex: 'unknown',
    living: 'auto',
    media: [],
    links: [],
    socials: [],
    events: [],
    createdAt: now,
    updatedAt: now,
    ...init,
  };
}

export function newFamily(init: Partial<Family> = {}): Family {
  const now = Date.now();
  return {
    id: uid('f'),
    partners: [],
    children: [],
    status: 'married',
    manualOrder: false,
    createdAt: now,
    updatedAt: now,
    ...init,
  };
}

export function newEvent(init: Partial<LifeEvent> & Pick<LifeEvent, 'type'>): LifeEvent {
  return { id: uid('e'), confidence: 'confirmed', ...init };
}

export function emptyTree(name = 'My family'): TreeData {
  const now = Date.now();
  return { version: 2, id: uid('t'), name, people: {}, families: {}, stories: [], createdAt: now, updatedAt: now };
}

/** The primary (non-disputed first) event of a type. */
export function primaryEvent(p: Person, type: LifeEvent['type']): LifeEvent | undefined {
  let first: LifeEvent | undefined;
  for (const e of p.events) {
    if (e.type !== type) continue;
    if (!e.disputed) return e;
    first ??= e;
  }
  return first;
}

export const birthOf = (p: Person) => primaryEvent(p, 'birth');
export const deathOf = (p: Person) => primaryEvent(p, 'death') ?? primaryEvent(p, 'burial');

export function birthDate(p: Person): ParsedDate {
  return parseDate(birthOf(p)?.date ?? primaryEvent(p, 'baptism')?.date);
}
export function deathDate(p: Person): ParsedDate {
  return parseDate(deathOf(p)?.date);
}
export const birthYear = (p: Person) => birthDate(p).year;
export const deathYear = (p: Person) => deathDate(p).year;

export const MAX_AGE = 110;

/** Living status, inferred from dates when set to "auto". */
export function isLiving(p: Person, nowYear = new Date().getFullYear()): boolean {
  if (p.living === 'living') return true;
  if (p.living === 'deceased') return false;
  if (p.placeholder) return false;
  if (p.events.some((e) => e.type === 'death' || e.type === 'burial')) return false;
  const by = birthYear(p);
  if (by !== undefined) return nowYear - by <= MAX_AGE;
  return true;
}

export function fullName(p: Person): string {
  if (p.placeholder && !p.given && !p.surname) return 'Unknown';
  const name = [p.given, p.surname].filter(Boolean).join(' ').trim();
  return name || 'Unnamed';
}

export function displayName(p: Person, opts: { privacy?: boolean } = {}): string {
  if (opts.privacy && isLiving(p)) {
    const initials = [p.given, p.surname]
      .filter(Boolean)
      .map((s) => s.trim()[0]?.toUpperCase() + '.')
      .join(' ');
    return initials || 'Living';
  }
  return fullName(p);
}

export function initials(p: Person): string {
  const i = [p.given, p.surname].filter(Boolean).map((s) => s.trim()[0]?.toUpperCase() ?? '');
  return i.join('') || '?';
}

/** "1928 – 2004", "b. 1995", "d. 1950", "" */
export function yearsLabel(p: Person, opts: { privacy?: boolean } = {}): string {
  const living = isLiving(p);
  if (opts.privacy && living) return '';
  const b = birthDate(p);
  const d = deathDate(p);
  const show = (x: ParsedDate) => {
    if (!x.valid || x.year === undefined) return '';
    if (x.qualifier === 'about' || x.qualifier === 'estimated') return `c. ${x.year}`;
    if (x.qualifier === 'before') return `bef. ${x.year}`;
    if (x.qualifier === 'after') return `aft. ${x.year}`;
    return String(x.year);
  };
  const bs = show(b);
  const ds = show(d);
  if (bs && ds) return `${bs} – ${ds}`;
  if (bs) return living ? `b. ${bs}` : `${bs} – ?`;
  if (ds) return `d. ${ds}`;
  if (!living && p.living === 'deceased') return 'Deceased';
  return '';
}

export function sexWord(sex: Sex, male: string, female: string, neutral: string) {
  return sex === 'male' ? male : sex === 'female' ? female : neutral;
}

/** Stable hue (0-359) per surname for the subtle colour accent. */
export function surnameHue(surname: string): number {
  const s = surname.trim().toLowerCase();
  if (!s) return 220;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function ageAt(p: Person, year: number): number | undefined {
  const by = birthYear(p);
  return by === undefined ? undefined : year - by;
}

export function lifespan(p: Person): number | undefined {
  const b = birthDate(p);
  const d = deathDate(p);
  if (b.sortKey === undefined || d.sortKey === undefined) return undefined;
  const v = Math.floor(d.sortKey - b.sortKey);
  return v >= 0 ? v : undefined;
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
