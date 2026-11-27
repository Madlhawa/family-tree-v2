/**
 * GEDCOM 5.5.1 import/export.
 *  - INDI / FAM, NAME (+ married / aka names), SEX, events with DATE/PLAC/NOTE/SOUR/QUAY
 *  - FAMC + PEDI (birth / adopted / foster / step)
 *  - Several records of the same event (conflicts) and _DISPUTED marker
 *  - CONC / CONT line continuations
 */
import { parseDate } from '../model/dates';
import { emptyTree, isLiving, newEvent, newFamily, newPerson, uid } from '../model/people';
import type { ChildKind, Confidence, EventType, Family, FamilyStatus, LifeEvent, Person, TreeData } from '../model/types';

interface Node {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: Node[];
}

const EVENT_TAGS: Record<string, EventType> = {
  BIRT: 'birth',
  DEAT: 'death',
  MARR: 'marriage',
  BAPM: 'baptism',
  CHR: 'baptism',
  BURI: 'burial',
  RESI: 'residence',
  EDUC: 'education',
  OCCU: 'occupation',
  _MILT: 'military',
  _MIL: 'military',
  EMIG: 'migration',
  IMMI: 'migration',
  EVEN: 'custom',
};
const TAG_OF: Record<EventType, string> = {
  birth: 'BIRT',
  death: 'DEAT',
  marriage: 'MARR',
  baptism: 'BAPM',
  burial: 'BURI',
  residence: 'RESI',
  education: 'EDUC',
  occupation: 'OCCU',
  military: '_MILT',
  migration: 'EMIG',
  custom: 'EVEN',
};

export function parseLines(text: string): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '');
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/);
    if (!m) continue;
    const node: Node = { level: +m[1], xref: m[2], tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    // continuations
    if (node.tag === 'CONC' || node.tag === 'CONT') {
      const parent = stack[node.level - 1];
      if (parent) {
        parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
        continue;
      }
    }
    while (stack.length > node.level) stack.pop();
    if (node.level === 0) roots.push(node);
    else stack[node.level - 1]?.children.push(node);
    stack[node.level] = node;
    stack.length = node.level + 1;
  }
  return roots;
}

const child = (n: Node, tag: string) => n.children.find((c) => c.tag === tag);
const childrenTag = (n: Node, tag: string) => n.children.filter((c) => c.tag === tag);
const val = (n: Node | undefined) => n?.value.trim() || undefined;

function gedDateToUser(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  // keep as is when we can read it; GEDCOM forms are accepted by our parser
  if (parseDate(t).valid) {
    const p = parseDate(t);
    return p.display;
  }
  return t.replace(/^\((.*)\)$/, '$1');
}

function confidenceOf(n: Node): Confidence {
  const q = val(child(n, 'QUAY')) ?? val(child(child(n, 'SOUR') ?? n, 'QUAY'));
  if (q === '3') return 'confirmed';
  if (q === '2') return 'probable';
  if (q === '0' || q === '1') return 'story';
  const c = val(child(n, '_CONF'));
  if (c === 'probable' || c === 'story' || c === 'confirmed') return c;
  return 'confirmed';
}

function eventFrom(n: Node, type: EventType): LifeEvent {
  const sour = child(n, 'SOUR');
  let source: string | undefined;
  if (sour) source = sour.value.startsWith('@') ? val(child(sour, 'PAGE')) ?? sour.value : sour.value || val(child(sour, 'TEXT'));
  return newEvent({
    type,
    label: type === 'custom' ? val(child(n, 'TYPE')) ?? (n.value || undefined) : undefined,
    date: gedDateToUser(val(child(n, 'DATE'))),
    place: val(child(n, 'PLAC')),
    note: val(child(n, 'NOTE')),
    source,
    confidence: confidenceOf(n),
    disputed: val(child(n, '_DISPUTED')) === 'Y' || undefined,
  });
}

export interface ImportReport {
  tree: TreeData;
  people: number;
  families: number;
  warnings: string[];
}

export function importGedcom(text: string, name = 'Imported tree'): ImportReport {
  const roots = parseLines(text);
  const tree = emptyTree(name);
  const warnings: string[] = [];
  const idOf = new Map<string, string>();
  const famcKinds = new Map<string, Map<string, ChildKind>>(); // personX -> famX -> kind
  const notes = new Map<string, string>();
  for (const r of roots) if (r.tag === 'NOTE' && r.xref) notes.set(r.xref, r.value);
  const noteText = (n?: Node) => (n ? (n.value.startsWith('@') ? notes.get(n.value) : n.value) : undefined);

  const head = roots.find((r) => r.tag === 'HEAD');
  const fileName = head && val(child(head, '_TREE'));
  if (fileName) tree.name = fileName;

  for (const r of roots) {
    if (r.tag !== 'INDI' || !r.xref) continue;
    const p = newPerson();
    idOf.set(r.xref, p.id);
    const names = childrenTag(r, 'NAME');
    names.forEach((nm, i) => {
      const m = nm.value.match(/^([^/]*)(?:\/([^/]*)\/)?(.*)$/);
      const given = (val(child(nm, 'GIVN')) ?? m?.[1] ?? '').trim();
      const surname = (val(child(nm, 'SURN')) ?? m?.[2] ?? '').trim();
      const type = val(child(nm, 'TYPE'))?.toLowerCase();
      if (i === 0) {
        p.given = given;
        p.surname = surname;
        const nick = val(child(nm, 'NICK'));
        if (nick) p.otherNames.push(nick);
        const npfx = val(child(nm, 'NPFX'));
        if (npfx) p.title = npfx;
      } else if (type === 'married' && surname) {
        p.birthSurname = p.surname;
        p.surname = surname;
      } else if (type === 'birth' && surname) {
        p.birthSurname = surname;
      } else {
        const full = [given, surname].filter(Boolean).join(' ');
        if (full) p.otherNames.push(full);
      }
    });
    const sex = val(child(r, 'SEX'));
    p.sex = sex === 'M' ? 'male' : sex === 'F' ? 'female' : sex === 'X' ? 'other' : 'unknown';
    const title = val(child(r, 'TITL'));
    if (title) p.title = title;
    for (const c of r.children) {
      const type = EVENT_TAGS[c.tag];
      if (type) {
        if (type === 'occupation' && c.value && !p.occupation) p.occupation = c.value;
        const e = eventFrom(c, type);
        if (type === 'occupation' && c.value) e.label = c.value;
        if (c.tag === 'DEAT' && c.value === 'Y' && !e.date && !e.place) {
          p.living = 'deceased';
          continue;
        }
        p.events.push(e);
      }
    }
    if (p.events.length === 0 && val(child(r, 'DEAT')) === 'Y') p.living = 'deceased';
    const bio = childrenTag(r, 'NOTE')
      .map((n) => noteText(n))
      .filter(Boolean)
      .join('\n\n');
    if (bio) p.bio = bio;
    const living = val(child(r, '_LIVING'));
    if (living === 'Y') p.living = 'living';
    if (living === 'N') p.living = 'deceased';
    if (val(child(r, '_PLACEHOLDER')) === 'Y') p.placeholder = true;
    for (const l of childrenTag(r, '_LINK')) p.links.push({ id: uid('l'), url: l.value, label: val(child(l, '_LABEL')) ?? l.value });
    for (const w of childrenTag(r, 'WWW')) p.links.push({ id: uid('l'), url: w.value, label: w.value });
    for (const s of childrenTag(r, '_SOCIAL')) p.socials.push({ id: uid('s'), handle: s.value, platform: val(child(s, '_PLATFORM')) ?? 'other' });
    for (const o of childrenTag(r, 'OBJE')) {
      const file = val(child(o, 'FILE')) ?? '';
      if (/^https?:\/\//i.test(file)) p.media.push({ id: uid('m'), kind: 'image', data: file, caption: val(child(o, 'TITL')) });
    }
    // Conflicting records of the same vital event: mark extras disputed
    for (const t of ['birth', 'death'] as const) {
      const evs = p.events.filter((e) => e.type === t);
      if (evs.length > 1 && !evs.some((e) => e.disputed)) evs.slice(1).forEach((e) => (e.disputed = true));
    }
    const kinds = new Map<string, ChildKind>();
    for (const fc of childrenTag(r, 'FAMC')) {
      const pedi = val(child(fc, 'PEDI'))?.toLowerCase();
      const kind: ChildKind = pedi === 'adopted' ? 'adopted' : pedi === 'foster' ? 'foster' : pedi === 'step' ? 'step' : 'birth';
      kinds.set(fc.value, kind);
    }
    famcKinds.set(r.xref, kinds);
    tree.people[p.id] = p;
  }

  for (const r of roots) {
    if (r.tag !== 'FAM' || !r.xref) continue;
    const f: Family = newFamily();
    for (const tag of ['HUSB', 'WIFE']) {
      for (const n of childrenTag(r, tag)) {
        const id = idOf.get(n.value);
        if (id && !f.partners.includes(id)) f.partners.push(id);
        else if (!id) warnings.push(`Family ${r.xref} refers to missing person ${n.value}`);
      }
    }
    for (const n of childrenTag(r, 'CHIL')) {
      const id = idOf.get(n.value);
      if (!id) {
        warnings.push(`Family ${r.xref} refers to missing child ${n.value}`);
        continue;
      }
      const relPedi = val(child(n, '_FREL')) ?? val(child(n, '_MREL'));
      let kind = famcKinds.get(n.value)?.get(r.xref) ?? 'birth';
      if (relPedi && /adopt/i.test(relPedi)) kind = 'adopted';
      if (relPedi && /step/i.test(relPedi)) kind = 'step';
      if (relPedi && /foster/i.test(relPedi)) kind = 'foster';
      if (!f.children.some((c) => c.id === id)) f.children.push({ id, kind });
    }
    const marr = child(r, 'MARR');
    if (marr) {
      f.date = gedDateToUser(val(child(marr, 'DATE')));
      f.place = val(child(marr, 'PLAC'));
    }
    const stat = val(child(r, '_STAT'))?.toLowerCase() as FamilyStatus | undefined;
    if (child(r, 'DIV')) f.status = 'divorced';
    else if (stat && ['married', 'partners', 'divorced', 'widowed', 'unknown'].includes(stat)) f.status = stat;
    else f.status = marr ? 'married' : 'unknown';
    f.manualOrder = val(child(r, '_MANUAL')) === 'Y';
    if (f.partners.length + f.children.length === 0) continue;
    tree.families[f.id] = f;
  }

  const homeX = head && val(child(head, '_HOME'));
  tree.homeId = (homeX && idOf.get(homeX)) || Object.keys(tree.people)[0];
  return { tree, people: Object.keys(tree.people).length, families: Object.keys(tree.families).length, warnings };
}

// ---------- export ----------

const MAX_LINE = 200;

function emit(out: string[], level: number, tag: string, value?: string, xref?: string) {
  const prefix = `${level}${xref ? ' ' + xref : ''} ${tag}`;
  if (value === undefined || value === '') {
    out.push(prefix);
    return;
  }
  const parts = value.replace(/\r\n?/g, '\n').split('\n');
  parts.forEach((part, i) => {
    const chunks: string[] = [];
    let rest = part;
    while (rest.length > MAX_LINE) {
      // avoid splitting on a space (CONC joins without spaces)
      let cut = MAX_LINE;
      while (cut > 1 && (rest[cut - 1] === ' ' || rest[cut] === ' ')) cut--;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    chunks.push(rest);
    chunks.forEach((c, j) => {
      if (i === 0 && j === 0) out.push(`${prefix} ${c}`.trimEnd());
      else out.push(`${level + 1} ${j === 0 ? 'CONT' : 'CONC'}${c ? ' ' + c : ''}`);
    });
  });
}

function gedDate(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const p = parseDate(raw);
  return p.valid ? p.gedcom : `(${raw.trim()})`;
}

const QUAY: Record<Confidence, string> = { confirmed: '3', probable: '2', story: '1' };

export interface ExportOptions {
  redactLiving?: boolean;
}

export function exportGedcom(tree: TreeData, opts: ExportOptions = {}): string {
  const out: string[] = [];
  const xref = new Map<string, string>();
  Object.keys(tree.people).forEach((id, i) => xref.set(id, `@I${i + 1}@`));
  const fx = new Map<string, string>();
  Object.keys(tree.families).forEach((id, i) => fx.set(id, `@F${i + 1}@`));

  emit(out, 0, 'HEAD');
  emit(out, 1, 'SOUR', 'FAMILY_TREE_APP');
  emit(out, 2, 'NAME', 'Family Tree');
  emit(out, 1, 'GEDC');
  emit(out, 2, 'VERS', '5.5.1');
  emit(out, 2, 'FORM', 'LINEAGE-LINKED');
  emit(out, 1, 'CHAR', 'UTF-8');
  emit(out, 1, 'SUBM', '@SUB1@');
  emit(out, 1, '_TREE', tree.name);
  if (tree.homeId && xref.get(tree.homeId)) emit(out, 1, '_HOME', xref.get(tree.homeId));
  emit(out, 0, 'SUBM', undefined, '@SUB1@');
  emit(out, 1, 'NAME', 'Family Tree user');

  const living = (p: Person) => opts.redactLiving && isLivingForExport(p);

  for (const p of Object.values(tree.people)) {
    emit(out, 0, 'INDI', undefined, xref.get(p.id));
    if (living(p)) {
      emit(out, 1, 'NAME', `Living /${p.surname}/`);
      emit(out, 1, 'SEX', sexCode(p));
      emit(out, 1, '_LIVING', 'Y');
    } else {
      const primarySurname = p.birthSurname || p.surname;
      emit(out, 1, 'NAME', `${p.given} /${primarySurname}/`.trim());
      if (p.given) emit(out, 2, 'GIVN', p.given);
      if (primarySurname) emit(out, 2, 'SURN', primarySurname);
      if (p.title) emit(out, 2, 'NPFX', p.title);
      if (p.birthSurname && p.birthSurname !== p.surname) {
        emit(out, 1, 'NAME', `${p.given} /${p.surname}/`.trim());
        emit(out, 2, 'TYPE', 'married');
      }
      for (const n of p.otherNames) {
        const parts = n.trim().split(/\s+/);
        const sur = parts.length > 1 ? parts.pop() : '';
        emit(out, 1, 'NAME', `${parts.join(' ')}${sur ? ` /${sur}/` : ''}`);
        emit(out, 2, 'TYPE', 'aka');
      }
      emit(out, 1, 'SEX', sexCode(p));
      if (p.living !== 'auto') emit(out, 1, '_LIVING', p.living === 'living' ? 'Y' : 'N');
      if (p.placeholder) emit(out, 1, '_PLACEHOLDER', 'Y');
      if (p.occupation && !p.events.some((e) => e.type === 'occupation')) emit(out, 1, 'OCCU', p.occupation);
      for (const e of p.events) {
        const tag = TAG_OF[e.type];
        emit(out, 1, tag, e.type === 'occupation' ? e.label ?? p.occupation : undefined);
        if (e.type === 'custom' && e.label) emit(out, 2, 'TYPE', e.label);
        const d = gedDate(e.date);
        if (d) emit(out, 2, 'DATE', d);
        if (e.place) emit(out, 2, 'PLAC', e.place);
        if (e.note) emit(out, 2, 'NOTE', e.note);
        if (e.source) {
          emit(out, 2, 'SOUR', e.source);
          emit(out, 3, 'QUAY', QUAY[e.confidence]);
        } else if (e.confidence !== 'confirmed') emit(out, 2, '_CONF', e.confidence);
        if (e.disputed) emit(out, 2, '_DISPUTED', 'Y');
      }
      if (p.living === 'deceased' && !p.events.some((e) => e.type === 'death')) emit(out, 1, 'DEAT', 'Y');
      if (p.bio) emit(out, 1, 'NOTE', p.bio);
      for (const l of p.links) {
        emit(out, 1, '_LINK', l.url);
        if (l.label && l.label !== l.url) emit(out, 2, '_LABEL', l.label);
      }
      for (const s of p.socials) {
        emit(out, 1, '_SOCIAL', s.handle);
        emit(out, 2, '_PLATFORM', s.platform);
      }
      for (const m of p.media)
        if (/^https?:/i.test(m.data)) {
          emit(out, 1, 'OBJE');
          emit(out, 2, 'FILE', m.data);
          if (m.caption) emit(out, 3, 'TITL', m.caption);
        }
    }
    for (const f of Object.values(tree.families)) {
      const c = f.children.find((x) => x.id === p.id);
      if (c) {
        emit(out, 1, 'FAMC', fx.get(f.id));
        emit(out, 2, 'PEDI', c.kind);
      }
      if (f.partners.includes(p.id)) emit(out, 1, 'FAMS', fx.get(f.id));
    }
  }

  for (const f of Object.values(tree.families)) {
    emit(out, 0, 'FAM', undefined, fx.get(f.id));
    const [a, b] = f.partners.map((id) => tree.people[id]).filter(Boolean);
    let husb = a;
    let wife = b;
    if (a && b && a.sex === 'female' && b.sex !== 'female') [husb, wife] = [b, a];
    if (a && !b && a.sex === 'female') [husb, wife] = [undefined as unknown as Person, a];
    if (husb) emit(out, 1, 'HUSB', xref.get(husb.id));
    if (wife) emit(out, 1, 'WIFE', xref.get(wife.id));
    for (const c of f.children) {
      emit(out, 1, 'CHIL', xref.get(c.id));
      if (c.kind !== 'birth') {
        const rel = c.kind === 'adopted' ? 'Adopted' : c.kind === 'foster' ? 'Foster' : 'Step';
        emit(out, 2, '_FREL', rel);
        emit(out, 2, '_MREL', rel);
      }
    }
    const redactFam = opts.redactLiving && f.partners.some((id) => tree.people[id] && isLivingForExport(tree.people[id]));
    if (!redactFam && (f.date || f.place || f.status === 'married' || f.status === 'divorced' || f.status === 'widowed')) {
      emit(out, 1, 'MARR');
      const d = gedDate(f.date);
      if (d) emit(out, 2, 'DATE', d);
      if (f.place) emit(out, 2, 'PLAC', f.place);
    }
    if (f.status === 'divorced') emit(out, 1, 'DIV', 'Y');
    emit(out, 1, '_STAT', f.status);
    if (f.manualOrder) emit(out, 1, '_MANUAL', 'Y');
  }
  emit(out, 0, 'TRLR');
  return out.join('\n') + '\n';
}

function isLivingForExport(p: Person) {
  return isLiving(p);
}

function sexCode(p: Person) {
  return p.sex === 'male' ? 'M' : p.sex === 'female' ? 'F' : p.sex === 'other' ? 'X' : 'U';
}
