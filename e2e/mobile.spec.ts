import { expect, test } from '@playwright/test';

test('works on a phone: no horizontal scroll, profile is a full-screen sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onb-demo').click();
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 5000 }).catch(() => {});
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
