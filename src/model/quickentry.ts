/**
 * Forgiving quick-entry syntax:
 *
 *   John Smith (M, 1870–1940, blacksmith)
 *   spouse: Mary Jones (F, b. 1875)
 *   children: Tom (1903), Rose (F, 1905)
 *   father: William Smith (1840)
 *   mother: Ann (c. 1845)
 *   siblings: Jane (F)
 */
import { parseDate } from './dates';
import { addPerson, addRelative, type Relation } from './ops';
import { newEvent } from './people';
import type { LifeEvent, Person, Sex, TreeData } from './types';

export interface QuickPerson {
  given: string;
  surname?: string;
  sex: Sex;
  born?: string;
  died?: string;
  occupation?: string;
}

export interface QuickPlan {
  main?: QuickPerson;
  relatives: { rel: Relation; person: QuickPerson; parentRole?: 'father' | 'mother' }[];
  errors: string[];
}

const KEYS: Record<string, { rel: Relation; sex?: Sex; role?: 'father' | 'mother' }> = {
  spouse: { rel: 'spouse' },
  spouses: { rel: 'spouse' },
  partner: { rel: 'spouse' },
  partners: { rel: 'spouse' },
  husband: { rel: 'spouse', sex: 'male' },
  wife: { rel: 'spouse', sex: 'female' },
  married: { rel: 'spouse' },
  child: { rel: 'child' },
  children: { rel: 'child' },
  kids: { rel: 'child' },
  son: { rel: 'child', sex: 'male' },
  sons: { rel: 'child', sex: 'male' },
  daughter: { rel: 'child', sex: 'female' },
  daughters: { rel: 'child', sex: 'female' },
  father: { rel: 'parent', sex: 'male', role: 'father' },
  dad: { rel: 'parent', sex: 'male', role: 'father' },
  mother: { rel: 'parent', sex: 'female', role: 'mother' },
  mum: { rel: 'parent', sex: 'female', role: 'mother' },
  mom: { rel: 'parent', sex: 'female', role: 'mother' },
  parents: { rel: 'parent' },
  parent: { rel: 'parent' },
  sibling: { rel: 'sibling' },
  siblings: { rel: 'sibling' },
  brother: { rel: 'sibling', sex: 'male' },
  brothers: { rel: 'sibling', sex: 'male' },
  sister: { rel: 'sibling', sex: 'female' },
  sisters: { rel: 'sibling', sex: 'female' },
};

const SEX_WORDS: Record<string, Sex> = {
  m: 'male',
  male: 'male',
  man: 'male',
  boy: 'male',
  f: 'female',
  female: 'female',
  woman: 'female',
  girl: 'female',
};

/** Split on commas/semicolons that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseEntry(text: string, defaultSex: Sex = 'unknown'): QuickPerson | null {
  const m = text.trim().match(/^([^()]+?)\s*(?:\((.*)\))?\s*$/);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  if (!words[0]) return null;
  const qp: QuickPerson = { given: words.length > 1 ? words.slice(0, -1).join(' ') : words[0], surname: words.length > 1 ? words[words.length - 1] : undefined, sex: defaultSex };
  for (const raw of (m[2] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const t = raw.toLowerCase();
    let mm: RegExpMatchArray | null;
    if (SEX_WORDS[t]) qp.sex = SEX_WORDS[t];
    else if ((mm = raw.match(/^(?:b\.?|born)\s+(.+)$/i))) qp.born = mm[1];
    else if ((mm = raw.match(/^(?:d\.?|died)\s+(.+)$/i))) qp.died = mm[1];
    else if ((mm = raw.match(/^(.*?\d{3,4}.*?)\s*(?:–|—|-|to)\s*(.*\d{3,4}.*)$/)) && parseDate(mm[1]).valid && parseDate(mm[2]).valid) {
      qp.born = mm[1].trim();
      qp.died = mm[2].trim();
    } else if (/\d{3,4}/.test(raw) && parseDate(raw).valid) qp.born = raw;
    else qp.occupation = qp.occupation ? `${qp.occupation}, ${raw}` : raw;
  }
  return qp;
}

export function parseQuickEntry(text: string): QuickPlan {
  const plan: QuickPlan = { relatives: [], errors: [] };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const km = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    const key = km ? KEYS[km[1].toLowerCase()] : undefined;
    if (km && !key && !['name', 'person', 'me'].includes(km[1].toLowerCase())) {
      plan.errors.push(`Don’t know “${km[1]}:” — try spouse, children, father, mother, parents or siblings.`);
      continue;
    }
    if (!km || !key) {
      const e = parseEntry(km ? km[2] : line);
      if (e) plan.main = e;
      continue;
    }
    const entries = splitTop(km[2]);
    entries.forEach((t, i) => {
      let sex = key.sex ?? 'unknown';
      let role = key.role;
      if (key.rel === 'parent' && !key.role) {
        // "parents: A, B" — first father, second mother, unless stated
        sex = i === 0 ? 'male' : 'female';
        role = i === 0 ? 'father' : 'mother';
      }
      const e = parseEntry(t, sex);
      if (!e) {
        plan.errors.push(`Couldn’t read “${t}”.`);
        return;
      }
      if (key.rel === 'parent' && !key.role) role = e.sex === 'female' ? 'mother' : 'father';
      plan.relatives.push({ rel: key.rel, person: e, parentRole: role });
    });
  }
  return plan;
}

function toPerson(q: QuickPerson, fallbackSurname: string): Partial<Person> {
  const events: LifeEvent[] = [];
  if (q.born) events.push(newEvent({ type: 'birth', date: q.born }));
  if (q.died) events.push(newEvent({ type: 'death', date: q.died }));
  return { given: q.given, surname: q.surname ?? fallbackSurname, sex: q.sex, events, occupation: q.occupation, living: q.died ? 'deceased' : 'auto' };
}

/** Apply a parsed plan. Returns the main person's id. */
export function applyQuickEntry(tree: TreeData, plan: QuickPlan, anchorId?: string): string {
  let mainId = anchorId;
  if (plan.main) mainId = addPerson(tree, toPerson(plan.main, '')).id;
  if (!mainId) throw new Error('Start with a line naming the person, e.g. “John Smith (M, 1870)”.');
  const main = tree.people[mainId];
  const mainSurname = main.birthSurname || main.surname;
  let spouseFamily: string | undefined;
  let spouseSurname: string | undefined;
  // spouses first so children join the right family
  for (const r of plan.relatives.filter((x) => x.rel === 'spouse')) {
    const res = addRelative(tree, mainId, 'spouse', toPerson(r.person, ''));
    spouseFamily = res.familyId;
    spouseSurname = tree.people[res.personId].surname;
  }
  const childSurname = main.sex === 'female' && spouseSurname ? spouseSurname : main.surname;
  for (const r of plan.relatives.filter((x) => x.rel !== 'spouse')) {
    const fallback = r.rel === 'child' ? childSurname : r.rel === 'sibling' ? mainSurname : r.parentRole === 'father' ? mainSurname : '';
    addRelative(tree, mainId, r.rel, toPerson(r.person, fallback), { familyId: r.rel === 'child' ? spouseFamily : undefined });
  }
  return mainId;
}
