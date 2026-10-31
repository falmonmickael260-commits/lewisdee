/** Run on a machine that permits localhost and Chrome: npm run test:browser
 * Requires Playwright: npm install --no-save playwright && npx playwright install chromium
 * PLAYWRIGHT_MODULE may point to an existing installation. No production services are used.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = 8993;
const server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local server did not start')), 8000);
    server.stdout.on('data', () => { clearTimeout(timer); resolve(); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
  });
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  const errors = [];
  for (const [width, height] of [[320,568],[375,667],[390,844],[412,915],[844,390],[1440,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${port}`);
    await page.locator('#btn-play-local').click();
    await page.locator('#btn-start-game').click();
    await page.locator('#btn-roll').waitFor({ state:'visible' });
    await page.waitForTimeout(450);
    const rect = await page.locator('#btn-roll').boundingBox();
    assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= height, `${width}x${height}: roll button outside viewport`);
    assert.ok(await page.locator('#table-round').evaluate(el => el.getBoundingClientRect().height > 100), 'table must remain visible');
    await page.locator('#btn-roll').click();
    await page.waitForTimeout(100);
    for (const die of await page.locator('#dice-layer .die').all()) {
      const value = Number(await die.getAttribute('data-value'));
      assert.equal(await die.locator('.face-front .pip.on').count(), value, 'display must match official result');
      assert.equal(await die.locator('.cube-face').count(), 6, 'six cube faces remain available for the throw');
      assert.equal(await die.locator('.die-artwork .artwork-pip').count(), value, 'resting artwork shows the official result');
      assert.equal(await die.locator('.die-cube').isVisible(), false, 'adjacent faces are hidden at rest');
      assert.equal(await die.locator('.die-artwork').isVisible(), true, 'a single readable face is visible at rest');
    }
    await page.screenshot({ path: new URL(`../artifacts/game-${width}x${height}.png`, import.meta.url).pathname });
    await page.close();
  }
  const alice = await browser.newPage(), bob = await browser.newPage();
  for (const page of [alice,bob]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${port}`);
  }
  await alice.locator('#btn-create-room').click();
  await alice.locator('#online-name').fill('Alice');
  await alice.locator('#online-submit').click();
  await alice.waitForFunction(() => document.getElementById('online-room-code').textContent.length === 5);
  const code = await alice.locator('#online-room-code').textContent();
  await bob.locator('#btn-join-room').click();
  await bob.locator('#online-name').fill('Bob');
  await bob.locator('#online-code-input').fill(code);
  await bob.locator('#online-submit').click();
  await alice.waitForFunction(() => document.querySelectorAll('#online-lobby-players .lobby-player-row').length === 2);
  await alice.locator('#online-start-btn').click();
  await bob.locator('#screen-game.active').waitFor();
  assert.equal(await bob.locator('#btn-roll').isVisible(), false, 'only active player may roll');
  await alice.locator('#btn-roll').click();
  await alice.waitForTimeout(1800);
  const values = page => page.locator('#dice-layer .die').evaluateAll(dice => dice.map(d => [d.dataset.dieId,d.dataset.value]));
  assert.deepEqual(await values(alice), await values(bob), 'both players display the same official dice');
  assert.deepEqual(errors, [], 'no JavaScript runtime errors');
  console.log('Mobile/desktop layout, official dice faces and real two-client WebSocket smoke test passed. Screenshots: artifacts/');
} finally {
  await browser?.close();
  server.kill();
}
