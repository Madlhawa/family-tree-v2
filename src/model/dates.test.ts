import { dateHint, monthDay, parseDate } from './dates';

describe('parseDate', () => {
  const cases: [string, Partial<ReturnType<typeof parseDate>>][] = [
    ['1902', { valid: true, qualifier: 'exact', year: 1902, display: '1902', gedcom: '1902' }],
    ['12 Mar 1902', { year: 1902, month: 3, day: 12, display: '12 Mar 1902', gedcom: '12 MAR 1902' }],
    ['12 march 1902', { year: 1902, month: 3, day: 12 }],
    ['March 12, 1902', { year: 1902, month: 3, day: 12 }],
    ['1902-03-12', { year: 1902, month: 3, day: 12, gedcom: '12 MAR 1902' }],
    ['Mar 1902', { year: 1902, month: 3, display: 'Mar 1902', gedcom: 'MAR 1902' }],
    ['c. 1850', { qualifier: 'about', year: 1850, display: 'c. 1850', gedcom: 'ABT 1850' }],
    ['circa 1850', { qualifier: 'about', year: 1850 }],
    ['ABT 1850', { qualifier: 'about', year: 1850, gedcom: 'ABT 1850' }],
    ['before 1900', { qualifier: 'before', year: 1900, display: 'before 1900', gedcom: 'BEF 1900' }],
    ['BEF 3 JAN 1900', { qualifier: 'before', year: 1900, month: 1, day: 3 }],
    ['after 1870', { qualifier: 'after', year: 1870, gedcom: 'AFT 1870' }],
    ['1850–1855', { qualifier: 'between', year: 1850, endYear: 1855, display: '1850–1855', gedcom: 'BET 1850 AND 1855' }],
    ['1850-1855', { qualifier: 'between', year: 1850, endYear: 1855 }],
    ['BET 1850 AND 1855', { qualifier: 'between', year: 1850, endYear: 1855 }],
    ['between Jan 1850 and Mar 1851', { qualifier: 'between', year: 1850, month: 1, endYear: 1851, endMonth: 3 }],
    ['1850s', { qualifier: 'between', year: 1850, endYear: 1859 }],
    ['EST 1800', { qualifier: 'estimated', gedcom: 'EST 1800' }],
  ];
  it.each(cases)('parses %s', (raw, expected) => {
    const p = parseDate(raw);
    expect(p.valid).toBe(true);
    expect(p).toMatchObject(expected);
    expect(p.raw).toBe(raw);
  });

  it('rejects nonsense and impossible dates', () => {
    for (const raw of ['banana', '31 Feb 1900', '1902-13-01', '1855-1850', 'BET 1900 AND 1800']) {
      expect(parseDate(raw).valid, raw).toBe(false);
    }
  });

  it('sorts sensibly', () => {
    const k = (s: string) => parseDate(s).sortKey!;
    expect(k('before 1900')).toBeLessThan(k('1900'));
    expect(k('1900')).toBeLessThan(k('after 1900'));
    expect(k('1 Jan 1900')).toBeLessThan(k('2 Jan 1900'));
    expect(k('Dec 1899')).toBeLessThan(k('1900'));
  });

  it('gives "Reads as" hints', () => {
    expect(dateHint('12 mar 1902')).toEqual({ ok: true, text: 'Reads as: 12 Mar 1902' });
    expect(dateHint('xyz')?.ok).toBe(false);
    expect(dateHint('')).toBeNull();
  });

  it('extracts month/day only from exact dates', () => {
    expect(monthDay('12 Mar 1902')).toEqual({ month: 3, day: 12 });
    expect(monthDay('c. 12 Mar 1902')).toBeUndefined();
    expect(monthDay('1902')).toBeUndefined();
  });
});
