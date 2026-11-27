import { Download, FileJson, FileLock2, FileText, Loader2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { detectFormat, makeBackup, migrateLegacy, restoreBackup } from '../io/backup';
import { exportGedcom, importGedcom } from '../io/gedcom';
import { decryptFile, encryptFile, isEncryptedFile, WrongSecretError, type EncryptedFile } from '../security/crypto';
import { PasswordField, useNewPassword } from '../security/LockScreen';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { downloadText, readAsText, slug } from '../util/files';

const MAX_IMPORT = 300_000_000;

export function ImportExportDialog({ tab: initial = 'export' }: { tab?: 'import' | 'export' }) {
  const tree = useStore((s) => s.tree);
  const { setDialog, importTree, toast, markBackedUp } = useStore.getState();
  const [tab, setTab] = useState<'import' | 'export'>(tree ? initial : 'import');
  const [redact, setRedact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // encrypted backup: import side
  const [locked, setLocked] = useState<{ name: string; file: EncryptedFile } | null>(null);
  const [openPw, setOpenPw] = useState('');
  const [openErr, setOpenErr] = useState<string | null>(null);
  // encrypted backup: export side
  const [encOpen, setEncOpen] = useState(false);
  const np = useNewPassword();

  const importText = async (text: string, fileName: string) => {
    const fmt = detectFormat(text);
    const base = fileName.replace(/\.[^.]+$/, '');
    if (fmt === 'gedcom') {
      const r = importGedcom(text, base);
      await importTree(r.tree, `Imported ${r.people} people from ${fileName}`);
      toast({ message: `Imported ${r.people} people and ${r.families} families into a new tree`, kind: 'success' });
      if (r.warnings.length) setReport(r.warnings.slice(0, 20));
      else setDialog(null);
    } else if (fmt === 'backup') {
      const t = restoreBackup(text);
      await importTree(t, `Restored backup ${fileName}`);
      toast({ message: `Restored “${t.name}” as a new tree`, kind: 'success' });
      setDialog(null);
    } else if (fmt === 'legacy') {
      const { tree: t, notes } = migrateLegacy(text);
      await importTree(t, `Imported Dynasty Chronicle backup ${fileName}`);
      toast({ message: `Imported ${Object.keys(t.people).length} people from Dynasty Chronicle`, kind: 'success' });
      setReport(notes);
    } else {
      toast({ message: 'This file type isn’t recognised. Use a GEDCOM (.ged) or JSON backup.', kind: 'error' });
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMPORT) {
      toast({ message: 'That file is too large to import (max 300 MB).', kind: 'error' });
      return;
    }
    setBusy(true);
    try {
      const text = await readAsText(file);
      let j: unknown = null;
      if (text.trimStart().startsWith('{')) {
        try {
          j = JSON.parse(text);
        } catch {
          /* not JSON: handled by importText */
        }
      }
      if (isEncryptedFile(j)) {
        setLocked({ name: file.name, file: j });
        setOpenPw('');
        setOpenErr(null);
      } else await importText(text, file.name);
    } catch (e) {
      console.error(e);
      toast({ message: 'Sorry, that file could not be read.', kind: 'error' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openLocked = async (e: FormEvent) => {
    e.preventDefault();
    if (!locked || !openPw || busy) return;
    setBusy(true);
    setOpenErr(null);
    try {
      const text = await decryptFile(locked.file, openPw);
      setLocked(null);
      await importText(text, locked.name);
    } catch (err) {
      if (err instanceof WrongSecretError) setOpenErr('That password doesn’t open this file.');
      else {
        console.error(err);
        setOpenErr('This file could not be opened. It may be damaged.');
      }
    } finally {
      setBusy(false);
    }
  };

  const name = slug(tree?.name ?? 'family-tree');
  const date = new Date().toISOString().slice(0, 10);

  const exportEncrypted = async (e: FormEvent) => {
    e.preventDefault();
    if (!tree || !np.valid || busy) return;
    setBusy(true);
    try {
      const file = await encryptFile(JSON.stringify(makeBackup(tree, { redactLiving: redact })), np.pw);
      downloadText(`${name}-encrypted-backup-${date}.json`, JSON.stringify(file), 'application/json');
      if (!redact) markBackedUp();
      toast({ message: 'Encrypted backup downloaded', kind: 'success' });
      setEncOpen(false);
      np.setPw('');
      np.setPw2('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Import & export" onClose={() => setDialog(null)}>
      <div className="px-5 pt-3">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'export'} onClick={() => setTab('export')} disabled={!tree}>
            Export / back up
          </button>
          <button role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>
            Import
          </button>
        </div>
      </div>
      {report ? (
        <div className="p-5 space-y-3">
          <p className="text-sm font-medium">Import finished with a few notes:</p>
          <ul className="text-sm text-muted list-disc pl-5 space-y-1">
            {report.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <button className="btn-primary" onClick={() => setDialog(null)}>
            Done
          </button>
        </div>
      ) : tab === 'export' && tree ? (
        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 rounded-lg border border-line p-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4 accent-[rgb(var(--accent))]" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Redact living people</span>
              <span className="block text-xs text-muted">Replace names and details of living people with “Living” — good for sharing.</span>
            </span>
          </label>

          <div className="card border-accent/50">
            <button className="w-full p-4 flex items-center gap-4 text-left hover:bg-subtle rounded-lg" onClick={() => setEncOpen(!encOpen)} aria-expanded={encOpen} data-testid="export-encrypted">
              <FileLock2 size={28} className="text-accent shrink-0" />
              <span className="flex-1">
                <span className="block font-medium">Encrypted backup (.json) · recommended</span>
                <span className="block text-xs text-muted">Everything, protected with a password. Safe to keep in cloud storage or email to yourself.</span>
              </span>
              <Download size={18} className="text-muted" />
            </button>
            {encOpen && (
              <form className="px-4 pb-4 space-y-3" onSubmit={exportEncrypted}>
                <input type="text" name="username" autoComplete="username" value="Family Tree backup" readOnly hidden />
                <PasswordField label="Password for this file" value={np.pw} onChange={np.setPw} autoComplete="new-password" autoFocus testId="backup-password" meter />
                <PasswordField label="Type it again" value={np.pw2} onChange={np.setPw2} autoComplete="new-password" testId="backup-password2" />
                {np.error && np.pw2 && <p className="text-sm text-danger">{np.error}</p>}
                <p className="text-xs text-muted">You can use your app password. You’ll need this password to restore the file.</p>
                <button className="btn-primary w-full" disabled={!np.valid || busy} data-testid="backup-download">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download encrypted backup
                </button>
              </form>
            )}
          </div>

          <p className="text-xs font-medium text-muted uppercase tracking-wide pt-1">Unencrypted — anyone with the file can read it</p>
          <button
            className="w-full card p-4 flex items-center gap-4 text-left hover:bg-subtle"
            onClick={() => {
              downloadText(`${name}-backup-${date}.json`, JSON.stringify(makeBackup(tree, { redactLiving: redact })), 'application/json');
              if (!redact) markBackedUp();
              toast({ message: 'Backup downloaded (not encrypted)', kind: 'success' });
            }}
            data-testid="export-json"
          >
            <FileJson size={28} className="text-muted shrink-0" />
            <span className="flex-1">
              <span className="block font-medium">Plain backup (.json)</span>
              <span className="block text-xs text-muted">Everything, including photos and stories, readable by anyone who gets the file.</span>
            </span>
            <Download size={18} className="text-muted" />
          </button>
          <button
            className="w-full card p-4 flex items-center gap-4 text-left hover:bg-subtle"
            onClick={() => {
              downloadText(`${name}-${date}.ged`, exportGedcom(tree, { redactLiving: redact }), 'text/plain');
              toast({ message: 'GEDCOM file downloaded (not encrypted)', kind: 'success' });
            }}
            data-testid="export-gedcom"
          >
            <FileText size={28} className="text-muted shrink-0" />
            <span className="flex-1">
              <span className="block font-medium">GEDCOM 5.5.1 (.ged)</span>
              <span className="block text-xs text-muted">The standard format for other family tree programs. Photos are not included.</span>
            </span>
            <Download size={18} className="text-muted" />
          </button>
        </div>
      ) : locked ? (
        <form className="p-5 space-y-4" onSubmit={openLocked}>
          <p className="text-sm">
            <span className="font-medium">{locked.name}</span> is an encrypted backup. Enter its password to restore it.
          </p>
          <PasswordField label="Backup password" value={openPw} onChange={setOpenPw} autoComplete="current-password" autoFocus testId="import-password" />
          {openErr && (
            <p className="text-sm text-danger" role="alert">
              {openErr}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setLocked(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!openPw || busy} data-testid="import-unlock">
              {busy && <Loader2 size={16} className="animate-spin" />} Open and restore
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted">Imports always go into a new tree — your current tree is never overwritten.</p>
          <button
            className="w-full border-2 border-dashed border-line rounded-lg p-8 flex flex-col items-center gap-2 hover:bg-subtle"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={26} className="text-accent" />
            <span className="font-medium">{busy ? 'Importing…' : 'Choose a file or drop it here'}</span>
            <span className="text-xs text-muted">GEDCOM (.ged), a backup from this app (.json, encrypted or not), or a Dynasty Chronicle backup (.json)</span>
          </button>
          <input ref={fileRef} type="file" accept=".ged,.gedcom,.json,application/json,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
        </div>
      )}
    </Dialog>
  );
}
