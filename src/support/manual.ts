import type { Page } from '@playwright/test';
import { otpInputs } from './otp-input';

export async function manualOtp(page: Page, selector: string, timeout: number): Promise<string> {
  console.log('Waiting for your OTP. Type the latest six-digit code into the OTP field in Edge; automation will click Verify.');
  await page.bringToFront();
  const inputs = await otpInputs(page, selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const code = (await Promise.all(Array.from({ length: await inputs.count() }, (_, index) => inputs.nth(index).inputValue()))).join('').trim();
    if (/^\d{6}$/.test(code)) return code;
    await page.waitForTimeout(250);
  }
  throw new Error('Manual OTP entry timed out. Browser left open.');
}
