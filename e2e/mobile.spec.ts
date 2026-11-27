import { expect, test } from '@playwright/test';
import { loadDemo } from './helpers';

test('works on a phone: no horizontal scroll, profile is a full-screen sheet', async ({ page }) => {
  await loadDemo(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // first tap selects and shows the add buttons, second tap opens the profile
  const tile = page.locator('[data-person="emma"]');
  await tile.tap();
  await expect(page.getByTestId('add-child')).toBeVisible();
  await tile.tap();
  const profile = page.getByTestId('profile');
  await expect(profile).toBeVisible();
  const box = await profile.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.width).toBeGreaterThanOrEqual(vw - 4);
});
