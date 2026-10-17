import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { unique, visible } from '../support/ui';
import { fillOtp } from '../support/otp-input';

export class LoginPage {
  constructor(readonly page: Page, private config: PortalConfig['login']) {}

  async fillCredentials(username: string, password: string) {
    if (!username || !password) throw new Error('Fill IVAC_USERNAME and IVAC_PASSWORD in .env.');
    await (await unique(this.page, this.config.username)).fill(username);
    await (await unique(this.page, this.config.password)).fill(password);
  }

  async submit() {
    console.log('Waiting for Sign In Now to become ready. Complete any Cloudflare check manually in Edge.');
    await (await unique(this.page, this.config.submit)).click({ timeout: 300000 });
  }

  async outcome(): Promise<'otp' | 'authenticated'> {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (await visible(this.page, this.config.authenticated)) return 'authenticated';
      if (await visible(this.page, this.config.otp)) return 'otp';
      await this.page.waitForTimeout(250);
    }
    throw new Error('Login did not reach OTP or the authenticated page. Check portal hours, errors, or complete any CAPTCHA manually.');
  }

  async verify(code: string) {
    await fillOtp(this.page, this.config.otp, code);
    await (await unique(this.page, this.config.verify)).click();
    await (await unique(this.page, this.config.authenticated)).waitFor({ state: 'visible', timeout: 120000 });
  }
}
