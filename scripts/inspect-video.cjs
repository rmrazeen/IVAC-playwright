// Local-only frame extraction using installed Edge's WebM decoder.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const file = path.resolve(process.argv[2] || 'videoplayback.webm');
  const size = fs.statSync(file).size;
  const server = http.createServer((request, response) => {
    if (request.url === '/video') {
      const match = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      response.writeHead(match ? 206 : 200, {
        'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      });
      fs.createReadStream(file, { start, end }).pipe(response);
    } else {
      response.end('<!doctype html><video src="/video" preload="auto" muted></video>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const info = await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video.videoWidth) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    });
    console.log(JSON.stringify(info));
    const times = process.argv[3] ? process.argv[3].split(',').map(Number) :
      Array.from({ length: Math.ceil(info.duration / 20) }, (_, index) => Math.min(index * 20 + 1, info.duration - 0.1));
    fs.mkdirSync('research/video', { recursive: true });
    const detailed = process.argv[4] === 'full';
    for (let offset = 0; offset < times.length; offset += detailed ? 1 : 12) {
      const group = times.slice(offset, offset + (detailed ? 1 : 12));
      const data = await page.evaluate(async ({ samples, detailed }) => {
        const video = document.querySelector('video');
        const width = detailed ? 1920 : 640;
        const columns = detailed ? 1 : 3;
        const height = Math.round(video.videoHeight * width / video.videoWidth);
        const sheet = document.createElement('canvas');
        sheet.width = width * columns;
        sheet.height = (height + 32) * Math.ceil(samples.length / columns);
        const context = sheet.getContext('2d');
        context.fillStyle = '#222'; context.fillRect(0, 0, sheet.width, sheet.height);
        for (let index = 0; index < samples.length; index++) {
          video.currentTime = samples[index];
          await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
          const x = (index % columns) * width, y = Math.floor(index / columns) * (height + 32);
          context.drawImage(video, x, y + 32, width, height);
          context.fillStyle = '#fff'; context.font = '24px sans-serif';
          context.fillText(`${Math.floor(samples[index] / 60)}:${String(Math.floor(samples[index] % 60)).padStart(2, '0')} (${samples[index]}s)`, x + 8, y + 25);
        }
        return sheet.toDataURL('image/png').split(',')[1];
      }, { samples: group, detailed });
      const output = detailed ? `research/video/detail-${group[0]}.png` : `research/video/sheet-${String(offset / 12 + 1).padStart(2, '0')}.png`;
      fs.writeFileSync(output, Buffer.from(data, 'base64'));
      console.log(output + ' ' + group.join(','));
    }
  } finally { await browser.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
