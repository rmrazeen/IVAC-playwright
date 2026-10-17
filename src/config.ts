import fs from 'node:fs';
import path from 'node:path';

export type Field = { selector: string; value: string; kind?: 'fill' | 'select' | 'check' };
export type ApplicationStep = {
  fields?: Field[];
  uploads?: { selector: string; file: string }[];
  continueButton?: string;
  ready?: string;
};
export type PortalConfig = {
  url: string;
  login: { username: string; password: string; submit: string; otp: string; verify: string; authenticated: string };
  dismissButtons: string[];
  applicationSteps: ApplicationStep[];
  webfiles?: { primaryInput: string; additionalInput: string; primaryReady: string; applicantCount: string; continueButton: string; maxBytes: number };
  mission?: { missionTrigger: string; centerTrigger: string; continueButton: string; ready: string };
  slots: { mode?: 'select' | 'calendar'; calendarDayButtons?: string; nextMonth?: string; maxMonths?: number; dateSelect: string; timeSelect: string; continueButton: string; unavailable: string; paymentReady: string; resultTimeoutMs: number };
  messages: { conversationHeader: string; incomingRows: string; messageText: string; messageIdAttribute: string; timestampAttribute: string };
};

export function settings() {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  const portal: PortalConfig = JSON.parse(fs.readFileSync(process.env.PORTAL_CONFIG || 'config/portal.json', 'utf8'));
  const mode = process.env.OTP_MODE || 'manual';
  if (!['manual', 'sms'].includes(mode)) throw new Error('OTP_MODE must be manual or sms.');
  const otpTimeout = Number(process.env.OTP_TIMEOUT_MS || 300000);
  if (!Number.isFinite(otpTimeout) || otpTimeout <= 0) throw new Error('OTP_TIMEOUT_MS must be positive.');
  return {
    portal,
    username: process.env.IVAC_USERNAME || '',
    password: process.env.IVAC_PASSWORD || '',
    endpoint: process.env.EDGE_CDP_URL || 'http://127.0.0.1:9222',
    otpMode: mode,
    otpTimeout,
    messagesUrl: process.env.MESSAGES_URL || 'https://messages.google.com/web/u/1/conversations/CggcDCPfRv2C3xIDNDIx',
    sender: process.env.SMS_SENDER || '01708-404440',
    uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
    primaryWebfile: process.env.PRIMARY_WEBFILE || '',
    additionalWebfiles: (process.env.ADDITIONAL_WEBFILES || '').split(';').map(value => value.trim()).filter(Boolean),
    mission: process.env.IVAC_MISSION || '',
    center: process.env.IVAC_CENTER || '',
  };
}

export function validateBooking(config: PortalConfig) {
  const required = {
    'login.authenticated': config.login.authenticated,
    'slots.dateControl': config.slots.mode === 'calendar' ? config.slots.calendarDayButtons : config.slots.dateSelect,
    'slots.continueButton': config.slots.continueButton,
    'slots.unavailable': config.slots.unavailable,
    'slots.paymentReady': config.slots.paymentReady,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Live page inspection is needed. Configure these selectors in config/portal.json: ${missing.join(', ')}`);
}
