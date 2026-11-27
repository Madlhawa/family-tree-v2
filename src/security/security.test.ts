import { sanitizeTree } from '../io/backup';
import type { TreeData } from '../model/types';
import {
  changePassword,
  createVault,
  decryptFile,
  encryptFile,
  newRecoveryCode,
  normaliseRecoveryCode,
  open,
  regenerateRecovery,
  seal,
  unlockWithPassword,
  WrongSecretError,
} from './crypto';
import { passwordStrength } from './password';

const FAST = 1000;

describe('vault', () => {
  it('unlocks with the right password and rejects a wrong one', async () => {
    const v = await createVault('correct horse battery', FAST);
    const key = await unlockWithPassword(v.header, 'correct horse battery');
    const sealed = await seal(v.key, { hello: 'world' }, 'x');
    expect(await open(key, sealed, 'x')).toEqual({ hello: 'world' });
    await expect(unlockWithPassword(v.header, 'Correct horse battery')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('uses 600 000 PBKDF2 rounds by default and a random salt each time', async () => {
    const a = await createVault('correct horse battery');
    const b = await createVault('correct horse battery', FAST);
    expect(a.header.password.iterations).toBe(600_000);
    expect(a.header.password.salt).not.toBe(b.header.password.salt);
  }, 20_000);

  it('keeps the data key non-extractable after unlocking', async () => {
    const v = await createVault('correct horse battery', FAST);
    const key = await unlockWithPassword(v.header, 'correct horse battery');
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('never stores the password or recovery code', async () => {
    const v = await createVault('correct horse battery', FAST);
    const json = JSON.stringify(v.header);
    expect(json).not.toContain('correct horse');
    expect(json).not.toContain(v.recoveryCode.replace(/-/g, '').slice(0, 10));
  });

  it('rejects tampered ciphertext and the wrong context', async () => {
    const v = await createVault('correct horse battery', FAST);
    const sealed = await seal(v.key, 'secret', 'tree:a');
    await expect(open(v.key, sealed, 'tree:b')).rejects.toThrow();
    const bytes = atob(sealed.ct);
    const flipped = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(open(v.key, { ...sealed, ct: flipped }, 'tree:a')).rejects.toThrow();
  });

  it('recovers with the recovery code, typed sloppily, and then issues a new one', async () => {
    const v = await createVault('correct horse battery', FAST);
    const data = await seal(v.key, { n: 1 }, 'x');
    const sloppy = v.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const r = await changePassword(v.header, 'recovery', sloppy, 'a brand new passphrase', FAST);
    expect(r.recoveryCode).toBeTruthy();
    expect(r.recoveryCode).not.toBe(v.recoveryCode);
    expect(await open(await unlockWithPassword(r.header, 'a brand new passphrase'), data, 'x')).toEqual({ n: 1 });
    await expect(unlockWithPassword(r.header, 'correct horse battery')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(changePassword(r.header, 'recovery', v.recoveryCode, 'x'.repeat(12), FAST)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(changePassword(r.header, 'recovery', r.recoveryCode!, 'yet another passphrase', FAST)).resolves.toBeTruthy();
  });

  it('changing the password keeps the data and the recovery code', async () => {
    const v = await createVault('correct horse battery', FAST);
    const data = await seal(v.key, 'kept', 'x');
    const r = await changePassword(v.header, 'password', 'correct horse battery', 'different passphrase here', FAST);
    expect(r.recoveryCode).toBeUndefined();
    expect(await open(r.key, data, 'x')).toBe('kept');
    await expect(changePassword(r.header, 'recovery', v.recoveryCode, 'third passphrase okay', FAST)).resolves.toBeTruthy();
    await expect(changePassword(v.header, 'password', 'wrong password!!', 'zzz', FAST)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('a new recovery code replaces the old one', async () => {
    const v = await createVault('correct horse battery', FAST);
    const r = await regenerateRecovery(v.header, 'correct horse battery', FAST);
    await expect(changePassword(r.header, 'recovery', v.recoveryCode, 'something long enough', FAST)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(changePassword(r.header, 'recovery', r.recoveryCode, 'something long enough', FAST)).resolves.toBeTruthy();
  });
});

describe('recovery codes', () => {
  it('are 5 groups of 5 unambiguous characters, all different', () => {
    const codes = new Set(Array.from({ length: 50 }, newRecoveryCode));
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  });
  it('normalise case, spaces and look-alike letters', () => {
    expect(normaliseRecoveryCode('abcde fghij-klmno pqrst uvwxy')).toBe('ABCDE-FGH1J-K1MN0-PQRST-UVWXY');
  });
});

describe('encrypted backup files', () => {
  it('round-trip with the right password only', async () => {
    const f = await encryptFile('{"hello":"Grandma Rose"}', 'backup passphrase', 100_000);
    expect(JSON.stringify(f)).not.toContain('Grandma');
    expect(await decryptFile(f, 'backup passphrase')).toBe('{"hello":"Grandma Rose"}');
    await expect(decryptFile(f, 'wrong passphrase')).rejects.toBeInstanceOf(WrongSecretError);
  });
  it('refuse files asking for too few rounds', async () => {
    const f = await encryptFile('x', 'backup passphrase', 100_000);
    await expect(decryptFile({ ...f, iterations: 10 }, 'backup passphrase')).rejects.toThrow();
  });
});

describe('password strength', () => {
  it('rejects short, common and patterned passwords', () => {
    expect(passwordStrength('short').ok).toBe(false);
    expect(passwordStrength('password123').ok).toBe(false);
    expect(passwordStrength('aaaaaaaaaaaa').ok).toBe(false);
    expect(passwordStrength('abcdefghijkl').ok).toBe(false);
    expect(passwordStrength('1234567890').ok).toBe(false);
  });
  it('accepts long passphrases', () => {
    expect(passwordStrength('otter-violin-maple-cloud').ok).toBe(true);
    expect(passwordStrength('Tr1cky!Pass#9').ok).toBe(true);
  });
});

describe('sanitizeTree (untrusted imports)', () => {
  const base = (people: unknown, extra: Record<string, unknown> = {}) => ({ version: 2, id: 't', name: 'T', people, families: {}, stories: [], ...extra }) as unknown as TreeData;

  it('refuses prototype-polluting ids', () => {
    const evil = JSON.parse('{"__proto__": {"given": "x"}, "ok": {"given": "Ann"}}');
    const t = sanitizeTree(base(evil));
    expect(Object.keys(t.people)).toEqual(['ok']);
    expect(({} as Record<string, unknown>).given).toBeUndefined();
  });

  it('drops remote or scripted photos and keeps embedded images', () => {
    const t = sanitizeTree(
      base({
        a: { given: 'A', photo: 'https://tracker.example/pixel.gif' },
        b: { given: 'B', photo: 'javascript:alert(1)' },
        c: { given: 'C', photo: 'data:text/html;base64,PHNjcmlwdD4=' },
        d: { given: 'D', photo: 'data:image/png;base64,iVBORw0KGgo=' },
        e: { given: 'E', media: [{ kind: 'image', data: 'https://x.example/a.png' }, { kind: 'audio', data: 'data:audio/mpeg;base64,SUQz' }] },
      }),
    );
    expect(t.people.a.photo).toBeUndefined();
    expect(t.people.b.photo).toBeUndefined();
    expect(t.people.c.photo).toBeUndefined();
    expect(t.people.d.photo).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(t.people.e.media.map((m) => m.kind)).toEqual(['audio']);
  });

  it('drops unknown fields and fixes wrong types', () => {
    const t = sanitizeTree(base({ a: { given: 42, sex: 'robot', living: true, onclick: 'x', events: [{ type: 'birth', date: 1900, evil: 1 }, 'junk'] } }));
    const p = t.people.a as unknown as Record<string, unknown>;
    expect(p.given).toBe('42');
    expect(p.sex).toBe('unknown');
    expect(p.living).toBe('auto');
    expect(p.onclick).toBeUndefined();
    expect(t.people.a.events).toHaveLength(1);
    expect((t.people.a.events[0] as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
});
