import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { latestNewOtp, type Sms } from '../support/otp';
import { unique } from '../support/ui';

const phoneDigits = (value: string) => value.replace(/\D/g, '').replace(/^880/, '0');

export class MessagesPage {
  constructor(private page: Page, private config: PortalConfig['messages'], private sender: string) {}

  async assertSender() {
    if (!this.config.conversationHeader || !this.config.incomingRows || !this.config.messageText) {
      throw new Error('SMS mode requires inspected conversationHeader, incomingRows and messageText selectors in config/portal.json. Use OTP_MODE=manual until configured.');
    }
    const header = await (await unique(this.page, this.config.conversationHeader)).innerText();
    const numbers = header.match(/\+?\d[\d\s()-]{7,}\d/g) || [];
    if (!numbers.some(number => phoneDigits(number) === phoneDigits(this.sender))) {
      throw new Error('The Messages conversation header does not show the exact allowed sender. No SMS read.');
    }
  }

  async snapshot(): Promise<Sms[]> {
    await this.assertSender();
    const rows = this.page.locator(this.config.incomingRows);
    const messages: Sms[] = [];
    for (let index = 0; index < await rows.count(); index++) {
      const row = rows.nth(index);
      const id = await row.getAttribute(this.config.messageIdAttribute);
      if (!id) throw new Error('Each incoming SMS must have a stable unique message ID. Update messageIdAttribute.');
      const timestamp = await row.getAttribute(this.config.timestampAttribute);
      const receivedAt = timestamp && /^\d{13}$/.test(timestamp) ? Number(timestamp) : Date.parse(timestamp || '');
      if (!Number.isFinite(receivedAt)) throw new Error('Each SMS needs a timestamp in ISO format or epoch milliseconds. Update timestampAttribute.');
      messages.push({ id, receivedAt, text: await row.locator(this.config.messageText).innerText() });
    }
    if (new Set(messages.map(message => message.id)).size !== messages.length) throw new Error('SMS IDs are not unique.');
    return messages;
  }

  async waitForNewOtp(baseline: Set<string>, requestedAt: number, timeout: number) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = latestNewOtp(await this.snapshot(), baseline, requestedAt);
      if (result) return result.code;
      await this.page.waitForTimeout(1000);
    }
    throw new Error('No new matching IVAC OTP arrived. Old messages were not reused.');
  }
}
