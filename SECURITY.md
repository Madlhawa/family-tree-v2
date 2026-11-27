# Security

Family Tree is a static web app. There is no server and no account: your trees, photos and
settings are stored only in your browser on your device.

## How your data is protected

- **Encrypted at rest.** Everything is encrypted with AES-256-GCM before it is saved. The key
  comes from your password via PBKDF2-SHA256 with 600,000 rounds and a random salt. Your
  password and recovery code are never stored.
- **Lock screen.** Nothing is decrypted until you unlock. The app locks itself after a period
  without activity (15 minutes by default; change it under Menu → Password & security). It also
  locks when you press the lock button. Locking reloads the page, which clears all decrypted
  data from memory.
- **Guessing is slowed down.** After 5 wrong passwords the app makes you wait, starting at 30
  seconds and doubling each time.
- **Recovery code.** You get it once, at setup. It's the only way back in if you forget your
  password, so keep it somewhere safe and separate from the password.
- **Encrypted backups.** "Encrypted backup" files are protected with a password you choose.
  Plain JSON and GEDCOM exports are *not* encrypted, and the app says so where you download
  them.
- **Strict Content Security Policy.** Only the app's own scripts can run. The only outside
  services are OpenStreetMap map tiles and place search, used only when you open the map.
  The font is self-hosted, and pages from other sites can't embed the app.
- **Untrusted files are cleaned.** Imported files are rebuilt field by field. Unknown fields,
  `__proto__`-style ids, remote image URLs and anything that isn't an embedded image or audio
  file are dropped.

## What this does not protect against

- Someone who knows your password or recovery code, or who watches you type it.
- Malware on your device, or a browser extension that can read every page.
- Losing both your password and your recovery code. The data can't be recovered then, by
  anyone.

## Protecting the published site

Only people who can push to this repository can change the site. To keep it that way:

- The account has two-factor authentication.
- The `master` branch can't be force-pushed or deleted.
- Workflow actions are pinned to exact commits.
- Dependabot and `npm audit` watch the dependencies.
- Secret scanning with push protection is on.

## Reporting a problem

Please open a private security advisory on this repository (Security → Report a
vulnerability) instead of a public issue.
