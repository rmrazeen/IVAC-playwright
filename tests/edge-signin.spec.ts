import { test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

test('open IVAC sign-in in native Edge with existing sessions', async () => {
  test.skip(process.platform !== 'win32', 'This launcher uses Microsoft Edge on Windows.');

  const candidates = [
    process.env.EDGE_EXECUTABLE,
    process.env['ProgramFiles(x86)'] &&
      path.join(process.env['ProgramFiles(x86)']!, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) {
    throw new Error('Microsoft Edge was not found. Set EDGE_EXECUTABLE to the full path to msedge.exe.');
  }

  // Launch Edge normally: no temporary automation profile or cleared cookies.
  // Without an explicit profile, Edge chooses its normal last-used profile.
  const args = ['--new-window'];
  if (process.env.EDGE_PROFILE_DIRECTORY) {
    args.push(`--profile-directory=${process.env.EDGE_PROFILE_DIRECTORY}`);
  }
  args.push('https://appointment.ivacbd.com/signin');

  await new Promise<void>((resolve, reject) => {
    const edge = spawn(executable, args, { detached: true, stdio: 'ignore' });
    edge.once('error', reject);
    edge.once('spawn', () => {
      edge.unref();
      resolve();
    });
  });
});
