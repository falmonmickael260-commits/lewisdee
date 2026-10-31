/** Capture actual local application files without deploying or opening a server port. */
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'artifacts/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
try {
  for (const [label, width, height] of [['mobile',390,844],['ordinateur',1440,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://jeu.test/**', async route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep)) return route.abort();
      const type = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' }[extname(file)] || 'application/octet-stream';
      try { await route.fulfill({ status: 200, contentType: type, body: await readFile(file) }); }
      catch { await route.fulfill({ status: 404, body: 'File not found' }); }
    });
    await page.goto('http://jeu.test/');
    await page.locator('#btn-play-bots').waitFor();
    await page.screenshot({ path: resolve(output, `accueil-${label}.png`) });
    await page.locator('#btn-play-bots').click();
    await page.locator('#bot-player-name').fill('Mickaël');
    await page.locator('#bot-count').selectOption('2');
    await page.screenshot({ path: resolve(output, `choix-bots-${label}.png`) });
    await page.locator('#btn-start-bots').click();
    await page.locator('#btn-roll').click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: resolve(output, `partie-bots-${label}.png`) });
    if (errors.length) throw new Error(errors.join('\n'));
    await page.close();
  }
  console.log(`Six captures du vrai jeu enregistrées dans ${output}`);
} finally { await browser.close(); }
