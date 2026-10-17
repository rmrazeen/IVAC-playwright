import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { dismissNotices, unique, visible } from '../support/ui';

export class SlotsPage {
  constructor(private page: Page, private config: PortalConfig['slots'], private notices: string[]) {}

  private async chooseCalendarDate(attempted: Set<string>): Promise<string | undefined> {
    for (let month = 0; month < (this.config.maxMonths || 1); month++) {
      const days = this.page.locator(this.config.calendarDayButtons!).filter({ visible: true });
      await days.first().waitFor();
      const candidates = await days.evaluateAll(buttons => buttons.map((button, index) => {
        const cell = button.closest('[data-day], [role="gridcell"], td') || button;
        const disabled = (button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true' ||
          cell.getAttribute('aria-disabled') === 'true' ||
          (cell.hasAttribute('data-disabled') && cell.getAttribute('data-disabled') !== 'false') ||
          (cell.hasAttribute('data-outside') && cell.getAttribute('data-outside') !== 'false');
        const raw = button.getAttribute('data-day') || cell.getAttribute('data-day') || button.getAttribute('aria-label') || '';
        let date = raw.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
        if (!date && /\d{4}/.test(raw)) {
          const parsed = new Date(raw.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').replace(/^(today|selected),?\s*/i, ''));
          if (!Number.isNaN(parsed.getTime())) date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        }
        return { index, date, disabled };
      }));
      if (candidates.some(day => !day.disabled && !day.date)) {
        throw new Error('Enabled calendar days lack full date metadata. Inspect calendarDayButtons and the live calendar markup.');
      }
      const next = candidates.filter(day => !day.disabled && day.date && !attempted.has(day.date))
        .sort((a, b) => a.date!.localeCompare(b.date!))[0];
      if (next) {
        await days.nth(next.index).click();
        return next.date;
      }
      if (!this.config.nextMonth || month + 1 >= (this.config.maxMonths || 1)) return undefined;
      const previous = await days.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')).join('|'));
      const nextMonth = await unique(this.page, this.config.nextMonth);
      if (!await nextMonth.isEnabled()) return undefined;
      await nextMonth.click();
      const deadline = Date.now() + this.config.resultTimeoutMs;
      while (await days.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')).join('|')) === previous) {
        if (Date.now() > deadline) throw new Error('Calendar month did not change.');
        await this.page.waitForTimeout(100);
      }
    }
  }

  async firstAvailable(select: string, attempted: Set<string>): Promise<string | undefined> {
    const locator = await unique(this.page, select);
    // dateSelect must be a chronological native <select>; disabled options are unavailable.
    return locator.locator('option').evaluateAll((options, tried) => {
      return (options as HTMLOptionElement[])
        .filter(option => option.value && !option.disabled &&
          !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) &&
          !tried.includes(option.value))[0]?.value;
    }, [...attempted]);
  }

  async reachPayment() {
    const attempted = new Set<string>();
    while (true) {
      if (await visible(this.page, this.config.paymentReady)) return;
      await dismissNotices(this.page, this.notices);
      const calendar = this.config.mode === 'calendar';
      const date = calendar ? await this.chooseCalendarDate(attempted) : await this.firstAvailable(this.config.dateSelect, attempted);
      if (!date) throw new Error('No remaining available dates. Browser left open; no automatic refresh loop.');
      attempted.add(date);
      if (!calendar) await (await unique(this.page, this.config.dateSelect)).selectOption(date);
      if (this.config.timeSelect) {
        const time = await this.waitForTime();
        if (!time) continue;
        await (await unique(this.page, this.config.timeSelect)).selectOption(time);
      }
      // Require the previous failure to clear before another submission.
      if (await visible(this.page, this.config.unavailable)) {
        await this.page.locator(this.config.unavailable).filter({ visible: true }).waitFor({ state: 'hidden', timeout: this.config.resultTimeoutMs });
      }
      console.log('Waiting for Continue Booking. Complete any Cloudflare check manually in Edge.');
      await (await unique(this.page, this.config.continueButton)).click({ timeout: 300000 });
      const result = await this.waitForResult();
      if (result === 'payment') return;
      // Retry a different date only on an explicit, configured unavailability message.
      console.log('Selected date is unavailable. Trying the next available date.');
    }
  }

  private async waitForTime(): Promise<string | undefined> {
    const deadline = Date.now() + this.config.resultTimeoutMs;
    while (Date.now() < deadline) {
      const time = await this.firstAvailable(this.config.timeSelect, new Set());
      if (time) return time;
      if (await visible(this.page, this.config.unavailable)) return undefined;
      await this.page.waitForTimeout(250);
    }
    throw new Error('Time options did not load. Stopping rather than assuming the date failed.');
  }

  private async waitForResult(): Promise<'payment' | 'unavailable'> {
    const deadline = Date.now() + this.config.resultTimeoutMs;
    while (Date.now() < deadline) {
      if (await visible(this.page, this.config.paymentReady)) return 'payment';
      if (await visible(this.page, this.config.unavailable)) return 'unavailable';
      await this.page.waitForTimeout(250);
    }
    throw new Error('Slot submission outcome is unknown. Stopping to avoid duplicate submissions; check the open browser.');
  }
}
