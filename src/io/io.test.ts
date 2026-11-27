import { TB } from '../test/helpers';
import { childrenOf, parentsOf } from '../model/graph';
import { birthOf, fullName, newEvent } from '../model/people';
import { detectFormat, makeBackup, migrateLegacy, restoreBackup } from './backup';
import { exportGedcom, importGedcom, parseLines } from './gedcom';

function sample() {
  const t = new TB();
  t.p('John_Smith', 'male', undefined, {
    occupation: 'Baker',
    bio: 'Line one\nLine two ' + 'x'.repeat(450),
    events: [
      newEvent({ type: 'birth', date: '12 Mar 1902', place: 'Leeds', confidence: 'confirmed', source: 'Parish register' }),
      newEvent({ type: 'birth', date: '1903', place: 'York', confidence: 'story', disputed: true }),
      newEvent({ type: 'death', date: 'c. 1970' }),
      newEvent({ type: 'custom', label: 'Won a prize', date: 'after 1930' }),
    ],
    otherNames: ['Jack Smith'],
    links: [{ id: 'l1', label: 'Obituary', url: 'https://example.com/obit' }],
  });
  t.p('Mary_Smith', 'female', '1905', { birthSurname: 'Jones' });
  t.p('Tom_Smith', 'male', '1930');
  t.p('Ann_Smith', 'female', '1932');
  t.p('Fos_Smith', 'male', '1940');
  t.fam('F1', ['John_Smith', 'Mary_Smith'], ['Ann_Smith', 'Tom_Smith', ['Fos_Smith', 'foster']], 'married', true);
  t.tree.families.F1.date = '1928';
  t.tree.families.F1.place = 'Leeds';
  return t.tree;
}

describe('GEDCOM', () => {
  it('round-trips people, families and details', () => {
    const tree = sample();
    const ged = exportGedcom(tree);
    expect(ged).toMatch(/^0 HEAD/);
    expect(ged).toContain('1 NAME John /Smith/');
    expect(ged).toContain('2 DATE 12 MAR 1902');
    expect(ged).toContain('2 DATE ABT 1970');
    expect(ged).toContain('2 PEDI foster');
    expect(ged.split('\n').every((l) => l.length <= 255)).toBe(true);
    expect(ged).toMatch(/\n\d CONC /);
    expect(ged).toMatch(/\n\d CONT /);

    const { tree: back, people, families } = importGedcom(ged);
    expect(people).toBe(5);
    expect(families).toBe(1);
    const byName = (n: string) => Object.values(back.people).find((p) => fullName(p) === n)!;
    const john = byName('John Smith');
    expect(john.occupation).toBe('Baker');
    expect(john.bio).toBe(tree.people.John_Smith.bio);
    expect(john.otherNames).toContain('Jack Smith');
    expect(john.links[0].url).toBe('https://example.com/obit');
    const births = john.events.filter((e) => e.type === 'birth');
    expect(births).toHaveLength(2);
    expect(births[0]).toMatchObject({ date: '12 Mar 1902', place: 'Leeds', source: 'Parish register', confidence: 'confirmed' });
    expect(births[1]).toMatchObject({ disputed: true, confidence: 'story' });
    expect(john.events.find((e) => e.type === 'custom')).toMatchObject({ label: 'Won a prize', date: 'after 1930' });
    const mary = byName('Mary Smith');
    expect(mary.birthSurname).toBe('Jones');
    expect(birthOf(mary)?.date).toBe('1905');
    const kids = childrenOf(back, john.id);
    expect(kids.map((k) => k.person.given)).toEqual(['Ann', 'Tom', 'Fos']); // manual order kept
    expect(kids.find((k) => k.person.given === 'Fos')!.kind).toBe('foster');
    const fam = Object.values(back.families)[0];
    expect(fam).toMatchObject({ date: '1928', place: 'Leeds', status: 'married', manualOrder: true });

    // second round trip is stable
    expect(exportGedcom(back).replace(/@\w+@/g, '')).toBe(ged.replace(/@\w+@/g, ''));
  });

  it('joins CONC/CONT lines', () => {
    const nodes = parseLines('0 @N1@ NOTE Hello\n1 CONC  world\n1 CONT second line\n0 TRLR');
    expect(nodes[0].value).toBe('Hello world\nsecond line');
  });

  it('reads adoption pedigree from other programs', () => {
    const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Ann /Lee/
1 SEX F
1 BIRT
2 DATE BET 1850 AND 1855
1 FAMS @F1@
0 @I2@ INDI
1 NAME Kim /Lee/
1 FAMC @F1@
2 PEDI adopted
0 @F1@ FAM
1 WIFE @I1@
1 CHIL @I2@
0 TRLR`;
    const { tree } = importGedcom(ged);
    const kim = Object.values(tree.people).find((p) => p.given === 'Kim')!;
    expect(parentsOf(tree, kim.id)[0].kind).toBe('adopted');
    const ann = Object.values(tree.people).find((p) => p.given === 'Ann')!;
    expect(birthOf(ann)?.date).toBe('1850–1855');
  });

  it('redacts living people', () => {
    const t = new TB();
    t.p('Alive_Person', 'female', '1990');
    t.p('Old_Person', 'male', '1850');
    const ged = exportGedcom(t.tree, { redactLiving: true });
    expect(ged).toContain('1 NAME Living /Person/');
    expect(ged).not.toContain('1990');
    expect(ged).toContain('DATE 1850');
  });
});

describe('JSON backup', () => {
  it('restores into a new tree id', () => {
    const tree = sample();
    const text = JSON.stringify(makeBackup(tree));
    expect(detectFormat(text)).toBe('backup');
    const back = restoreBackup(text);
    expect(back.id).not.toBe(tree.id);
    expect(Object.keys(back.people)).toHaveLength(5);
    expect(back.families.F1.children.map((c) => c.id)).toEqual(tree.families.F1.children.map((c) => c.id));
  });
});

describe('Dynasty Chronicle migration', () => {
  it('maps the old shape', () => {
    const legacy = {
      version: 1,
      name: 'House Ashcombe',
      motto: 'Ever onward',
      rootId: 'a',
      people: {
        a: {
          id: 'a', given: 'Edmund', surname: 'Ashcombe', sex: 'M', living: 'deceased', epithet: 'the Bold',
          altNames: ['Ned'], portrait: 'data:image/png;base64,AAA',
          events: [{ type: 'birth', date: 'c. 1820', confidence: 'legend' }, { type: 'title', date: '1850', label: 'Baronet' }],
          media: [], links: [], socials: [], arms: { field: 'azure' },
        },
        b: { id: 'b', given: 'Clara', surname: 'Ashcombe', birthSurname: 'Wren', sex: 'F', living: 'auto', events: [] },
        c: { id: 'c', given: 'Hal', surname: 'Ashcombe', sex: 'U', living: 'auto', events: [] },
      },
      unions: { u1: { partners: ['a', 'b'], children: [{ id: 'c', kind: 'adopted' }], status: 'married', date: '1845' } },
      houses: { Ashcombe: { surname: 'Ashcombe' } },
      heirlooms: { h: { name: 'Ring', custodians: ['a'] } },
      sagas: { s: { title: 'The rise', steps: [{ personId: 'a', caption: 'It began' }] } },
      annals: [],
    };
    const text = JSON.stringify(legacy);
    expect(detectFormat(text)).toBe('legacy');
    const { tree } = migrateLegacy(text);
    const a = tree.people.a;
    expect(a.sex).toBe('male');
    expect(a.otherNames).toEqual(['the Bold', 'Ned']);
    expect(a.photo).toBe('data:image/png;base64,AAA');
    expect(a.events[0]).toMatchObject({ type: 'birth', confidence: 'story' });
    expect(a.events[1]).toMatchObject({ type: 'custom', label: 'Baronet' });
    expect(a.events.some((e) => e.label === 'Heirloom: Ring')).toBe(true);
    expect('arms' in a).toBe(false);
    expect(tree.people.b.birthSurname).toBe('Wren');
    expect(parentsOf(tree, 'c')[0].kind).toBe('adopted');
    expect(tree.stories[0].title).toBe('The rise');
    expect(tree.homeId).toBe('a');
  });
});
