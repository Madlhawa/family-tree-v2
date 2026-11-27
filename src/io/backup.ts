/**
 * JSON backup / restore, plus migration from the previous app ("Dynasty Chronicle").
 */
import { emptyTree, isLiving, newEvent, newFamily, newPerson, uid } from '../model/people';
import type { Confidence, EventType, LifeEvent, Person, TreeData } from '../model/types';
import { EVENT_TYPES } from '../model/types';

export const BACKUP_FORMAT = 'family-tree-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  tree: TreeData;
}

export function makeBackup(tree: TreeData, opts: { redactLiving?: boolean } = {}): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    tree: opts.redactLiving ? redactLiving(tree) : tree,
  };
}

export function redactLiving(tree: TreeData): TreeData {
  const copy: TreeData = JSON.parse(JSON.stringify(tree));
  for (const p of Object.values(copy.people)) {
    if (!isLiving(p)) continue;
    copy.people[p.id] = {
      ...newPerson({ id: p.id, sex: p.sex, surname: p.surname, living: 'living' }),
      given: 'Living',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
  for (const f of Object.values(copy.families)) {
    if (f.partners.some((id) => copy.people[id]?.living === 'living' && copy.people[id]?.given === 'Living')) {
      delete f.date;
      delete f.place;
    }
  }
  return copy;
}

export type DetectedFormat = 'backup' | 'legacy' | 'gedcom' | 'unknown';

export function detectFormat(text: string): DetectedFormat {
  const t = text.trimStart().replace(/^﻿/, '');
  if (/^0\s+HEAD/i.test(t)) return 'gedcom';
  if (!t.startsWith('{')) return 'unknown';
  try {
    const j = JSON.parse(t);
    if (j?.format === BACKUP_FORMAT && j.tree) return 'backup';
    if (j?.version === 2 && j.people && j.families) return 'backup';
    if (j?.version === 1 && j.people && j.unions) return 'legacy';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

/** Restore a backup into a *new* tree (fresh id so nothing gets overwritten). */
export function restoreBackup(text: string): TreeData {
  const j = JSON.parse(text);
  const src: TreeData = j.format === BACKUP_FORMAT ? j.tree : j;
  if (!src || typeof src !== 'object' || !src.people || !src.families) throw new Error('This file is not a family tree backup.');
  const tree = sanitizeTree(src);
  tree.id = uid('t');
  return tree;
}

/** Defensive normalisation of anything loaded from outside. */
export function sanitizeTree(src: TreeData): TreeData {
  const tree = emptyTree(String(src.name ?? 'Restored tree'));
  tree.homeId = src.homeId;
  tree.createdAt = Number(src.createdAt) || Date.now();
  for (const [id, raw] of Object.entries(src.people ?? {})) {
    const p = newPerson({ ...raw, id });
    p.otherNames = Array.isArray(raw.otherNames) ? raw.otherNames.map(String) : [];
    p.events = Array.isArray(raw.events)
      ? raw.events.map((e) => ({ ...newEvent({ type: (EVENT_TYPES as readonly string[]).includes(e.type) ? e.type : 'custom' }), ...e }))
      : [];
    p.media = Array.isArray(raw.media) ? raw.media : [];
    p.links = Array.isArray(raw.links) ? raw.links : [];
    p.socials = Array.isArray(raw.socials) ? raw.socials : [];
    tree.people[id] = p;
  }
  for (const [id, raw] of Object.entries(src.families ?? {})) {
    const f = newFamily({ ...raw, id });
    f.partners = (raw.partners ?? []).filter((x) => tree.people[x]).slice(0, 2);
    f.children = (raw.children ?? []).filter((c) => tree.people[c.id]);
    f.manualOrder = !!raw.manualOrder;
    tree.families[id] = f;
  }
  tree.stories = Array.isArray(src.stories) ? src.stories : [];
  if (!tree.homeId || !tree.people[tree.homeId]) tree.homeId = Object.keys(tree.people)[0];
  return tree;
}

// ---------- Dynasty Chronicle (v1) migration ----------

interface LegacyEvent {
  type: string;
  date?: string;
  place?: string;
  note?: string;
  confidence?: 'verified' | 'probable' | 'legend';
  source?: string;
  label?: string;
}
interface LegacyPerson {
  id?: string;
  given?: string;
  surname?: string;
  birthSurname?: string;
  altNames?: string[];
  title?: string;
  epithet?: string;
  sex?: 'M' | 'F' | 'U';
  living?: 'auto' | 'living' | 'deceased';
  occupation?: string;
  bio?: string;
  portrait?: string;
  events?: LegacyEvent[];
  media?: { kind: 'image' | 'audio'; data: string; caption?: string }[];
  links?: { label: string; url: string }[];
  socials?: { platform: string; handle: string }[];
  placeholder?: boolean;
  createdAt?: number;
  updatedAt?: number;
}
interface LegacyUnion {
  partners?: string[];
  children?: { id: string; kind: 'birth' | 'adopted' | 'step' | 'foster' }[];
  status?: string;
  date?: string;
  place?: string;
  manualOrder?: boolean;
}
interface LegacyDynasty {
  version: 1;
  name?: string;
  motto?: string;
  rootId?: string;
  people: Record<string, LegacyPerson>;
  unions: Record<string, LegacyUnion>;
  heirlooms?: Record<string, { name: string; description?: string; custodians?: string[] }>;
  sagas?: Record<string, { title: string; steps: { personId: string; caption: string }[] }>;
}

const CONF: Record<string, Confidence> = { verified: 'confirmed', probable: 'probable', legend: 'story' };

export function migrateLegacy(text: string): { tree: TreeData; notes: string[] } {
  const src = JSON.parse(text) as LegacyDynasty;
  if (src.version !== 1 || !src.people || !src.unions) throw new Error('This does not look like a Dynasty Chronicle backup.');
  const tree = emptyTree(src.name || 'Imported family');
  const notes: string[] = [];
  for (const [id, lp] of Object.entries(src.people)) {
    const events: LifeEvent[] = (lp.events ?? []).map((e) => {
      const known = (EVENT_TYPES as readonly string[]).includes(e.type);
      return newEvent({
        type: (known ? e.type : 'custom') as EventType,
        label: known ? e.label : e.label || capitalize(e.type),
        date: e.date,
        place: e.place,
        note: e.note,
        source: e.source,
        confidence: CONF[e.confidence ?? 'verified'] ?? 'confirmed',
      });
    });
    const otherNames = [...(lp.altNames ?? [])];
    if (lp.epithet) otherNames.unshift(lp.epithet);
    const p: Person = newPerson({
      id,
      given: lp.given ?? '',
      surname: lp.surname ?? '',
      birthSurname: lp.birthSurname && lp.birthSurname !== lp.surname ? lp.birthSurname : undefined,
      otherNames,
      title: lp.title,
      sex: lp.sex === 'M' ? 'male' : lp.sex === 'F' ? 'female' : 'unknown',
      living: lp.living ?? 'auto',
      occupation: lp.occupation,
      bio: lp.bio,
      photo: lp.portrait,
      events,
      media: (lp.media ?? []).map((m) => ({ id: uid('m'), kind: m.kind, data: m.data, caption: m.caption })),
      links: (lp.links ?? []).map((l) => ({ id: uid('l'), label: l.label, url: l.url })),
      socials: (lp.socials ?? []).map((s) => ({ id: uid('s'), platform: s.platform, handle: s.handle })),
      placeholder: lp.placeholder,
      createdAt: lp.createdAt ?? Date.now(),
      updatedAt: lp.updatedAt ?? Date.now(),
    });
    tree.people[id] = p;
  }
  for (const [id, u] of Object.entries(src.unions)) {
    const status = ['married', 'partners', 'divorced', 'widowed', 'unknown'].includes(u.status ?? '') ? (u.status as TreeData['families'][string]['status']) : 'unknown';
    tree.families[id] = newFamily({
      id,
      partners: (u.partners ?? []).filter((x) => tree.people[x]).slice(0, 2),
      children: (u.children ?? []).filter((c) => tree.people[c.id]).map((c) => ({ id: c.id, kind: c.kind ?? 'birth' })),
      status,
      date: u.date,
      place: u.place,
      manualOrder: !!u.manualOrder,
    });
  }
  for (const s of Object.values(src.sagas ?? {})) {
    tree.stories.push({ id: uid('st'), title: s.title, steps: (s.steps ?? []).filter((x) => tree.people[x.personId]) });
  }
  // Heirlooms become a custom event on each custodian so nothing is lost.
  for (const h of Object.values(src.heirlooms ?? {})) {
    for (const c of h.custodians ?? []) {
      tree.people[c]?.events.push(newEvent({ type: 'custom', label: `Heirloom: ${h.name}`, note: h.description }));
    }
  }
  if (src.motto) notes.push(`Motto “${src.motto}” was not carried over.`);
  notes.push('Coats of arms and houses are not used in this app and were left out.');
  tree.homeId = src.rootId && tree.people[src.rootId] ? src.rootId : Object.keys(tree.people)[0];
  return { tree, notes };
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
