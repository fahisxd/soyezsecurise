// Regression: click the actual main-site Archive link, without a Vite server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

const frontend = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const built = join(frontend, 'archive/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const isBuilt = pathname.startsWith('/built/archive/');
    const root = isBuilt ? built : frontend;
    const relative = isBuilt ? pathname.slice('/built/archive/'.length) : pathname.slice(1);
    let target = resolve(root, relative || 'index.html');
    if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const mode of ['file', 'http', 'built']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://api.soyezsecurise.com/**', route => route.abort());
    if (mode === 'built') {
      await page.goto(`${origin}/built/archive/`);
    } else {
      await page.goto(mode === 'file' ? pathToFileURL(join(frontend, 'index.html')).href : `${origin}/index.html`);
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Archive', exact: true }).click();
    }
    const active = page.locator('.feed-slot:not([inert]) [data-flash-id]');
    await active.waitFor();
    assert.equal(await active.getAttribute('data-flash-id'), 'heartbleed', `${mode}: actual flashes render`);
    assert.equal(await page.locator('.explore-menu').count(), 0);
    await active.getByRole('button', { name: 'Bookmark flash', exact: true }).click();
    await page.getByRole('button', { name: 'Saved flashes', exact: true }).click();
    assert.equal(await active.getAttribute('data-flash-id'), 'heartbleed');
    await page.getByRole('button', { name: 'Flashes', exact: true }).click();
    await page.locator('.feed-viewport').focus(); await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('.feed-slot:not([inert]) [data-flash-id]')?.getAttribute('data-flash-id') === 'wannacry');
    if (mode === 'file') await page.screenshot({ path: '/tmp/archive-local-file-fixed.png' });
    await page.getByLabel('Search and filter', { exact: true }).click();
    await page.getByRole('searchbox').fill('security.txt');
    await page.waitForFunction(() => document.querySelector('.feed-slot:not([inert]) [data-flash-id]')?.getAttribute('data-flash-id') === 'security-txt');
    await active.getByRole('img').waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('.feed-slot:not([inert]) img');
      return img?.complete && img.naturalWidth > 0;
    });
    assert.deepEqual(errors, [], `${mode}: no JavaScript errors`);
    console.log(`${mode}: Archive link, flashes, save, scroll, search and local image passed`);
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
