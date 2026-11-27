import { expect, test, type Page } from '@playwright/test';
import { loadDemo, setupPassword, unlock } from './helpers';

async function start(page: Page) {
  await setupPassword(page);
}

async function addViaHover(page: Page, name: string, button: 'add-parent' | 'add-child' | 'add-spouse' | 'add-sibling', given: string, opts: { born?: string } = {}) {
  await page.locator(`[data-person]`, { hasText: name }).first().hover();
  await page.getByTestId(button).click();
  const form = page.getByTestId('add-form');
  await expect(form).toBeVisible();
  await form.getByTestId('add-given').fill(given);
  if (opts.born) await form.getByTestId('add-born').fill(opts.born);
  await form.getByTestId('add-given').press('Enter');
  await expect(form).toBeHidden();
}

test('start with yourself, then add parents, partner and a child', async ({ page }) => {
  await start(page);
  await page.getByTestId('onb-given').fill('Alex');
  await page.getByTestId('onb-surname').fill('Rivera');
  await page.getByTestId('onb-start').click();
  await expect(page.locator('[data-person]', { hasText: 'Alex Rivera' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved & encrypted');

  await page.getByTestId('next-parent').click();
  const form = page.getByTestId('add-form');
  await expect(form).toContainText('Adding a father');
  await expect(form.getByTestId('add-surname')).toHaveValue('Rivera');
  await form.getByTestId('add-given').fill('Carlos');
  await form.getByTestId('add-born').fill('c. 1950');
  await expect(form).toContainText('Reads as: c. 1950');
  await form.getByTestId('add-save').click();
  await expect(page.getByText('Added Carlos Rivera as parent of Alex Rivera')).toBeVisible();

  await addViaHover(page, 'Alex Rivera', 'add-parent', 'Maria');
  await addViaHover(page, 'Alex Rivera', 'add-spouse', 'Sam');
  await addViaHover(page, 'Alex Rivera', 'add-child', 'Luna', { born: '2020' });
  for (const n of ['Carlos Rivera', 'Maria', 'Sam', 'Luna']) await expect(page.locator('[data-person]', { hasText: n }).first()).toBeVisible();

  // Undo via shortcut removes Luna, redo brings her back
  await page.locator('body').press('Control+z');
  await expect(page.locator('[data-person]', { hasText: 'Luna' })).toHaveCount(0);
  await page.locator('body').press('Control+y');
  await expect(page.locator('[data-person]', { hasText: 'Luna' })).toHaveCount(1);

  // Persisted after reload
  await expect(page.getByTestId('save-status')).toContainText('Saved & encrypted');
  await page.reload();
  await unlock(page);
  await expect(page.locator('[data-person]', { hasText: 'Luna' })).toHaveCount(1);
});

test('edit a profile and undo from the toast', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-search').click();
  await page.getByTestId('search-input').fill('Walter');
  await page.getByTestId('search-input').press('Enter');
  await page.locator('[data-person]', { hasText: 'Walter Carter' }).click();
  const profile = page.getByTestId('profile');
  await expect(profile.getByTestId('profile-name')).toHaveText('Walter Carter');
  await profile.getByTestId('edit-person').click();
  await profile.getByTestId('edit-given').fill('Walter James');
  await profile.getByTestId('edit-save').click();
  await expect(profile.getByTestId('profile-name')).toHaveText('Walter James Carter');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(profile.getByTestId('profile-name')).toHaveText('Walter Carter');
});

test('relationship finder names the relationship', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-relationship').click();
  const dlg = page.getByRole('dialog', { name: 'Relationship finder' });
  await dlg.getByLabel('Relative').fill('Chidi');
  await dlg.getByRole('option', { name: /Chidi Okafor/ }).click();
  await expect(dlg.getByTestId('relationship-result')).toContainText('1st cousin');
});

test('views and public view', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('view-fan').click();
  await expect(page.getByTestId('fan-chart')).toBeVisible();
  await page.getByTestId('view-ancestors').click();
  // Emma + parents + 4 grandparents + 4 great-grandparents
  await expect(page.locator('[data-person]')).toHaveCount(11);
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-public').click();
  // Emma is living: initials only
  await expect(page.locator('[data-person]', { hasText: 'E. C.' })).toHaveCount(1);
  await expect(page.locator('[data-person]', { hasText: 'Arthur Carter' })).toHaveCount(1);
});

test('multiple trees and GEDCOM round-trip', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-importexport').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-gedcom').click()]);
  const path = await download.path();
  // import it back into a new tree
  await page.getByRole('tab', { name: 'Import' }).click();
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByText(/Imported \d+ people/)).toBeVisible();
  await page.getByTestId('tree-picker').click();
  await expect(page.getByRole('menuitemcheckbox')).toHaveCount(2);
});

test('quick entry adds a whole family', async ({ page }) => {
  await start(page);
  await page.getByTestId('onb-given').fill('Rosa');
  await page.getByTestId('onb-start').click();
  await page.getByTestId('main-menu').click();
  await page.getByTestId('menu-quick').click();
  await page.getByTestId('quick-text').fill('spouse: Tom Baker (M)\nchildren: Ann (F, 1990), Ben (M, 1992)');
  await page.getByTestId('quick-apply').click();
  for (const n of ['Tom Baker', 'Ann', 'Ben']) await expect(page.locator('[data-person]', { hasText: n }).first()).toBeVisible();
});
