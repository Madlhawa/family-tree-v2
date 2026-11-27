import { emptyTree, newEvent, newFamily, newPerson } from '../model/people';
import type { ChildKind, FamilyStatus, Person, Sex, TreeData } from '../model/types';

/** Tiny builder for test trees. */
export class TB {
  tree: TreeData = emptyTree('Test');
  p(id: string, sex: Sex = 'unknown', born?: string, extra: Partial<Person> = {}): string {
    const [given, surname = 'Test'] = id.split('_');
    this.tree.people[id] = newPerson({
      id,
      given,
      surname,
      sex,
      events: born ? [newEvent({ type: 'birth', date: born })] : [],
      ...extra,
    });
    this.tree.homeId ??= id;
    return id;
  }
  fam(
    id: string,
    partners: string[],
    children: (string | [string, ChildKind])[] = [],
    status: FamilyStatus = 'married',
    manualOrder = false,
  ) {
    this.tree.families[id] = newFamily({
      id,
      partners,
      children: children.map((c) => (typeof c === 'string' ? { id: c, kind: 'birth' } : { id: c[0], kind: c[1] })),
      status,
      manualOrder,
    });
    return id;
  }
}
