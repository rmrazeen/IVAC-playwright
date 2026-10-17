import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { WebfilesPage } from './WebfilesPage';
import { MissionPage } from './MissionPage';
import { dismissNotices, visible } from '../support/ui';

type Stage = 'upload' | 'mission' | 'slots' | 'payment';
type ApplicantSettings = {
  uploadDir: string;
  primaryWebfile: string;
  additionalWebfiles: string[];
  mission: string;
  center: string;
};

export class AppointmentFlow {
  constructor(private page: Page, private config: PortalConfig, private applicant: ApplicantSettings) {}

  async prepare(): Promise<'slots' | 'payment'> {
    const completed = new Set<Stage>();
    while (true) {
      const stage = await this.waitForStage(completed);
      if (stage === 'slots' || stage === 'payment') {
        console.log(`Appointment flow reached ${stage}; skipping any upload/mission pages the portal omitted.`);
        return stage;
      }
      if (stage === 'upload') {
        await new WebfilesPage(this.page, this.config.webfiles!, this.applicant.uploadDir)
          .complete(this.applicant.primaryWebfile, this.applicant.additionalWebfiles);
      } else {
        await new MissionPage(this.page, this.config.mission!)
          .complete(this.applicant.mission, this.applicant.center);
      }
      completed.add(stage);
    }
  }

  private async waitForStage(completed: Set<Stage>): Promise<Stage> {
    const deadline = Date.now() + this.config.slots.resultTimeoutMs;
    while (Date.now() < deadline) {
      await dismissNotices(this.page, this.config.dismissButtons);
      // Prefer later pages if old content is still present during a redirect.
      if (await visible(this.page, this.config.slots.paymentReady)) return 'payment';
      if (await visible(this.page, this.config.slots.continueButton)) return 'slots';
      if (!completed.has('mission') && this.config.mission && await visible(this.page, this.config.mission.ready)) return 'mission';
      if (!completed.has('upload') && !completed.has('mission') && this.config.webfiles &&
          await visible(this.page, this.config.webfiles.continueButton)) return 'upload';
      await this.page.waitForTimeout(200);
    }
    throw new Error('No next appointment page appeared (upload, mission, dates, or payment). Browser left open; no upload was guessed or repeated.');
  }
}
