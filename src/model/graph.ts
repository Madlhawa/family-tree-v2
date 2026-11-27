import { isDraft } from 'immer';
import { parseDate } from './dates';
import { birthDate } from './people';
import type { ChildKind, Family, Person, TreeData } from './types';

export interface ParentLink {
  family: Family;
  kind: ChildKind;
}

export interface GraphIndex {
  /** families in which the person is a child */
  parentFamilies: Map<string, ParentLink[]>;
  /** families in which the person is a partner */
  partnerFamilies: Map<string, Family[]>;
}

const cache = new WeakMap<TreeData['families'], GraphIndex>();

export function indexOf(tree: TreeData): GraphIndex {
  // Drafts mutate in place, so never cache them.
  const draft = isDraft(tree.families);
  const hit = draft ? undefined : cache.get(tree.families);
  if (hit) return hit;
  const parentFamilies = new Map<string, ParentLink[]>();
  const partnerFamilies = new Map<string, Family[]>();
  for (const f of Object.values(tree.families)) {
    for (const p of f.partners) {
      const arr = partnerFamilies.get(p) ?? [];
      arr.push(f);
      partnerFamilies.set(p, arr);
    }
    for (const c of f.children) {
      const arr = parentFamilies.get(c.id) ?? [];
      arr.push({ family: f, kind: c.kind });
      parentFamilies.set(c.id, arr);
    }
  }
  // Birth family first
  for (const arr of parentFamilies.values()) arr.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
  for (const [pid, arr] of partnerFamilies) {
    arr.sort((a, b) => (familySortKey(tree, a) ?? 0) - (familySortKey(tree, b) ?? 0));
    partnerFamilies.set(pid, arr);
  }
  const idx = { parentFamilies, partnerFamilies };
  if (!draft) cache.set(tree.families, idx);
  return idx;
}

function kindRank(k: ChildKind) {
  return k === 'birth' ? 0 : k === 'adopted' ? 1 : k === 'foster' ? 2 : 3;
}

function familySortKey(tree: TreeData, f: Family): number | undefined {
  const d = f.date ? birthDateFromRaw(f.date) : undefined;
  if (d !== undefined) return d;
  // fall back to the earliest child's birth
  let min: number | undefined;
  for (const c of f.children) {
    const p = tree.people[c.id];
    const k = p ? birthDate(p).sortKey : undefined;
    if (k !== undefined && (min === undefined || k < min)) min = k;
  }
  return min ?? f.createdAt / 1e12;
}

function birthDateFromRaw(raw: string) {
  return parseDate(raw).sortKey;
}

export function parentFamiliesOf(tree: TreeData, id: string): ParentLink[] {
  return indexOf(tree).parentFamilies.get(id) ?? [];
}

export function partnerFamiliesOf(tree: TreeData, id: string): Family[] {
  return indexOf(tree).partnerFamilies.get(id) ?? [];
}

/** The family a person is drawn under: birth family first, else adoptive etc. */
export function primaryParentFamily(tree: TreeData, id: string): Family | undefined {
  return parentFamiliesOf(tree, id)[0]?.family;
}

export function birthFamily(tree: TreeData, id: string): Family | undefined {
  return parentFamiliesOf(tree, id).find((l) => l.kind === 'birth')?.family;
}

export function parentsOf(tree: TreeData, id: string, kinds?: ChildKind[]): { person: Person; kind: ChildKind; family: Family }[] {
  const out: { person: Person; kind: ChildKind; family: Family }[] = [];
  for (const l of parentFamiliesOf(tree, id)) {
    if (kinds && !kinds.includes(l.kind)) continue;
    for (const pid of l.family.partners) {
      const p = tree.people[pid];
      if (p) out.push({ person: p, kind: l.kind, family: l.family });
    }
  }
  return out;
}

export function partnersOf(tree: TreeData, id: string): { person: Person; family: Family }[] {
  const out: { person: Person; family: Family }[] = [];
  for (const f of partnerFamiliesOf(tree, id)) {
    for (const pid of f.partners) {
      if (pid === id) continue;
      const p = tree.people[pid];
      if (p) out.push({ person: p, family: f });
    }
  }
  return out;
}

export function childrenOf(tree: TreeData, id: string): { person: Person; kind: ChildKind; family: Family }[] {
  const out: { person: Person; kind: ChildKind; family: Family }[] = [];
  for (const f of partnerFamiliesOf(tree, id)) {
    for (const c of orderedChildren(tree, f)) {
      const p = tree.people[c.id];
      if (p) out.push({ person: p, kind: c.kind, family: f });
    }
  }
  return out;
}

export interface SiblingInfo {
  person: Person;
  half: boolean;
  step: boolean;
}

export function siblingsOf(tree: TreeData, id: string): SiblingInfo[] {
  const myParents = new Set(parentsOf(tree, id, ['birth', 'adopted']).map((x) => x.person.id));
  const seen = new Map<string, SiblingInfo>();
  for (const l of parentFamiliesOf(tree, id)) {
    for (const c of orderedChildren(tree, l.family)) {
      if (c.id === id || seen.has(c.id)) continue;
      const p = tree.people[c.id];
      if (!p) continue;
      const theirs = new Set(parentsOf(tree, c.id, ['birth', 'adopted']).map((x) => x.person.id));
      const shared = [...myParents].filter((x) => theirs.has(x)).length;
      const step = shared === 0;
      const half = !step && (shared < Math.max(myParents.size, theirs.size) || shared < 2);
      seen.set(c.id, { person: p, half: half && !(shared >= 2), step });
    }
  }
  // half siblings via other families of my parents
  for (const pid of myParents) {
    for (const f of partnerFamiliesOf(tree, pid)) {
      for (const c of f.children) {
        if (c.id === id || seen.has(c.id) || c.kind === 'step') continue;
        const p = tree.people[c.id];
        if (p) seen.set(c.id, { person: p, half: true, step: false });
      }
    }
  }
  return [...seen.values()];
}

/** Children in display order: manual order, or by birth date (unknown keep relative order). */
export function orderedChildren(tree: TreeData, f: Family) {
  if (f.manualOrder) return f.children;
  return sortChildrenByBirth(tree, f.children);
}

export function sortChildrenByBirth<T extends { id: string }>(tree: TreeData, children: T[]): T[] {
  const withKey = children.map((c, i) => ({ c, i, k: tree.people[c.id] ? birthDate(tree.people[c.id]).sortKey : undefined }));
  // Stable: dated children sorted among themselves into the slots, undated keep their positions.
  const dated = withKey.filter((x) => x.k !== undefined).sort((a, b) => a.k! - b.k! || a.i - b.i);
  let di = 0;
  return withKey.map((x) => (x.k === undefined ? x.c : dated[di++].c));
}

export function isAncestor(tree: TreeData, ancestorId: string, ofId: string): boolean {
  const seen = new Set<string>();
  const stack = [ofId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of parentsOf(tree, cur)) {
      if (p.person.id === ancestorId) return true;
      if (!seen.has(p.person.id)) {
        seen.add(p.person.id);
        stack.push(p.person.id);
      }
    }
  }
  return false;
}

/** Everyone connected to `id` by any family link. */
export function connectedIds(tree: TreeData, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    const fams = [...partnerFamiliesOf(tree, cur), ...parentFamiliesOf(tree, cur).map((l) => l.family)];
    for (const f of fams) {
      for (const x of [...f.partners, ...f.children.map((c) => c.id)]) {
        if (!seen.has(x) && tree.people[x]) {
          seen.add(x);
          stack.push(x);
        }
      }
    }
  }
  return seen;
}

export function countAncestors(tree: TreeData, id: string): number {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of parentsOf(tree, cur)) {
      if (!seen.has(p.person.id)) {
        seen.add(p.person.id);
        stack.push(p.person.id);
      }
    }
  }
  return seen.size;
}

export function countDescendants(tree: TreeData, id: string): number {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf(tree, cur)) {
      if (!seen.has(c.person.id)) {
        seen.add(c.person.id);
        stack.push(c.person.id);
      }
    }
  }
  return seen.size;
}
