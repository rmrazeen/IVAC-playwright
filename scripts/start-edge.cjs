const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32') throw new Error('This launcher requires Windows.');
const endpoint = new URL(process.env.EDGE_CDP_URL || 'http://127.0.0.1:9222');
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname) || endpoint.protocol !== 'http:') {
  throw new Error('EDGE_CDP_URL must be a local HTTP endpoint.');
}
const candidates = [process.env.EDGE_EXECUTABLE,
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe')];
const executable = candidates.find(value => value && existsSync(value));
if (!executable) throw new Error('Set EDGE_EXECUTABLE to your msedge.exe path.');
const child = spawn(executable, [
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${endpoint.port || '9222'}`,
  `--profile-directory=${process.env.EDGE_PROFILE_DIRECTORY || 'Default'}`,
  '--new-window', 'https://appointment.ivacbd.com/signin',
], { detached: true, stdio: 'ignore' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('spawn', () => {
  child.unref();
  console.log('Native Edge launched. Checking local automation connection...');
});
(async () => {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch(`${endpoint.origin}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { console.log('Ready. Run npm.cmd run book in another terminal.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error('Edge opened, but remote debugging is unavailable. Close Edge yourself (including background instances), then retry. Some Edge versions require enabling remote debugging in edge://inspect. No Edge processes were killed and no profile was copied.');
  process.exitCode = 1;
})();
