import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { ApplicationStep } from '../config';
import { dismissNotices, unique } from '../support/ui';

export class ApplicationPage {
  constructor(private page: Page, private uploadDir: string, private dismissButtons: string[]) {}

  async complete(steps: ApplicationStep[]) {
    for (const step of steps) {
      await dismissNotices(this.page, this.dismissButtons);
      if (step.ready) await (await unique(this.page, step.ready)).waitFor();
      for (const field of step.fields || []) {
        const locator = await unique(this.page, field.selector);
        if (field.kind === 'select') await locator.selectOption({ label: field.value });
        else if (field.kind === 'check') await locator.setChecked(field.value === 'true');
        else await locator.fill(field.value);
      }
      for (const upload of step.uploads || []) {
        const file = path.resolve(this.uploadDir, upload.file);
        const root = fs.realpathSync(this.uploadDir);
        const actual = fs.realpathSync(file);
        const relative = path.relative(root, actual);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(actual).isFile()) {
          throw new Error('Uploads must be files inside UPLOAD_DIR.');
        }
        // File inputs are commonly hidden behind styled upload buttons.
        const input = this.page.locator(upload.selector);
        await input.waitFor({ state: 'attached' });
        if (await input.count() !== 1) throw new Error(`Upload selector is ambiguous: ${upload.selector}`);
        await input.setInputFiles(actual);
      }
      if (step.continueButton) await (await unique(this.page, step.continueButton)).click();
    }
  }
}
