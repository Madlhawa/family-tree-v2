/**
 * Mutations on a TreeData. They mutate in place so they work on Immer drafts
 * (and on plain objects in tests via `produce`).
 */
import { birthFamily, isAncestor, parentFamiliesOf, partnerFamiliesOf, primaryParentFamily, sortChildrenByBirth } from './graph';
import { newFamily, newPerson } from './people';
import type { ChildKind, Family, Person, TreeData } from './types';

export type Relation = 'parent' | 'child' | 'spouse' | 'sibling';

export interface AddOptions {
  /** For children: which family (partner) the child belongs to. */
  familyId?: string;
  /** For parents when two birth parents exist already. */
  parentKind?: ChildKind;
  /** Child relationship kind (default birth). */
  childKind?: ChildKind;
}

export interface AddResult {
  personId: string;
  familyId?: string;
  createdPlaceholderId?: string;
  note?: string;
}

export class RelationError extends Error {}

function touch(f: Family | Person) {
  f.updatedAt = Date.now();
}

export function addPerson(tree: TreeData, init: Partial<Person>): Person {
  const p = newPerson(init);
  tree.people[p.id] = p;
  if (!tree.homeId) tree.homeId = p.id;
  return p;
}

function addFamily(tree: TreeData, init: Partial<Family>): Family {
  const f = newFamily(init);
  tree.families[f.id] = f;
  return f;
}

/** What "+ Parent" will do for this child — used by the add form to explain itself. */
export function parentPlan(tree: TreeData, childId: string): {
  defaultSex: 'male' | 'female';
  mode: 'new-family' | 'second-parent' | 'extra-parent';
  family?: Family;
} {
  const bf = birthFamily(tree, childId);
  if (!bf) return { defaultSex: 'male', mode: 'new-family' };
  if (bf.partners.length >= 2) return { defaultSex: 'male', mode: 'extra-parent', family: bf };
  const existing = tree.people[bf.partners[0]];
  const defaultSex = existing?.sex === 'male' ? 'female' : existing?.sex === 'female' ? 'male' : 'female';
  return { defaultSex: bf.partners.length === 0 ? 'male' : defaultSex, mode: 'second-parent', family: bf };
}

export function canLink(tree: TreeData, anchorId: string, rel: Relation, otherId: string): string | null {
  if (anchorId === otherId) return "A person can't be related to themselves this way.";
  if (rel === 'parent' && isAncestor(tree, anchorId, otherId)) return 'That person is a descendant — they can’t also be a parent.';
  if (rel === 'child' && isAncestor(tree, otherId, anchorId)) return 'That person is an ancestor — they can’t also be a child.';
  if (rel === 'parent' && parentFamiliesOf(tree, anchorId).some((l) => l.family.partners.includes(otherId)))
    return 'Already a parent.';
  if (rel === 'child' && partnerFamiliesOf(tree, anchorId).some((f) => f.children.some((c) => c.id === otherId)))
    return 'Already a child.';
  if (rel === 'spouse' && partnerFamiliesOf(tree, anchorId).some((f) => f.partners.includes(otherId))) return 'Already a partner.';
  return null;
}

/**
 * Add a relative of `anchorId`: either a new person (object) or an existing person (id).
 */
export function addRelative(
  tree: TreeData,
  anchorId: string,
  rel: Relation,
  who: Partial<Person> | string,
  opts: AddOptions = {},
): AddResult {
  if (!tree.people[anchorId]) throw new RelationError('Unknown person');
  let personId: string;
  if (typeof who === 'string') {
    if (!tree.people[who]) throw new RelationError('Unknown person');
    const err = canLink(tree, anchorId, rel, who);
    if (err) throw new RelationError(err);
    personId = who;
  } else {
    personId = addPerson(tree, who).id;
  }

  switch (rel) {
    case 'parent': {
      const plan = parentPlan(tree, anchorId);
      if (plan.mode === 'new-family') {
        const f = addFamily(tree, { partners: [personId], children: [{ id: anchorId, kind: 'birth' }], status: 'married' });
        return { personId, familyId: f.id };
      }
      if (plan.mode === 'second-parent') {
        const f = tree.families[plan.family!.id];
        f.partners.push(personId);
        touch(f);
        return { personId, familyId: f.id };
      }
      const kind = opts.parentKind ?? 'step';
      const f = addFamily(tree, { partners: [personId], children: [{ id: anchorId, kind }], status: 'unknown' });
      return {
        personId,
        familyId: f.id,
        note: `Two birth parents are already recorded, so this person was added as ${kind === 'adopted' ? 'an adoptive' : 'a step'} parent.`,
      };
    }
    case 'spouse': {
      // A new partner of someone who has children without a second parent becomes their other parent.
      const single = partnerFamiliesOf(tree, anchorId).find((f) => f.partners.length === 1 && f.children.length > 0);
      if (single) {
        const f = tree.families[single.id];
        f.partners.push(personId);
        touch(f);
        return { personId, familyId: f.id, note: 'Also added as the other parent of the children.' };
      }
      const f = addFamily(tree, { partners: [anchorId, personId], status: 'married' });
      return { personId, familyId: f.id };
    }
    case 'child': {
      const fams = partnerFamiliesOf(tree, anchorId);
      let f: Family | undefined = opts.familyId ? tree.families[opts.familyId] : undefined;
      if (!f) f = fams.length ? tree.families[fams[fams.length - 1].id] : undefined;
      if (!f) f = addFamily(tree, { partners: [anchorId], status: 'unknown' });
      f.children.push({ id: personId, kind: opts.childKind ?? 'birth' });
      touch(f);
      return { personId, familyId: f.id };
    }
    case 'sibling': {
      let f = primaryParentFamily(tree, anchorId);
      let createdPlaceholderId: string | undefined;
      if (!f) {
        // Siblings with no recorded parents get an "unknown parent" placeholder, so they stay connected.
        const ph = addPerson(tree, { placeholder: true, given: '', surname: tree.people[anchorId].surname, sex: 'unknown', living: 'deceased' });
        createdPlaceholderId = ph.id;
        f = addFamily(tree, { partners: [ph.id], children: [{ id: anchorId, kind: 'birth' }], status: 'unknown' });
      } else {
        f = tree.families[f.id];
      }
      f.children.push({ id: personId, kind: 'birth' });
      touch(f);
      return { personId, familyId: f.id, createdPlaceholderId };
    }
  }
}

export function updatePerson(tree: TreeData, id: string, patch: Partial<Person>) {
  const p = tree.people[id];
  if (!p) return;
  Object.assign(p, patch, { id, updatedAt: Date.now() });
  if (patch.given || patch.surname) p.placeholder = false;
}

export function updateFamily(tree: TreeData, id: string, patch: Partial<Family>) {
  const f = tree.families[id];
  if (!f) return;
  Object.assign(f, patch, { id, updatedAt: Date.now() });
}

/** Remove families that no longer connect anything. */
export function pruneFamilies(tree: TreeData) {
  for (const f of Object.values(tree.families)) {
    f.partners = f.partners.filter((p) => tree.people[p]);
    f.children = f.children.filter((c) => tree.people[c.id]);
    const links = f.partners.length + f.children.length;
    if (links <= 1) delete tree.families[f.id];
  }
  // Orphaned placeholders (only linked to nothing / a single person through a childless family)
  for (const p of Object.values(tree.people)) {
    if (!p.placeholder) continue;
    const fams = Object.values(tree.families).filter((f) => f.partners.includes(p.id) || f.children.some((c) => c.id === p.id));
    if (fams.length === 0) delete tree.people[p.id];
  }
}

export function deletePerson(tree: TreeData, id: string) {
  delete tree.people[id];
  for (const f of Object.values(tree.families)) {
    f.partners = f.partners.filter((p) => p !== id);
    f.children = f.children.filter((c) => c.id !== id);
  }
  pruneFamilies(tree);
  if (tree.homeId === id) tree.homeId = Object.keys(tree.people)[0];
  for (const s of tree.stories) s.steps = s.steps.filter((st) => st.personId !== id);
}

export function unlinkChild(tree: TreeData, familyId: string, childId: string) {
  const f = tree.families[familyId];
  if (!f) return;
  f.children = f.children.filter((c) => c.id !== childId);
  touch(f);
  pruneFamilies(tree);
}

export function unlinkPartner(tree: TreeData, familyId: string, personId: string) {
  const f = tree.families[familyId];
  if (!f) return;
  f.partners = f.partners.filter((p) => p !== personId);
  touch(f);
  pruneFamilies(tree);
}

export function setChildKind(tree: TreeData, familyId: string, childId: string, kind: ChildKind) {
  const c = tree.families[familyId]?.children.find((x) => x.id === childId);
  if (c) c.kind = kind;
}

/** Save a manual sibling order. `order` lists child ids; missing ones keep relative order at the end. */
export function reorderChildren(tree: TreeData, familyId: string, order: string[]) {
  const f = tree.families[familyId];
  if (!f) return;
  const byId = new Map(f.children.map((c) => [c.id, c]));
  const next = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  for (const c of f.children) if (!order.includes(c.id)) next.push(c);
  f.children = next;
  f.manualOrder = true;
  touch(f);
}

export function sortByBirth(tree: TreeData, familyId: string) {
  const f = tree.families[familyId];
  if (!f) return;
  f.children = sortChildrenByBirth(tree, f.children);
  f.manualOrder = false;
  touch(f);
}

export function moveChild(tree: TreeData, familyId: string, childId: string, delta: -1 | 1) {
  const f = tree.families[familyId];
  if (!f) return;
  const ordered = f.manualOrder ? f.children : sortChildrenByBirth(tree, f.children);
  const ids = ordered.map((c) => c.id);
  const i = ids.indexOf(childId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  reorderChildren(tree, familyId, ids);
}

export type MergeChoice = Partial<Record<'given' | 'surname' | 'birthSurname' | 'sex' | 'occupation' | 'bio' | 'photo' | 'title' | 'living', 'keep' | 'drop'>>;

/**
 * Merge `dropId` into `keepId`. Field choices pick which side wins; lists are united.
 * Family references are re-pointed and duplicate families merged.
 */
export function mergePeople(tree: TreeData, keepId: string, dropId: string, choice: MergeChoice = {}) {
  const keep = tree.people[keepId];
  const drop = tree.people[dropId];
  if (!keep || !drop || keepId === dropId) return;
  const fields = ['given', 'surname', 'birthSurname', 'sex', 'occupation', 'bio', 'photo', 'title', 'living'] as const;
  for (const k of fields) {
    const side = choice[k] ?? (isEmpty(keep[k]) ? 'drop' : 'keep');
    if (side === 'drop' && !isEmpty(drop[k])) (keep as unknown as Record<string, unknown>)[k] = drop[k];
  }
  if (keep.sex === 'unknown' && drop.sex !== 'unknown') keep.sex = drop.sex;
  keep.otherNames = unique([...keep.otherNames, ...drop.otherNames]);
  // events: keep all; identical (type+date+place) collapse; conflicting birth/death become disputed
  const key = (e: Person['events'][number]) => `${e.type}|${(e.date ?? '').trim().toLowerCase()}|${(e.place ?? '').trim().toLowerCase()}|${e.label ?? ''}`;
  const seen = new Set(keep.events.map(key));
  for (const e of drop.events) if (!seen.has(key(e))) keep.events.push({ ...e });
  for (const t of ['birth', 'death'] as const) {
    const evs = keep.events.filter((e) => e.type === t);
    const dates = new Set(evs.map((e) => (e.date ?? '').trim()).filter(Boolean));
    if (dates.size > 1) evs.slice(1).forEach((e) => (e.disputed = true));
  }
  const mediaSeen = new Set(keep.media.map((m) => m.data));
  for (const m of drop.media) if (!mediaSeen.has(m.data)) keep.media.push(m);
  const linkSeen = new Set(keep.links.map((l) => l.url));
  for (const l of drop.links) if (!linkSeen.has(l.url)) keep.links.push(l);
  const socSeen = new Set(keep.socials.map((s) => `${s.platform}:${s.handle}`));
  for (const s of drop.socials) if (!socSeen.has(`${s.platform}:${s.handle}`)) keep.socials.push(s);
  keep.placeholder = keep.placeholder && drop.placeholder;
  keep.updatedAt = Date.now();

  for (const f of Object.values(tree.families)) {
    f.partners = unique(f.partners.map((p) => (p === dropId ? keepId : p)));
    const kids: Family['children'] = [];
    for (const c of f.children) {
      const id = c.id === dropId ? keepId : c.id;
      const existing = kids.find((k) => k.id === id);
      if (existing) {
        if (c.kind === 'birth') existing.kind = 'birth';
      } else kids.push({ ...c, id });
    }
    f.children = kids;
  }
  delete tree.people[dropId];
  if (tree.homeId === dropId) tree.homeId = keepId;
  for (const s of tree.stories) for (const st of s.steps) if (st.personId === dropId) st.personId = keepId;
  mergeDuplicateFamilies(tree);
  pruneFamilies(tree);
}

function mergeDuplicateFamilies(tree: TreeData) {
  const byPartners = new Map<string, Family>();
  for (const f of Object.values(tree.families)) {
    if (f.partners.length === 0) continue;
    const k = [...f.partners].sort().join('+');
    const prev = byPartners.get(k);
    if (!prev) {
      byPartners.set(k, f);
      continue;
    }
    for (const c of f.children) if (!prev.children.some((x) => x.id === c.id)) prev.children.push(c);
    prev.date ??= f.date;
    prev.place ??= f.place;
    delete tree.families[f.id];
  }
  // A family with a single partner whose children all also belong to a 2-partner family of the same person → fold in
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === '' || v === 'unknown' || v === 'auto';
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
