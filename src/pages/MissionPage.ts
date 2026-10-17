import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { unique } from '../support/ui';

export class MissionPage {
  constructor(private page: Page, private config: NonNullable<PortalConfig['mission']>) {}

  async complete(mission: string, center: string) {
    if (!mission || !center) throw new Error('Set IVAC_MISSION and IVAC_CENTER in .env. Use exact option labels for your own application.');
    await (await unique(this.page, this.config.ready)).waitFor();
    await this.choose(this.config.missionTrigger, mission);
    await this.choose(this.config.centerTrigger, center);
    await (await unique(this.page, this.config.continueButton)).click({ timeout: 300000 });
  }

  private async choose(selector: string, label: string) {
    const control = await unique(this.page, selector);
    if (await control.evaluate(element => element.tagName === 'SELECT')) {
      await control.selectOption({ label });
    } else {
      await control.click();
      const option = this.page.getByText(label, { exact: true }).filter({ visible: true });
      await option.first().waitFor();
      if (await option.count() !== 1) throw new Error('Mission/center option is ambiguous. Inspect its selector before proceeding.');
      await option.click();
    }
  }
}
