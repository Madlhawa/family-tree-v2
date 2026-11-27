import { expect, test, type Page } from '@playwright/test';
import { loadDemo, setupPassword, TEST_PASSWORD, unlock } from './helpers';

/** Everything stored in the app's IndexedDB, as one string. */
async function dumpDatabase(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('family-tree');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const out: unknown[] = [];
    for (const name of ['trees', 'meta', 'settings']) {
      const all = await new Promise<unknown[]>((res) => {
        const r = db.transaction(name).objectStore(name).getAll();
        r.onsuccess = () => res(r.result);
      });
      out.push(all);
    }
    db.close();
    return JSON.stringify(out);
  });
}

test('weak passwords are refused at setup', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('setup-password').fill('password123');
  await page.getByTestId('setup-password2').fill('password123');
  await expect(page.getByTestId('setup-submit')).toBeDisabled();
  await expect(page.getByTestId('setup-form')).toContainText('Too common');
});

test('the data on disk is encrypted, and reopening needs the password', async ({ page }) => {
  await loadDemo(page);
  await expect(page.locator('[data-person]', { hasText: 'Emma' }).first()).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved & encrypted');
  const dump = await dumpDatabase(page);
  expect(dump.length).toBeGreaterThan(1000);
  for (const secret of ['Carter', 'Emma', 'Walter', 'Okafor', TEST_PASSWORD]) expect(dump).not.toContain(secret);

  await page.reload();
  await expect(page.getByTestId('unlock-form')).toBeVisible();
  await expect(page.locator('[data-person]')).toHaveCount(0);
  // wrong password
  await page.getByTestId('unlock-password').fill('not-the-password-1');
  await page.getByTestId('unlock-submit').click();
  await expect(page.getByTestId('unlock-error')).toContainText('isn’t right');
  await unlock(page);
  await expect(page.locator('[data-person]', { hasText: 'Emma' }).first()).toBeVisible();
});

test('lock button and auto-lock return to the lock screen', async ({ page }) => {
  await page.clock.install();
  await loadDemo(page);
  await page.getByTestId('lock-button').click();
  await unlock(page);
  await expect(page.locator('[data-person]', { hasText: 'Emma' }).first()).toBeVisible();
  // 15 minutes with no activity
  await page.clock.fastForward('16:00');
  await expect(page.getByTestId('unlock-form')).toBeVisible();
});

test('forgotten password: recovery code sets a new one', async ({ page }) => {
  const code = await setupPassword(page);
  await page.getByTestId('onb-given').fill('Rosa');
  await page.getByTestId('onb-start').click();
  await expect(page.getByTestId('save-status')).toContainText('Saved & encrypted');
  await page.reload();
  await page.getByTestId('forgot').click();
  await page.getByTestId('recovery-input').fill(code.toLowerCase().replace(/-/g, ' '));
  await page.getByTestId('recovery-password').fill('brand-new-heron-lantern');
  await page.getByTestId('recovery-password2').fill('brand-new-heron-lantern');
  await page.getByTestId('recovery-submit').click();
  const newCode = (await page.getByTestId('recovery-code').textContent())!.trim();
  expect(newCode).not.toBe(code);
  await page.getByTestId('recovery-saved').check();
  await page.getByTestId('recovery-continue').click();
  await expect(page.locator('[data-person]', { hasText: 'Rosa' })).toBeVisible();
  await page.reload();
  await unlock(page, 'brand-new-heron-lantern');
  await expect(page.locator('[data-person]', { hasText: 'Rosa' })).toBeVisible();
});

test('encrypted backup round-trip', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-importexport').click();
  await page.getByTestId('export-encrypted').click();
  await page.getByTestId('backup-password').fill('backup-file-passphrase');
  await page.getByTestId('backup-password2').fill('backup-file-passphrase');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-download').click()]);
  const path = (await download.path())!;
  const text = (await import('node:fs')).readFileSync(path, 'utf8');
  expect(text).toContain('family-tree-encrypted-backup');
  expect(text).not.toContain('Carter');

  await page.getByRole('tab', { name: 'Import' }).click();
  await page.getByTestId('import-file').setInputFiles(path);
  await page.getByTestId('import-password').fill('wrong-passphrase-here');
  await page.getByTestId('import-unlock').click();
  await expect(page.getByRole('alert')).toContainText('doesn’t open');
  await page.getByTestId('import-password').fill('backup-file-passphrase');
  await page.getByTestId('import-unlock').click();
  await expect(page.getByText(/Restored .* as a new tree/)).toBeVisible();
});

test('the published page has a strict Content Security Policy and no violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await loadDemo(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  // use a few features, including the profile with its photo area
  await page.locator('[data-person="emma"]').click();
  await expect(page.getByTestId('profile')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('view-fan').click();
  await expect(page.getByTestId('fan-chart')).toBeVisible();
  expect(violations).toEqual([]);
  // an inline script injected into the page must not run
  const ran = await page.evaluate(() => {
    (window as unknown as { __x?: number }).__x = 0;
    const s = document.createElement('script');
    s.textContent = 'window.__x = 1';
    document.body.appendChild(s);
    return (window as unknown as { __x?: number }).__x;
  });
  expect(ran).toBe(0);
});
