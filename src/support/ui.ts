import type { Locator, Page } from '@playwright/test';

export async function unique(page: Page, selector: string): Promise<Locator> {
  if (!selector) throw new Error('A required selector is empty. Update config/portal.json.');
  const locator = page.locator(selector).filter({ visible: true });
  await locator.first().waitFor({ state: 'visible' });
  if (await locator.count() !== 1) throw new Error(`Expected one visible element for selector: ${selector}`);
  return locator;
}

export async function visible(page: Page, selector: string): Promise<boolean> {
  return !!selector && await page.locator(selector).filter({ visible: true }).count() > 0;
}

export async function dismissNotices(page: Page, selectors: string[]) {
  for (let round = 0; round < 10; round++) {
    let dismissed = false;
    for (const selector of selectors) {
      const buttons = page.locator(selector).filter({ visible: true });
      if (await buttons.count() === 1) {
        await buttons.click();
        dismissed = true;
      }
    }
    if (!dismissed) return;
  }
  throw new Error('Notices keep reappearing; dismiss them manually and inspect the page.');
}
