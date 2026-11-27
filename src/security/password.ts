/** Simple, dependency-free password strength rules. */

export const MIN_LENGTH = 10;

const COMMON = new Set(
  [
    'password', 'password1', 'password123', 'passw0rd', '123456789', '1234567890', '12345678910', 'qwertyuiop', 'qwerty123', 'iloveyou',
    'letmein123', 'welcome123', 'admin12345', 'football', 'baseball', 'princess', 'sunshine', 'dragon123', 'monkey123', 'abc1234567',
    'familytree', 'family123', 'familytree1', 'myfamily', 'ancestry', 'genealogy', 'changeme', 'trustno1', 'superman', 'whatever',
  ].map((s) => s.toLowerCase()),
);

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  ok: boolean;
  hint?: string;
}

function isSequence(s: string): boolean {
  const lower = s.toLowerCase();
  let up = 0;
  let down = 0;
  for (let i = 1; i < lower.length; i++) {
    const d = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    if (d === 1) up++;
    if (d === -1) down++;
  }
  return up >= lower.length - 2 || down >= lower.length - 2;
}

export function passwordStrength(pw: string, context: string[] = []): Strength {
  if (!pw) return { score: 0, label: '', ok: false };
  if (pw.length < MIN_LENGTH) return { score: 0, label: 'Too short', ok: false, hint: `Use at least ${MIN_LENGTH} characters.` };
  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[^a-z]/g, '');
  if (COMMON.has(lower) || COMMON.has(stripped)) return { score: 0, label: 'Too common', ok: false, hint: 'This is a well-known password. Pick something else.' };
  if (new Set(pw).size <= 3 || isSequence(pw)) return { score: 0, label: 'Too easy to guess', ok: false, hint: 'Avoid repeated characters and sequences.' };
  for (const c of context) {
    const w = c.toLowerCase().trim();
    if (w.length >= 4 && lower.includes(w) && pw.length - w.length < 6) return { score: 1, label: 'Too easy to guess', ok: false, hint: 'Don’t build it around a family name.' };
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const words = pw.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3).length;
  let score = 1;
  if (pw.length >= 12) score++;
  if (pw.length >= 16 || words >= 4) score++;
  if (classes >= 3) score++;
  const s = Math.min(4, score) as Strength['score'];
  const label = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s];
  return { score: s, label, ok: s >= 2, hint: s < 3 ? 'Longer is stronger: try four random words, like “otter-violin-maple-cloud”.' : undefined };
}
