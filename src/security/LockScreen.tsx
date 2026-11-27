import { AlertTriangle, Copy, Download, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { downloadText } from '../util/files';
import { normaliseRecoveryCode } from './crypto';
import { passwordStrength } from './password';

type Mode = 'setup' | 'unlock' | 'forgot' | 'erase' | { code: string; after: 'setup' | 'recovery' };

/** Full-screen gate: nothing from the tree is loaded until this is passed. */
export function LockScreen() {
  const lock = useStore((s) => s.lock);
  const [mode, setMode] = useState<Mode>(lock === 'setup' ? 'setup' : 'unlock');

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md" data-testid="lock-screen">
          {mode === 'setup' ? (
            <Setup onCode={(code) => setMode({ code, after: 'setup' })} />
          ) : mode === 'unlock' ? (
            <Unlock onForgot={() => setMode('forgot')} />
          ) : mode === 'forgot' ? (
            <Forgot onBack={() => setMode('unlock')} onErase={() => setMode('erase')} onCode={(code) => setMode({ code, after: 'recovery' })} />
          ) : mode === 'erase' ? (
            <Erase onBack={() => setMode('forgot')} />
          ) : (
            <ShowRecoveryCode code={mode.code} after={mode.after} />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="text-center mb-6">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4 text-accent">{icon}</div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <p className="text-muted mt-1">{children}</p>}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  testId,
  meter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'new-password' | 'current-password';
  autoFocus?: boolean;
  testId?: string;
  meter?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const s = meter ? passwordStrength(value) : null;
  const colors = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-ok', 'bg-ok'];
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="input pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-testid={testId}
          aria-describedby={s ? `${id}-meter` : undefined}
        />
        <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 btn-ghost h-9 w-9 p-0" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {s && value && (
        <div id={`${id}-meter`} className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.max(1, s.score) ? colors[s.score] : 'bg-line'}`} />
            ))}
          </div>
          <p className="text-xs mt-1">
            <span className={s.ok ? 'text-ok font-medium' : 'text-danger font-medium'}>{s.label}</span>
            {s.hint && <span className="text-muted"> · {s.hint}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

/** Hidden username so password managers file the password under a sensible name. */
function PmUsername() {
  return <input type="text" name="username" autoComplete="username" value="Family Tree" readOnly hidden />;
}

export function useNewPassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const s = passwordStrength(pw);
  const error = !pw ? null : !s.ok ? s.hint ?? 'Choose a stronger password.' : pw2 && pw2 !== pw ? 'The passwords don’t match.' : null;
  return { pw, setPw, pw2, setPw2, valid: s.ok && pw === pw2, error };
}

function Setup({ onCode }: { onCode: (code: string) => void }) {
  const plainTrees = useStore((s) => s.plainTrees);
  const np = useNewPassword();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!np.valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      onCode(await useStore.getState().setupPassword(np.pw));
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <>
      <Header icon={<ShieldCheck size={30} />} title="Protect your family tree">
        Choose a password. Everything you save is encrypted with it, on this device.
      </Header>
      <form className="card p-5 space-y-4" onSubmit={submit} data-testid="setup-form">
        <PmUsername />
        <PasswordField label="Password" value={np.pw} onChange={np.setPw} autoComplete="new-password" autoFocus testId="setup-password" meter />
        <PasswordField label="Type it again" value={np.pw2} onChange={np.setPw2} autoComplete="new-password" testId="setup-password2" />
        {np.error && np.pw2 && <p className="text-sm text-danger">{np.error}</p>}
        {err && <p className="text-sm text-danger">{err}</p>}
        {plainTrees > 0 && (
          <p className="text-sm rounded-lg bg-accent/10 p-3">
            You already have {plainTrees} tree{plainTrees > 1 ? 's' : ''} on this device. {plainTrees > 1 ? 'They' : 'It'} will be encrypted now.
          </p>
        )}
        <button className="btn-primary w-full h-11" type="submit" disabled={!np.valid || busy} data-testid="setup-submit">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LockKeyhole size={18} />} {busy ? 'Encrypting…' : 'Set password'}
        </button>
        <p className="text-xs text-muted">
          There is no “reset by email”: nobody else — not even the app’s author — can open your data. Next you’ll get a recovery code in case you forget the password.
        </p>
      </form>
    </>
  );
}

function formatWait(until: number) {
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

function useNow(active: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function Unlock({ onForgot }: { onForgot: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const waiting = until > Date.now();
  useNow(waiting);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || busy || waiting) return;
    setBusy(true);
    setErr(null);
    const r = await useStore.getState().unlock(pw);
    if (r.ok) return;
    setBusy(false);
    setPw('');
    if (r.reason === 'error') setErr(r.message);
    else {
      setUntil(r.lockedUntil ?? 0);
      setErr(r.reason === 'lockedout' ? 'Too many wrong tries.' : 'That password isn’t right.');
    }
  };

  return (
    <>
      <Header icon={<LockKeyhole size={30} />} title="Family tree locked">
        Enter your password to open it.
      </Header>
      <form className="card p-5 space-y-4" onSubmit={submit} data-testid="unlock-form">
        <PmUsername />
        <PasswordField label="Password" value={pw} onChange={setPw} autoComplete="current-password" autoFocus testId="unlock-password" />
        {err && (
          <p className="text-sm text-danger" role="alert" data-testid="unlock-error">
            {err}
            {waiting && ` Try again in ${formatWait(until)}.`}
          </p>
        )}
        <button className="btn-primary w-full h-11" type="submit" disabled={!pw || busy || waiting} data-testid="unlock-submit">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={onForgot} data-testid="forgot">
          Forgot your password?
        </button>
      </form>
    </>
  );
}

function Forgot({ onBack, onErase, onCode }: { onBack: () => void; onErase: () => void; onCode: (code: string) => void }) {
  const [code, setCode] = useState('');
  const np = useNewPassword();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const waiting = until > Date.now();
  useNow(waiting);
  const codeOk = normaliseRecoveryCode(code).replace(/-/g, '').length === 25;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk || !np.valid || busy || waiting) return;
    setBusy(true);
    setErr(null);
    const r = await useStore.getState().recover(code, np.pw);
    setBusy(false);
    if (r.ok) onCode(r.recoveryCode);
    else {
      setUntil(r.lockedUntil ?? 0);
      setErr(r.reason === 'lockedout' ? 'Too many wrong tries.' : 'That recovery code isn’t right.');
    }
  };

  return (
    <>
      <Header icon={<KeyRound size={30} />} title="Use your recovery code">
        Enter the code you saved when you set your password, then choose a new password.
      </Header>
      <form className="card p-5 space-y-4" onSubmit={submit}>
        <PmUsername />
        <div>
          <label className="label" htmlFor="rc">
            Recovery code
          </label>
          <input
            id="rc"
            className="input font-mono tracking-wider uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            data-testid="recovery-input"
          />
        </div>
        <PasswordField label="New password" value={np.pw} onChange={np.setPw} autoComplete="new-password" testId="recovery-password" meter />
        <PasswordField label="Type it again" value={np.pw2} onChange={np.setPw2} autoComplete="new-password" testId="recovery-password2" />
        {np.error && np.pw2 && <p className="text-sm text-danger">{np.error}</p>}
        {err && (
          <p className="text-sm text-danger" role="alert">
            {err}
            {waiting && ` Try again in ${formatWait(until)}.`}
          </p>
        )}
        <button className="btn-primary w-full h-11" type="submit" disabled={!codeOk || !np.valid || busy || waiting} data-testid="recovery-submit">
          {busy && <Loader2 size={18} className="animate-spin" />} Set new password
        </button>
        <div className="flex justify-between gap-2">
          <button type="button" className="btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn-ghost text-danger" onClick={onErase} data-testid="go-erase">
            I’ve lost the code too
          </button>
        </div>
      </form>
    </>
  );
}

function Erase({ onBack }: { onBack: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Header icon={<AlertTriangle size={30} />} title="Start over on this device">
        Without the password or recovery code, the encrypted data can’t be opened by anyone.
      </Header>
      <div className="card p-5 space-y-4">
        <p className="text-sm">
          You can erase everything stored here and start fresh. If you have a backup file, you can import it afterwards. <strong>This can’t be undone.</strong>
        </p>
        <div>
          <label className="label" htmlFor="erase">
            Type ERASE to confirm
          </label>
          <input id="erase" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="erase-input" />
        </div>
        <div className="flex justify-between gap-2">
          <button className="btn-ghost" onClick={onBack}>
            Back
          </button>
          <button
            className="btn-danger"
            disabled={typed.trim() !== 'ERASE' || busy}
            onClick={() => {
              setBusy(true);
              void useStore.getState().eraseAll();
            }}
            data-testid="erase-confirm"
          >
            Erase all data
          </button>
        </div>
      </div>
    </>
  );
}

export function RecoveryCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-center font-mono text-lg sm:text-xl font-semibold tracking-wider rounded-lg bg-subtle border border-line p-4 select-all break-all" data-testid="recovery-code">
        {code}
      </p>
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          className="btn-secondary h-9"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          <Copy size={15} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="btn-secondary h-9"
          onClick={() =>
            downloadText(
              'family-tree-recovery-code.txt',
              `Family Tree recovery code\n\n${code}\n\nUse this if you forget your password (Unlock screen → “Forgot your password?”).\nKeep it somewhere safe and private, like a password manager or printed in a drawer.\n`,
            )
          }
        >
          <Download size={15} /> Save as file
        </button>
      </div>
    </div>
  );
}

function ShowRecoveryCode({ code, after }: { code: string; after: 'setup' | 'recovery' }) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Header icon={<KeyRound size={30} />} title={after === 'setup' ? 'Save your recovery code' : 'Your new recovery code'}>
        If you forget your password, this code is the only way back in. It’s shown only once.
      </Header>
      <div className="card p-5 space-y-4">
        {after === 'recovery' && <p className="text-sm rounded-lg bg-ok/10 p-3">Your password has been changed. Your old recovery code no longer works.</p>}
        <RecoveryCodeBox code={code} />
        <p className="text-xs text-muted">Store it in a password manager or print it. Don’t keep it in the same place as your password.</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 w-4 h-4 accent-[rgb(var(--accent))]" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="recovery-saved" />
          <span className="text-sm">I’ve saved my recovery code somewhere safe</span>
        </label>
        <button className="btn-primary w-full h-11" disabled={!saved} onClick={() => useStore.getState().finishSetup()} data-testid="recovery-continue">
          Continue
        </button>
      </div>
    </>
  );
}
