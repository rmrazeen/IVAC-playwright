import { chromium, test } from '@playwright/test';
import { settings, validateBooking } from '../../src/config';
import { LoginPage } from '../../src/pages/LoginPage';
import { MessagesPage } from '../../src/pages/MessagesPage';
import { ApplicationPage } from '../../src/pages/ApplicationPage';
import { SlotsPage } from '../../src/pages/SlotsPage';
import { AppointmentFlow } from '../../src/pages/AppointmentFlow';
import { manualOtp } from '../../src/support/manual';
import { dismissNotices, visible } from '../../src/support/ui';

test('IVAC booking — stop at payment and leave native Edge open', async () => {
  const config = settings();
  validateBooking(config.portal);
  const endpoint = new URL(config.endpoint);
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Use a local Edge CDP endpoint.');
  // Edge is launched independently, so test teardown cannot close the native window.
  const browser = await chromium.connectOverCDP(config.endpoint);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No native Edge profile context found.');
  context.setDefaultTimeout(30000);
  const portalOrigin = new URL(config.portal.url).origin;
  const page = context.pages().find(tab => tab.url().startsWith(`${portalOrigin}/`)) || await context.newPage();
  await page.goto(config.portal.url, { waitUntil: 'domcontentloaded' });

  // A separate tab opens in both modes. Manual mode never reads SMS content.
  const messagesTab = await context.newPage();
  await messagesTab.goto(config.messagesUrl, { waitUntil: 'domcontentloaded' });
  const messages = new MessagesPage(messagesTab, config.portal.messages, config.sender);
  const login = new LoginPage(page, config.portal.login);
  await page.bringToFront();
  await dismissNotices(page, config.portal.dismissButtons);
  if (!await visible(page, config.portal.login.authenticated)) {
    await login.fillCredentials(config.username, config.password);
    // Baseline immediately before the action that requests the login OTP.
    const baseline = config.otpMode === 'sms'
      ? new Set((await messages.snapshot()).map(message => message.id)) : new Set<string>();
    const requestedAt = Date.now();
    await login.submit();
    if (await login.outcome() === 'otp') {
      const code = config.otpMode === 'sms'
        ? await messages.waitForNewOtp(baseline, requestedAt, config.otpTimeout)
        : await manualOtp(page, config.portal.login.otp, config.otpTimeout);
      await login.verify(code);
    }
  }
  await dismissNotices(page, config.portal.dismissButtons);
  if (config.portal.webfiles || config.portal.mission) {
    await new AppointmentFlow(page, config.portal, config).prepare();
  } else if (!config.portal.applicationSteps.length && !await visible(page, config.portal.slots.dateSelect)) {
    console.log('Applicant/upload mapping is not configured. Complete those steps manually in Edge; waiting for the date selection page.');
    await page.locator(config.portal.slots.dateSelect).waitFor({ state: 'visible', timeout: config.otpTimeout });
  }
  await new ApplicationPage(page, config.uploadDir, config.portal.dismissButtons).complete(config.portal.applicationSteps);
  await new SlotsPage(page, config.portal.slots, config.portal.dismissButtons).reachPayment();
  await page.bringToFront();
  console.log('Payment section reached. Automation stopped. Complete payment manually in Edge. The window will remain open.');
  // Do not call browser.close(), context.close(), or page.close(). This browser is user-owned.
});
