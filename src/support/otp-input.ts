import type { Page } from '@playwright/test';

export async function otpInputs(page: Page, selector: string) {
  const inputs = page.locator(selector).filter({ visible: true });
  await inputs.first().waitFor({ state: 'visible' });
  const count = await inputs.count();
  if (count !== 1 && count !== 6) throw new Error('Expected one OTP input or six separate digit inputs. Inspect the OTP selector.');
  return inputs;
}

export async function fillOtp(page: Page, selector: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('OTP must contain six digits.');
  const inputs = await otpInputs(page, selector);
  if (await inputs.count() === 1) await inputs.fill(code);
  else for (let index = 0; index < 6; index++) await inputs.nth(index).fill(code[index]);
}
