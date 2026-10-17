import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LoginPage } from '../../src/pages/LoginPage';
import { ApplicationPage } from '../../src/pages/ApplicationPage';
import { SlotsPage } from '../../src/pages/SlotsPage';
import { MessagesPage } from '../../src/pages/MessagesPage';
import { WebfilesPage, validateWebfile } from '../../src/pages/WebfilesPage';
import { MissionPage } from '../../src/pages/MissionPage';
import { dismissNotices } from '../../src/support/ui';
import { manualOtp } from '../../src/support/manual';
import { latestNewOtp, parseIvacOtp } from '../../src/support/otp';

const sms = '(IVACBD) For security, type the following sequence when prompted Eight-Two-Eight-Five-Four-One .';
const messageConfig = {
  conversationHeader: '#sender', incomingRows: '.incoming', messageText: '.body',
  messageIdAttribute: 'data-id', timestampAttribute: 'data-time',
};

test('parses word OTP and rejects malformed/non-IVAC messages', () => {
  expect(parseIvacOtp(sms)).toBe('828541');
  expect(parseIvacOtp(sms.replace('Eight-Two-Eight-Five-Four-One', 'Zero-One-Two-Three-Four-Five'))).toBe('012345');
  expect(parseIvacOtp(sms.replace('(IVACBD)', '(OTHER)'))).toBeNull();
  expect(parseIvacOtp(sms.replace('Eight-Two-Eight-Five-Four-One', 'Eight-Two'))).toBeNull();
});

test('uses latest new matching OTP and excludes newly rendered old history', () => {
  const messages = [
    { id: 'seen', text: sms, receivedAt: 1000 },
    { id: 'history', text: sms, receivedAt: 10 },
    { id: 'new1', text: sms, receivedAt: 2000 },
    { id: 'new2', text: sms.replace('Eight-Two-Eight-Five-Four-One', 'One-Two-Three-Four-Five-Six'), receivedAt: 3000 },
    { id: 'unrelated', text: 'Hello', receivedAt: 4000 },
  ];
  expect(latestNewOtp(messages, new Set(['seen']), 1500)?.code).toBe('123456');
  expect(latestNewOtp(messages.slice(0, 2), new Set(['seen']), 1500)).toBeNull();
});

test('fills credentials, waits for manual browser OTP and authenticates', async ({ page }) => {
  await page.setContent(`<input id="username"><input id="password" type="password">
    <button id="submit" onclick="document.querySelector('#otp').hidden=false">Sign in</button>
    <input id="otp" hidden><button id="verify" onclick="document.querySelector('#home').hidden=false">Verify</button>
    <div id="home" hidden>Application</div>`);
  const login = new LoginPage(page, {
    username: '#username', password: '#password', submit: '#submit',
    otp: '#otp', verify: '#verify', authenticated: '#home',
  });
  await login.fillCredentials('local-test-user', 'local-test-password');
  await expect(page.locator('#username')).toHaveValue('local-test-user');
  await expect(page.locator('#password')).toHaveValue('local-test-password');
  await login.submit();
  expect(await login.outcome()).toBe('otp');
  const waiting = manualOtp(page, '#otp', 5000);
  await page.locator('#otp').fill('828541');
  await login.verify(await waiting);
  await expect(page.locator('#home')).toBeVisible();
});

test('dismisses a configured notice and uploads a mapped file', async ({ page }) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ivac-upload-'));
  fs.writeFileSync(path.join(folder, 'sample.txt'), 'offline upload test');
  try {
    await page.setContent(`<div role="dialog"><button aria-label="Close" onclick="this.parentElement.remove()">Close</button></div>
      <input id="name"><input id="upload" type="file" hidden>`);
    await dismissNotices(page, ['[role="dialog"] button[aria-label="Close"]']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await new ApplicationPage(page, folder, []).complete([{
      fields: [{ selector: '#name', value: 'Test Applicant' }],
      uploads: [{ selector: '#upload', file: 'sample.txt' }],
    }]);
    expect(await page.locator('#upload').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('sample.txt');
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('rejects an upload outside the configured folder', async ({ page }) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ivac-boundary-'));
  fs.mkdirSync(path.join(folder, 'allowed'));
  fs.writeFileSync(path.join(folder, 'outside.txt'), 'must not upload');
  try {
    await page.setContent('<input id="upload" type="file">');
    await expect(new ApplicationPage(page, path.join(folder, 'allowed'), []).complete([
      { uploads: [{ selector: '#upload', file: '../outside.txt' }] },
    ])).rejects.toThrow('inside UPLOAD_DIR');
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('falls back to next date on explicit failure and never clicks payment', async ({ page }) => {
  await page.setContent(`<select id="dates" onchange="document.querySelector('#error').hidden=true">
    <option value="">Choose</option><option value="unavailable" disabled>Unavailable</option>
    <option value="2026-10-18">18 October</option><option value="2026-10-19">19 October</option>
    </select><div id="error" hidden>Date unavailable</div><div id="payment" hidden>
    <button id="pay" onclick="window.paid=true">Pay</button></div>
    <button id="continue" onclick="window.attempts=(window.attempts||[]).concat(document.querySelector('#dates').value);
    document.querySelector(document.querySelector('#dates').value==='2026-10-18'?'#error':'#payment').hidden=false">Continue</button>`);
  await new SlotsPage(page, {
    dateSelect: '#dates', timeSelect: '', continueButton: '#continue',
    unavailable: '#error', paymentReady: '#payment', resultTimeoutMs: 1000,
  }, []).reachPayment();
  expect(await page.evaluate(() => (window as any).attempts)).toEqual(['2026-10-18', '2026-10-19']);
  expect(await page.evaluate(() => (window as any).paid)).toBeUndefined();
  await expect(page.locator('#payment')).toBeVisible();
});

test('stops on unknown outcome without submitting another date', async ({ page }) => {
  await page.setContent(`<select id="dates"><option value="date1">First</option><option value="date2">Second</option></select>
    <button id="continue" onclick="window.attempts=(window.attempts||0)+1">Continue</button>
    <div id="error" hidden></div><div id="payment" hidden></div>`);
  await expect(new SlotsPage(page, {
    dateSelect: '#dates', timeSelect: '', continueButton: '#continue',
    unavailable: '#error', paymentReady: '#payment', resultTimeoutMs: 300,
  }, []).reachPayment()).rejects.toThrow('outcome is unknown');
  expect(await page.evaluate(() => (window as any).attempts)).toBe(1);
});

test('reads only allowed sender and newest fresh incoming SMS', async ({ page }) => {
  await page.setContent(`<h1 id="sender">01708-404440</h1>
    <div class="incoming" data-id="old" data-time="1700000000000"><span class="body">${sms}</span></div>`);
  const messages = new MessagesPage(page, messageConfig, '01708-404440');
  const baseline = new Set((await messages.snapshot()).map(message => message.id));
  await page.evaluate(text => {
    const row = document.createElement('div');
    row.className = 'incoming'; row.dataset.id = 'new'; row.dataset.time = '1700000002000';
    const body = document.createElement('span'); body.className = 'body'; body.textContent = text;
    row.append(body); document.body.append(row);
  }, sms);
  expect(await messages.waitForNewOtp(baseline, 1700000001000, 1000)).toBe('828541');
  await page.locator('#sender').evaluate(element => { element.textContent = '01708-404441'; });
  await expect(messages.snapshot()).rejects.toThrow('exact allowed sender');
});

test('supports six separate OTP digit boxes as shown in the video', async ({ page }) => {
  await page.setContent(`${'<input class="digit" maxlength="1">'.repeat(6)}
    <button id="verify" onclick="document.querySelector('#home').hidden=false">Verify OTP</button>
    <div id="home" hidden>Logged in</div>`);
  const waiting = manualOtp(page, '.digit', 5000);
  for (let index = 0; index < 6; index++) await page.locator('.digit').nth(index).fill('828541'[index]);
  const code = await waiting;
  expect(code).toBe('828541');
  await new LoginPage(page, {
    username: '', password: '', submit: '', otp: '.digit', verify: '#verify', authenticated: '#home',
  }).verify(code);
  await expect(page.locator('#home')).toBeVisible();
});

test('calendar skips disabled/outside days, sorts actual dates and retries the next date', async ({ page }) => {
  await page.setContent(`<div id="calendar">
    <button class="day" data-day="2030-10-20" onclick="choose(this)">20</button>
    <button class="day" data-day="2030-10-17" disabled>17</button>
    <div data-day="2030-09-30" data-outside="true"><button class="day">30</button></div>
    <button class="day" data-day="2030-10-18" onclick="choose(this)">18</button>
    </div><div id="error" hidden>Slot unavailable</div><div id="payment" hidden>
    <button onclick="window.paid=true">Continue Payment</button></div>
    <button id="continue" onclick="window.attempts=(window.attempts||[]).concat(window.chosen);
    document.querySelector(window.chosen==='2030-10-18'?'#error':'#payment').hidden=false">Continue Booking</button>
    <script>function choose(button){window.chosen=button.dataset.day;document.querySelector('#error').hidden=true}</script>`);
  await new SlotsPage(page, {
    mode: 'calendar', calendarDayButtons: '.day', dateSelect: '', timeSelect: '',
    continueButton: '#continue', unavailable: '#error', paymentReady: '#payment', resultTimeoutMs: 1000,
  }, []).reachPayment();
  expect(await page.evaluate(() => (window as any).attempts)).toEqual(['2030-10-18', '2030-10-20']);
  expect(await page.evaluate(() => (window as any).paid)).toBeUndefined();
});

test('uploads applicant webfile PDFs and rejects oversize or disguised files', async ({ page }) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ivac-webfiles-'));
  try {
    fs.writeFileSync(path.join(folder, 'primary.pdf'), '%PDF-1.7\nlocal sample primary');
    fs.writeFileSync(path.join(folder, 'additional.pdf'), '%PDF-1.7\nlocal sample additional');
    fs.writeFileSync(path.join(folder, 'fake.pdf'), 'not a PDF');
    fs.writeFileSync(path.join(folder, 'large.pdf'), Buffer.alloc(500001));
    expect(() => validateWebfile(folder, 'fake.pdf', 500000)).toThrow('PDF header');
    expect(() => validateWebfile(folder, 'large.pdf', 500000)).toThrow('no larger');
    await page.setContent(`<input id="primary" type="file" hidden onchange="document.querySelector('#count').textContent='Total number of applicants: 1'; document.querySelector('#primary-ready').hidden=false">
      <input id="additional" type="file" hidden onchange="document.querySelector('#count').textContent='Total number of applicants: 2'">
      <div id="primary-ready" hidden>Primary Applicant</div><div id="count">Total number of applicants: 0</div>
      <button id="confirm" onclick="window.confirmed=true">Confirm All Information is Correct</button>`);
    const webfiles = new WebfilesPage(page, {
      primaryInput: '#primary', additionalInput: '#additional', primaryReady: '#primary-ready',
      applicantCount: '#count', continueButton: '#confirm', maxBytes: 500000,
    }, folder);
    await webfiles.complete('primary.pdf', ['additional.pdf']);
    expect(await page.evaluate(() => (window as any).confirmed)).toBe(true);
    await expect(webfiles.complete('primary.pdf', [])).rejects.toThrow('already uploaded');
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('selects only the configured mission and center before confirming', async ({ page }) => {
  await page.setContent(`<select id="mission"><option>Select</option><option>Test Mission</option></select>
    <button id="center" onclick="document.querySelector('#options').hidden=false">Select your IVAC center</button>
    <div id="options" hidden><span onclick="window.center=this.textContent;this.parentElement.hidden=true">Test Center</span></div>
    <button id="confirm" onclick="window.confirmed=true">Confirm Mission &amp; IVAC Center</button>`);
  const mission = new MissionPage(page, {
    missionTrigger: '#mission', centerTrigger: '#center', ready: '#confirm', continueButton: '#confirm',
  });
  await expect(mission.complete('', '')).rejects.toThrow('IVAC_MISSION');
  await mission.complete('Test Mission', 'Test Center');
  await expect(page.locator('#mission')).toHaveValue('Test Mission');
  expect(await page.evaluate(() => (window as any).center)).toBe('Test Center');
  expect(await page.evaluate(() => (window as any).confirmed)).toBe(true);
});
