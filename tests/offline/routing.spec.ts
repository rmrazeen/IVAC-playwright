import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import portal from '../../config/portal.json';
import type { PortalConfig } from '../../src/config';
import { AppointmentFlow } from '../../src/pages/AppointmentFlow';
import { SlotsPage } from '../../src/pages/SlotsPage';

function config(): PortalConfig {
  return {
    ...portal,
    dismissButtons: [],
    webfiles: {
      primaryInput: '#pdf', additionalInput: '#additional', primaryReady: '#primary-ready',
      applicantCount: '#count', continueButton: '#upload-next', maxBytes: 500000,
    },
    mission: {
      missionTrigger: '#mission', centerTrigger: '#center', ready: '#mission-next', continueButton: '#mission-next',
    },
    slots: {
      mode: 'select', dateSelect: '#dates', timeSelect: '', continueButton: '#booking-next',
      unavailable: '#unavailable', paymentReady: '#payment', resultTimeoutMs: 2000,
    },
  };
}

const noApplicantSettings = {
  uploadDir: 'does-not-exist', primaryWebfile: '', additionalWebfiles: [], mission: '', center: '',
};

test('existing applicant can go directly to dates without PDF files or mission settings', async ({ page }) => {
  await page.setContent(`<div id="appointment" hidden><select id="dates"><option value="date1">First date</option></select>
    <button id="booking-next">Continue Booking</button></div>
    <script>setTimeout(()=>document.querySelector('#appointment').hidden=false, 200)</script>`);
  expect(await new AppointmentFlow(page, config(), noApplicantSettings).prepare()).toBe('slots');
  await expect(page.locator('#booking-next')).toBeVisible();
});

test('skips upload when mission selection is the next page, including stale upload content', async ({ page }) => {
  await page.setContent(`<button id="upload-next" onclick="window.uploadClicked=true">Old upload button</button>
    <div id="mission-page"><select id="mission"><option>My Mission</option></select>
    <select id="center"><option>My Center</option></select>
    <button id="mission-next" onclick="document.querySelector('#mission-page').hidden=true;document.querySelector('#booking-next').hidden=false">Confirm Mission</button></div>
    <button id="booking-next" hidden>Continue Booking</button>`);
  const applicant = { ...noApplicantSettings, mission: 'My Mission', center: 'My Center' };
  expect(await new AppointmentFlow(page, config(), applicant).prepare()).toBe('slots');
  expect(await page.evaluate(() => (window as any).uploadClicked)).toBeUndefined();
});

test('new applicant still uploads once and passes mission selection before dates', async ({ page }) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ivac-route-'));
  try {
    fs.writeFileSync(path.join(folder, 'primary.pdf'), '%PDF-1.7\nlocal routing fixture');
    await page.setContent(`<div id="upload-page"><input id="pdf" type="file" hidden onchange="window.uploads=(window.uploads||0)+1;
      document.querySelector('#count').textContent='Total number of applicants: 1';document.querySelector('#primary-ready').hidden=false">
      <div id="count">Total number of applicants: 0</div><div id="primary-ready" hidden>Primary Applicant</div>
      <button id="upload-next" onclick="setTimeout(()=>{document.querySelector('#upload-page').hidden=true;document.querySelector('#mission-page').hidden=false},100)">Confirm Upload</button></div>
      <div id="mission-page" hidden><select id="mission"><option>My Mission</option></select>
      <select id="center"><option>My Center</option></select>
      <button id="mission-next" onclick="document.querySelector('#mission-page').hidden=true;document.querySelector('#booking-next').hidden=false">Confirm Mission</button></div>
      <button id="booking-next" hidden>Continue Booking</button>`);
    const applicant = {
      ...noApplicantSettings, uploadDir: folder, primaryWebfile: 'primary.pdf', mission: 'My Mission', center: 'My Center',
    };
    expect(await new AppointmentFlow(page, config(), applicant).prepare()).toBe('slots');
    expect(await page.evaluate(() => (window as any).uploads)).toBe(1);
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('already at payment leaves payment untouched and requires no upload or mission settings', async ({ page }) => {
  await page.setContent('<button id="payment" onclick="window.paid=true">Continue Payment</button>');
  expect(await new AppointmentFlow(page, config(), noApplicantSettings).prepare()).toBe('payment');
  await new SlotsPage(page, config().slots, []).reachPayment();
  expect(await page.evaluate(() => (window as any).paid)).toBeUndefined();
});
