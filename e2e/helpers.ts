import { expect, type Page } from '@playwright/test';

/** Test-only password, used only in these browser tests against the local preview build. */
export const TEST_PASSWORD = 'e2e-otter-violin-maple';

/** First visit: set the password, save the recovery code, land on onboarding. */
export async function setupPassword(page: Page, password = TEST_PASSWORD): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('setup-form')).toBeVisible();
  await page.getByTestId('setup-password').fill(password);
  await page.getByTestId('setup-password2').fill(password);
  await page.getByTestId('setup-submit').click();
  const code = (await page.getByTestId('recovery-code').textContent())!.trim();
  await page.getByTestId('recovery-saved').check();
  await page.getByTestId('recovery-continue').click();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  return code;
}

export async function unlock(page: Page, password = TEST_PASSWORD) {
  await expect(page.getByTestId('unlock-form')).toBeVisible();
  await page.getByTestId('unlock-password').fill(password);
  await page.getByTestId('unlock-submit').click();
  await expect(page.getByTestId('lock-screen')).toBeHidden();
}

export async function loadDemo(page: Page) {
  await setupPassword(page);
  await page.getByTestId('onb-demo').click();
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 5000 }).catch(() => {});
}
