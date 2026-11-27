/**
 * Fuzzy genealogical dates. We keep what the user typed and derive:
 *  - a sortable number (year with fraction)
 *  - a clean display form
 *  - a GEDCOM form
 */

export type DateQualifier = 'exact' | 'about' | 'before' | 'after' | 'between' | 'estimated' | 'calculated';

export interface ParsedDate {
  raw: string;
  valid: boolean;
  qualifier: DateQualifier;
  year?: number;
  month?: number; // 1-12
  day?: number;
  /** For ranges ("1850–1855", BET … AND …) */
  endYear?: number;
  endMonth?: number;
  endDay?: number;
  /** Sortable value: year + month/12 + day/372 (ranges use their start) */
  sortKey?: number;
  display: string;
  gedcom: string;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_NAMES = MONTH_NAMES.map((m) => m.slice(0, 3));

function monthFromWord(w: string): number | undefined {
  const s = w.toLowerCase().replace(/\.$/, '');
  if (s.length < 3) return undefined;
  const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(s));
  if (idx >= 0) return idx + 1;
  if (s === 'sept') return 9;
  return undefined;
}

interface Simple {
  year: number;
  month?: number;
  day?: number;
}

function validDay(y: number, m: number, d: number) {
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= dim;
}

/** Parse a single (non-qualified) date. */
function parseSimple(input: string): Simple | null {
  const s = input.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // 1902
  if ((m = s.match(/^(\d{3,4})$/))) return { year: +m[1] };
  // 1902-03-12, 1902/3/12, 1902-03
  if ((m = s.match(/^(\d{3,4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/))) {
    const year = +m[1];
    const month = +m[2];
    const day = m[3] ? +m[3] : undefined;
    if (month < 1 || month > 12) return null;
    if (day !== undefined && !validDay(year, month, day)) return null;
    return { year, month, day };
  }
  // 12/03/1902 (day first – the common form outside the US), 03/1902
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{3,4})$/))) {
    let day = +m[1];
    let month = +m[2];
    const year = +m[3];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month < 1 || month > 12 || !validDay(year, month, day)) return null;
    return { year, month, day };
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{3,4})$/))) {
    const month = +m[1];
    if (month < 1 || month > 12) return null;
    return { year: +m[2], month };
  }
  // 12 Mar 1902, 12th March 1902
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z.]+) (\d{3,4})$/))) {
    const month = monthFromWord(m[2]);
    if (!month) return null;
    const year = +m[3];
    const day = +m[1];
    if (!validDay(year, month, day)) return null;
    return { year, month, day };
  }
  // March 12 1902
  if ((m = s.match(/^([A-Za-z.]+) (\d{1,2})(?:st|nd|rd|th)? (\d{3,4})$/))) {
    const month = monthFromWord(m[1]);
    if (!month) return null;
    const year = +m[3];
    const day = +m[2];
    if (!validDay(year, month, day)) return null;
    return { year, month, day };
  }
  // Mar 1902
  if ((m = s.match(/^([A-Za-z.]+) (\d{3,4})$/))) {
    const month = monthFromWord(m[1]);
    if (!month) return null;
    return { year: +m[2], month };
  }
  return null;
}

function displaySimple(d: Simple): string {
  if (d.day && d.month) return `${d.day} ${SHORT_NAMES[d.month - 1]} ${d.year}`;
  if (d.month) return `${SHORT_NAMES[d.month - 1]} ${d.year}`;
  return String(d.year);
}

function gedcomSimple(d: Simple): string {
  if (d.day && d.month) return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
  if (d.month) return `${MONTHS[d.month - 1]} ${d.year}`;
  return String(d.year);
}

function sortKeyOf(d: Simple): number {
  return d.year + ((d.month ?? 1) - 1) / 12 + ((d.day ?? 1) - 1) / 372;
}

const invalid = (raw: string): ParsedDate => ({
  raw,
  valid: false,
  qualifier: 'exact',
  display: raw.trim(),
  gedcom: raw.trim() ? `(${raw.trim()})` : '',
});

const cache = new Map<string, ParsedDate>();

export function parseDate(raw: string | undefined | null): ParsedDate {
  const input = (raw ?? '').trim();
  const hit = cache.get(input);
  if (hit) return hit;
  const res = parseUncached(input);
  if (cache.size > 5000) cache.clear();
  cache.set(input, res);
  return res;
}

function build(raw: string, qualifier: DateQualifier, a: Simple, b?: Simple): ParsedDate {
  const base: ParsedDate = {
    raw,
    valid: true,
    qualifier,
    year: a.year,
    month: a.month,
    day: a.day,
    sortKey: sortKeyOf(a),
    display: '',
    gedcom: '',
  };
  switch (qualifier) {
    case 'exact':
      base.display = displaySimple(a);
      base.gedcom = gedcomSimple(a);
      break;
    case 'about':
      base.display = `c. ${displaySimple(a)}`;
      base.gedcom = `ABT ${gedcomSimple(a)}`;
      break;
    case 'estimated':
      base.display = `est. ${displaySimple(a)}`;
      base.gedcom = `EST ${gedcomSimple(a)}`;
      break;
    case 'calculated':
      base.display = `calc. ${displaySimple(a)}`;
      base.gedcom = `CAL ${gedcomSimple(a)}`;
      break;
    case 'before':
      base.display = `before ${displaySimple(a)}`;
      base.gedcom = `BEF ${gedcomSimple(a)}`;
      base.sortKey = sortKeyOf(a) - 0.001;
      break;
    case 'after':
      base.display = `after ${displaySimple(a)}`;
      base.gedcom = `AFT ${gedcomSimple(a)}`;
      base.sortKey = sortKeyOf(a) + 0.001;
      break;
    case 'between':
      if (!b) break;
      base.endYear = b.year;
      base.endMonth = b.month;
      base.endDay = b.day;
      base.display = `${displaySimple(a)}–${displaySimple(b)}`;
      base.gedcom = `BET ${gedcomSimple(a)} AND ${gedcomSimple(b)}`;
      break;
  }
  return base;
}

function parseUncached(input: string): ParsedDate {
  if (!input) return { raw: '', valid: false, qualifier: 'exact', display: '', gedcom: '' };
  const s = input.replace(/\s+/g, ' ').trim();
  let m: RegExpMatchArray | null;

  // GEDCOM / English range: BET x AND y, between x and y, from x to y
  if ((m = s.match(/^(?:bet\.?|between|from)\s+(.+?)\s+(?:and|to|-|–)\s+(.+)$/i))) {
    const a = parseSimple(m[1]);
    const b = parseSimple(m[2]);
    if (a && b && sortKeyOf(a) <= sortKeyOf(b)) return build(input, 'between', a, b);
    return invalid(input);
  }
  // 1850–1855, 1850-1855, 1850 to 1855
  if ((m = s.match(/^(\d{3,4})\s*(?:–|—|-|to)\s*(\d{3,4})$/i))) {
    const a = { year: +m[1] };
    const b = { year: +m[2] };
    if (a.year <= b.year) return build(input, 'between', a, b);
    return invalid(input);
  }
  // Qualifiers
  const quals: [RegExp, DateQualifier][] = [
    [/^(?:about|abt\.?|circa|ca\.?|c\.|c(?=[\s\d])|approximately|approx\.?|~)\s*(.+)$/i, 'about'],
    [/^(?:bef\.?|before|by)\s+(.+)$/i, 'before'],
    [/^(?:aft\.?|after)\s+(.+)$/i, 'after'],
    [/^(?:est\.?|estimated)\s+(.+)$/i, 'estimated'],
    [/^(?:cal\.?|calc\.?|calculated)\s+(.+)$/i, 'calculated'],
  ];
  for (const [re, q] of quals) {
    if ((m = s.match(re))) {
      const a = parseSimple(m[1]);
      if (a) return build(input, q, a);
      return invalid(input);
    }
  }
  // "1850s"
  if ((m = s.match(/^(\d{3})0s$/))) {
    return build(input, 'between', { year: +m[1] * 10 }, { year: +m[1] * 10 + 9 });
  }
  // "(text)" GEDCOM phrase
  if (/^\(.*\)$/.test(s)) return invalid(input);

  const a = parseSimple(s);
  if (a) return build(input, 'exact', a);
  return invalid(input);
}

/** "Reads as: …" hint for the date input. */
export function dateHint(raw: string): { ok: boolean; text: string } | null {
  if (!raw.trim()) return null;
  const p = parseDate(raw);
  if (!p.valid) return { ok: false, text: "Can't read this date — try 1902, 12 Mar 1902 or c. 1850" };
  return { ok: true, text: `Reads as: ${p.display}` };
}

export function yearOf(raw?: string): number | undefined {
  const p = parseDate(raw);
  return p.valid ? p.year : undefined;
}

/** Month/day for anniversaries. Only for exact dates with day precision. */
export function monthDay(raw?: string): { month: number; day: number } | undefined {
  const p = parseDate(raw);
  if (p.valid && p.qualifier === 'exact' && p.month && p.day) return { month: p.month, day: p.day };
  return undefined;
}
