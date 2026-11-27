import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { PasswordField, RecoveryCodeBox, useNewPassword } from './LockScreen';

export const AUTO_LOCK_OPTIONS = [5, 15, 30, 60, 240];

/** Locks the app after a period with no keyboard, mouse or touch activity. */
export function useAutoLock() {
  const lock = useStore((s) => s.lock);
  const minutes = useStore((s) => s.autoLockMinutes);
  useEffect(() => {
    if (lock !== 'unlocked') return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const check = () => {
      if (Date.now() - last > minutes * 60_000) void useStore.getState().lockNow();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true, capture: true });
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(check, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump, { capture: true });
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [lock, minutes]);
}

function label(m: number) {
  return m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`;
}

export function SecurityDialog() {
  const { setDialog, setAutoLock, lockNow } = useStore.getState();
  const minutes = useStore((s) => s.autoLockMinutes);
  const [panel, setPanel] = useState<'main' | 'password' | 'recovery'>('main');

  return (
    <Dialog title="Password & security" onClose={() => setDialog(null)}>
      {panel === 'main' ? (
        <div className="p-5 space-y-5">
          <div className="flex gap-3 rounded-lg bg-ok/10 p-3">
            <ShieldCheck size={22} className="text-ok shrink-0 mt-0.5" />
            <p className="text-sm">
              Your trees, photos and settings are encrypted on this device with AES-256. They can only be opened with your password or recovery code. Nothing is sent to a
              server.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="autolock">
              Lock automatically after
            </label>
            <select id="autolock" className="input" value={minutes} onChange={(e) => setAutoLock(Number(e.target.value))} data-testid="autolock">
              {AUTO_LOCK_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {label(m)} without activity
                </option>
              ))}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setPanel('password')} data-testid="change-password">
              <KeyRound size={16} /> Change password
            </button>
            <button className="btn-secondary" onClick={() => setPanel('recovery')} data-testid="new-recovery">
              <KeyRound size={16} /> New recovery code
            </button>
          </div>
          <button className="btn-primary w-full" onClick={() => void lockNow()} data-testid="lock-now">
            <LockKeyhole size={16} /> Lock now
          </button>
          <p className="text-xs text-muted">
            Tips: use a password you don’t use anywhere else, keep your device’s own screen lock on, and lock the app when you step away on a shared computer. Backup
            files you download are encrypted only if you choose “Encrypted backup”.
          </p>
        </div>
      ) : panel === 'password' ? (
        <ChangePassword onDone={() => setPanel('main')} />
      ) : (
        <NewRecovery onDone={() => setPanel('main')} />
      )}
    </Dialog>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const np = useNewPassword();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current || !np.valid || busy) return;
    if (np.pw === current) {
      setErr('The new password is the same as the current one.');
      return;
    }
    setBusy(true);
    setErr(null);
    const ok = await useStore.getState().changePassword(current, np.pw);
    setBusy(false);
    if (!ok) {
      setErr('Your current password isn’t right.');
      return;
    }
    useStore.getState().toast({ message: 'Password changed', kind: 'success' });
    onDone();
  };
  return (
    <form className="p-5 space-y-4" onSubmit={submit}>
      <input type="text" name="username" autoComplete="username" value="Family Tree" readOnly hidden />
      <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus testId="cp-current" />
      <PasswordField label="New password" value={np.pw} onChange={np.setPw} autoComplete="new-password" testId="cp-new" meter />
      <PasswordField label="Type the new password again" value={np.pw2} onChange={np.setPw2} autoComplete="new-password" testId="cp-new2" />
      {np.error && np.pw2 && <p className="text-sm text-danger">{np.error}</p>}
      {err && (
        <p className="text-sm text-danger" role="alert">
          {err}
        </p>
      )}
      <p className="text-xs text-muted">Your recovery code stays the same.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn-primary" disabled={!current || !np.valid || busy} data-testid="cp-submit">
          {busy && <Loader2 size={16} className="animate-spin" />} Change password
        </button>
      </div>
    </form>
  );
}

function NewRecovery({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    const c = await useStore.getState().newRecoveryCode(pw);
    setBusy(false);
    if (!c) setErr('That password isn’t right.');
    else setCode(c);
  };
  if (code)
    return (
      <div className="p-5 space-y-4">
        <p className="text-sm">This is your new recovery code. The old one no longer works. It’s shown only once.</p>
        <RecoveryCodeBox code={code} />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={onDone}>
            I’ve saved it
          </button>
        </div>
      </div>
    );
  return (
    <form className="p-5 space-y-4" onSubmit={submit}>
      <p className="text-sm text-muted">Lost your recovery code? Make a new one. The old code will stop working.</p>
      <input type="text" name="username" autoComplete="username" value="Family Tree" readOnly hidden />
      <PasswordField label="Your password" value={pw} onChange={setPw} autoComplete="current-password" autoFocus />
      {err && (
        <p className="text-sm text-danger" role="alert">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn-primary" disabled={!pw || busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} Make a new code
        </button>
      </div>
    </form>
  );
}
