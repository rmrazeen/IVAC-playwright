import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { PortalConfig } from '../config';
import { unique, visible } from '../support/ui';

export function validateWebfile(root: string, filename: string, maxBytes: number): string {
  if (!filename) throw new Error('Set PRIMARY_WEBFILE in .env to your applicant webfile PDF filename.');
  const actual = fs.realpathSync(path.resolve(root, filename));
  const relative = path.relative(fs.realpathSync(root), actual);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Webfiles must stay inside UPLOAD_DIR.');
  const stat = fs.statSync(actual);
  if (!stat.isFile() || path.extname(actual).toLowerCase() !== '.pdf' || stat.size > maxBytes) {
    throw new Error(`Webfile must be a PDF no larger than ${maxBytes} bytes.`);
  }
  const descriptor = fs.openSync(actual, 'r');
  const header = Buffer.alloc(5);
  try { fs.readSync(descriptor, header, 0, 5, 0); } finally { fs.closeSync(descriptor); }
  if (header.toString() !== '%PDF-') throw new Error('Webfile does not have a PDF header.');
  return actual;
}

export class WebfilesPage {
  constructor(private page: Page, private config: NonNullable<PortalConfig['webfiles']>, private root: string) {}

  async complete(primary: string, additional: string[]) {
    // Validate every local file before transmitting the immutable primary webfile.
    const files = [primary, ...additional].map(file => validateWebfile(this.root, file, this.config.maxBytes));
    if (new Set(files.map(file => file.toLowerCase())).size !== files.length) throw new Error('Each applicant needs a distinct PDF; duplicate file mapping detected.');
    if (await visible(this.page, this.config.primaryReady)) {
      throw new Error('A primary webfile is already uploaded. Review it manually; automation will not reupload or guess its identity.');
    }
    await this.upload(this.config.primaryInput, files[0]);
    await (await unique(this.page, this.config.primaryReady)).waitFor();
    await this.waitForCount(1);
    for (let index = 1; index < files.length; index++) {
      await this.upload(this.config.additionalInput, files[index]);
      await this.waitForCount(index + 1);
    }
    console.log('Webfiles uploaded. Waiting for the confirmation button; complete any Cloudflare check manually.');
    await (await unique(this.page, this.config.continueButton)).click({ timeout: 300000 });
  }

  private async upload(selector: string, file: string) {
    const input = this.page.locator(selector);
    await input.waitFor({ state: 'attached' });
    if (await input.count() !== 1) throw new Error('Webfile input selector is ambiguous. Inspect config/portal.json.');
    await input.setInputFiles(file);
  }

  private async waitForCount(expected: number) {
    const count = await unique(this.page, this.config.applicantCount);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (Number((await count.innerText()).match(/applicants:\s*(\d+)/i)?.[1]) === expected) return;
      await this.page.waitForTimeout(250);
    }
    throw new Error('Applicant count did not update after PDF upload. Inspect the open page.');
  }
}
