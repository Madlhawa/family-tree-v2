import { emptyTree, newEvent, newFamily, newPerson } from '../model/people';
import type { ChildKind, Confidence, FamilyStatus, Person, Sex, TreeData } from '../model/types';

type P = [
  id: string,
  given: string,
  surname: string,
  sex: Sex,
  born?: string,
  bornPlace?: string,
  died?: string,
  diedPlace?: string,
  occupation?: string,
  extra?: Partial<Person>,
];

const PEOPLE: P[] = [
  // Generation 1
  ['arthur', 'Arthur', 'Carter', 'male', '3 Feb 1898', 'Leeds, England', '11 Nov 1968', 'Leeds, England', 'Stonemason'],
  ['edith', 'Edith', 'Carter', 'female', 'c. 1901', 'York, England', '1979', 'Leeds, England', 'Seamstress', { birthSurname: 'Hale' }],
  ['tomasz', 'Tomasz', 'Nowak', 'male', '1895', 'Kraków, Poland', '1950', 'Bradford, England', 'Tailor'],
  ['zofia', 'Zofia', 'Nowak', 'female', '1899', 'Kraków, Poland', '1987', 'Bradford, England', 'Baker', { birthSurname: 'Wiśniewska' }],
  // Generation 2
  ['walter', 'Walter', 'Carter', 'male', '14 Jun 1925', 'Leeds, England', '2 Mar 2004', 'Harrogate, England', 'Railway engineer'],
  ['irene', 'Irene', 'Carter', 'female', '1928', 'Bradford, England', '2015', 'Harrogate, England', 'Teacher', { birthSurname: 'Nowak' }],
  ['dorothy', 'Dorothy', 'Price', 'female', '1927', 'Leeds, England', '2011', 'Cardiff, Wales', 'Nurse', { birthSurname: 'Carter' }],
  ['gareth', 'Gareth', 'Price', 'male', '1924', 'Cardiff, Wales', '1999', 'Cardiff, Wales', 'Coal miner'],
  ['stan', 'Stanisław', 'Nowak', 'male', '1931', 'Bradford, England', '1944', 'Bradford, England', undefined, { otherNames: ['Stan'] }],
  ['harold', 'Harold', 'Carter', 'male', '1930', 'Leeds, England', '1931', 'Leeds, England'],
  // Generation 3
  ['david', 'David', 'Carter', 'male', '22 Aug 1952', 'Harrogate, England', undefined, undefined, 'Architect'],
  ['susan', 'Susan', 'Carter', 'female', '9 May 1955', 'Glasgow, Scotland', undefined, undefined, 'Librarian', { birthSurname: 'MacLeod' }],
  ['linda', 'Linda', 'Okafor', 'female', '1957', 'Harrogate, England', undefined, undefined, 'Doctor', { birthSurname: 'Carter' }],
  ['emeka', 'Emeka', 'Okafor', 'male', '1954', 'Enugu, Nigeria', undefined, undefined, 'Civil engineer'],
  ['peter', 'Peter', 'Carter', 'male', '1960', 'Harrogate, England', '2020', 'York, England', 'Musician'],
  ['angela', 'Angela', 'Brooks', 'female', '1962', 'York, England', undefined, undefined, 'Florist'],
  ['rhys', 'Rhys', 'Price', 'male', '1950', 'Cardiff, Wales', undefined, undefined, 'Rugby coach'],
  ['alasdair', 'Alasdair', 'MacLeod', 'male', '1926', 'Isle of Skye, Scotland', '2001', 'Glasgow, Scotland', 'Fisherman'],
  ['morag', 'Morag', 'MacLeod', 'female', '1929', 'Inverness, Scotland', '2019', 'Glasgow, Scotland', 'Shopkeeper', { birthSurname: 'Ross' }],
  ['fiona', 'Fiona', 'MacLeod', 'female', '1958', 'Glasgow, Scotland', undefined, undefined, 'Photographer'],
  // Generation 4
  ['emma', 'Emma', 'Carter', 'female', '17 Mar 1984', 'Leeds, England', undefined, undefined, 'Software developer'],
  ['james', 'James', 'Carter', 'male', '1987', 'Leeds, England', undefined, undefined, 'Chef'],
  ['sofia', 'Sofia', 'Lindqvist', 'female', '1986', 'Uppsala, Sweden', undefined, undefined, 'Illustrator'],
  ['nina', 'Nina', 'Carter', 'female', '1990', 'Seoul, South Korea', undefined, undefined, 'Vet', {}],
  ['chidi', 'Chidi', 'Okafor', 'male', '1983', 'London, England', undefined, undefined, 'Pilot'],
  ['ada', 'Ada', 'Okafor', 'female', '1986', 'London, England', undefined, undefined, 'Lawyer'],
  ['ben', 'Ben', 'Carter', 'male', '1985', 'York, England', undefined, undefined, 'Carpenter'],
  ['lucy', 'Lucy', 'Brooks', 'female', '1993', 'York, England', undefined, undefined, 'Student nurse'],
  ['tom', 'Tom', 'Hughes', 'male', '1982', 'Bristol, England', undefined, undefined, 'Teacher'],
  // Generation 5
  ['oliver', 'Oliver', 'Hughes', 'male', '4 Jul 2012', 'Bristol, England'],
  ['mia', 'Mia', 'Hughes', 'female', '2015', 'Bristol, England'],
  ['leo', 'Leo', 'Carter', 'male', '2019', 'Stockholm, Sweden'],
];

type F = [id: string, partners: string[], children: (string | [string, ChildKind])[], status: FamilyStatus, date?: string, place?: string];

const FAMILIES: F[] = [
  ['f1', ['arthur', 'edith'], ['walter', 'dorothy', 'harold'], 'married', '1923', 'Leeds, England'],
  ['f2', ['tomasz', 'zofia'], ['irene', 'stan'], 'married', '1924', 'Kraków, Poland'],
  ['f3', ['walter', 'irene'], ['david', 'linda', 'peter'], 'married', '12 Apr 1950', 'Bradford, England'],
  ['f4', ['gareth', 'dorothy'], ['rhys'], 'married', '1949', 'Cardiff, Wales'],
  ['f5', ['alasdair', 'morag'], ['susan', 'fiona'], 'married', '1953', 'Glasgow, Scotland'],
  ['f6', ['david', 'susan'], ['emma', 'james', ['nina', 'adopted']], 'married', '1981', 'Glasgow, Scotland'],
  ['f7', ['emeka', 'linda'], ['chidi', 'ada'], 'married', '1981', 'London, England'],
  ['f8', ['peter', 'angela'], ['ben'], 'divorced', '1984', 'York, England'],
  ['f9', ['angela'], ['lucy'], 'unknown'],
  ['f10', ['tom', 'emma'], ['oliver', 'mia'], 'married', '2010', 'Bristol, England'],
  ['f11', ['james', 'sofia'], ['leo'], 'partners'],
];

export function buildDemoTree(): TreeData {
  const tree = emptyTree('Carter family (demo)');
  for (const [id, given, surname, sex, born, bornPlace, died, diedPlace, occupation, extra] of PEOPLE) {
    const events = [];
    if (born) events.push(newEvent({ type: 'birth', date: born, place: bornPlace }));
    if (died) events.push(newEvent({ type: 'death', date: died, place: diedPlace }));
    tree.people[id] = newPerson({ id, given, surname, sex, occupation, events, ...extra });
  }
  for (const [id, partners, children, status, date, place] of FAMILIES) {
    tree.families[id] = newFamily({
      id,
      partners,
      children: children.map((c) => (typeof c === 'string' ? { id: c, kind: 'birth' } : { id: c[0], kind: c[1] })),
      status,
      date,
      place,
    });
  }
  const P = tree.people;
  const ev = (id: string, type: Parameters<typeof newEvent>[0]['type'], date: string, place?: string, extra: { label?: string; note?: string; confidence?: Confidence; source?: string; disputed?: boolean } = {}) =>
    P[id].events.push(newEvent({ type, date, place, ...extra }));

  P.arthur.bio = 'Arthur carved the stone lions that still stand outside Leeds Central Library — or so the family says.';
  ev('arthur', 'military', '1916–1918', 'Western Front', { label: 'West Yorkshire Regiment', confidence: 'confirmed', source: 'Service record' });
  ev('arthur', 'custom', '1930', 'Leeds, England', { label: 'Carved the library lions', confidence: 'story' });
  P.edith.events.push(newEvent({ type: 'birth', date: '1902', place: 'Selby, England', confidence: 'probable', disputed: true, source: '1911 census' }));
  ev('tomasz', 'migration', '1926', 'Bradford, England', { label: 'Moved to England', note: 'Arrived by ship at Hull' });
  P.walter.bio = 'Walter spent 40 years on the railways and could name every locomotive on the line from Leeds to York.';
  ev('walter', 'education', '1941', 'Leeds, England', { label: 'Apprenticeship, LNER' });
  ev('david', 'education', '1974', 'Edinburgh, Scotland', { label: 'University of Edinburgh' });
  ev('david', 'residence', '1985', 'Leeds, England');
  ev('emma', 'residence', '2010', 'Bristol, England');
  P.emma.links.push({ id: 'l1', label: 'Personal website', url: 'https://example.com' });
  P.emma.socials.push({ id: 's1', platform: 'GitHub', handle: 'emma-carter' });
  ev('sofia', 'migration', '2014', 'Stockholm, Sweden', { label: 'Moved back to Sweden' });
  P.nina.bio = 'Nina was adopted as a baby in 1991 and grew up in Leeds.';
  P.peter.bio = 'Peter played bass in a York pub band for thirty years.';
  // A data-check example: a typo in a date
  P.harold.events.find((e) => e.type === 'death')!.date = '1931';
  P.stan.events.push(newEvent({ type: 'burial', date: '1944', place: 'Bradford, England' }));

  tree.homeId = 'emma';
  tree.stories.push({
    id: 'story1',
    title: 'From Kraków to Bristol',
    steps: [
      { personId: 'tomasz', caption: 'Tomasz, a tailor from Kraków, arrives in Bradford in 1926.' },
      { personId: 'irene', caption: 'His daughter Irene becomes a teacher and marries Walter Carter, a railway engineer.' },
      { personId: 'david', caption: 'Their son David studies architecture in Edinburgh, where he meets Susan.' },
      { personId: 'emma', caption: 'Emma, their eldest, moves to Bristol in 2010.' },
      { personId: 'oliver', caption: 'And the story continues with Oliver and Mia.' },
    ],
  });
  return tree;
}
