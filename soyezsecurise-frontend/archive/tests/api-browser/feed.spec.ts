import { test, expect } from '@playwright/test';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
test.use({ ignoreHTTPSErrors: true });
import example from '../../../../soyezsecurise-backend/archive_examples/community-quiz.json' with { type: 'json' };
const make = (id: string) => ({ ...example, id, title: id, status: 'published', publishedAt: '2026-10-27T00:00:00Z' });
const active = (page: import('@playwright/test').Page) => page.locator('.feed-slot:not([inert]) [data-flash-id]');

test('paginates without moving the active card, isolates scripts, saves and resolves direct links', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/archive/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/flashes')) {
      requests++;
      return route.fulfill({ json: url.searchParams.has('cursor') ? { records: [make('last-story')], nextCursor: null } : { records: Array.from({ length: 10 }, (_, i) => make(`story-${i}`)), nextCursor: 'second-page' } });
    }
    return route.fulfill({ json: make(url.pathname.split('/').pop()!) });
  });
  await page.goto('./');
  await expect(active(page)).toHaveAttribute('data-flash-id', 'story-0');
  const frame = active(page).locator('iframe').contentFrame();
  await frame.getByRole('button', { name: 'login.example.com', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('Correct!');
  expect(await active(page).locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
  const isolated = await active(page).locator('iframe').evaluate(async el => {
    // Use a temporary script in the frame through Playwright's frame API in the next assertion.
    return !(el as HTMLIFrameElement).contentDocument;
  });
  expect(isolated).toBe(true);
  await expect(active(page).getByRole('link', { name: /Contributor/ })).toHaveAttribute('href', example.author.url);
  for (let i = 0; i < 6; i++) {
    await page.locator('.feed-viewport').focus(); await page.keyboard.press('ArrowDown');
    await expect(active(page)).toHaveAttribute('data-flash-id', `story-${i+1}`);
  }
  await expect.poll(() => requests).toBe(2);
  await expect(active(page)).toHaveAttribute('data-flash-id', 'story-6');
  expect(await page.locator('.feed-slot').count()).toBeLessThanOrEqual(5);
  for (let i=7;i<=10;i++) {
    await page.locator('.feed-viewport').focus(); await page.keyboard.press('ArrowDown');
    await expect(active(page)).toHaveAttribute('data-flash-id', i === 10 ? 'last-story' : `story-${i}`);
  }
  await page.locator('.feed-viewport').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('heading', { name: 'You’ve reached the end' })).toBeVisible();
  await page.goto('./#flash/shared-story');
  await expect(active(page)).toHaveAttribute('data-flash-id','shared-story');
  await active(page).getByRole('button', { name:'Bookmark flash', exact:true }).click();
  await page.reload();
  await page.getByRole('button', { name:'Saved flashes', exact:true }).click();
  await expect(active(page)).toHaveAttribute('data-flash-id','shared-story');
});

test('failed next page retains stories and retry recovers; search cancels old results', async ({ page }) => {
  let fail = true;
  await page.route('**/api/archive/**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q')) return route.fulfill({ json:{ records:[make('search-result')], nextCursor:null } });
    if (!url.searchParams.has('cursor')) return route.fulfill({ json:{ records:[make('first')], nextCursor:'next' } });
    if (fail) return route.fulfill({ status:503, json:{detail:'unavailable'} });
    return route.fulfill({ json:{ records:[make('second')], nextCursor:null } });
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('503');
  await expect(active(page)).toHaveAttribute('data-flash-id','first');
  fail=false; await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Search and filter', {exact:true}).click();
  await page.getByRole('searchbox').fill('something');
  await expect(active(page)).toHaveAttribute('data-flash-id','search-result');
});

test('HTML frames enforce host permissions and parent isolation on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let allowedRequests = 0; let blockedRequests = 0;
  // Opaque sandbox-frame requests can bypass Playwright route interception in
  // Chromium. Exercise real HTTPS/CORS against a disposable local server.
  const directory = mkdtempSync(join(tmpdir(), 'archive-tls-'));
  const key = join(directory, 'key.pem'); const cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    if (request.url === '/blocked') blockedRequests++; else allowedRequests++;
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }); response.end('allowed');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const allowed = `https://localhost:${port}`; const blocked = `https://127.0.0.1:${port}`;
  try {
    const record = { ...make('sandbox-test'), externalHosts: { connect: [allowed] }, javascript: `${example.javascript}
      let parentBlocked = false; try { parent.document.body.dataset.compromised = 'yes'; } catch { parentBlocked = true; }
      document.body.dataset.parentBlocked = String(parentBlocked);
      Promise.all([fetch('${allowed}/allowed').then(r => r.text()).catch(error => 'allowed failed: ' + error.message), fetch('${blocked}/blocked').then(() => 'bad', () => 'blocked')]).then(results => { document.body.dataset.networkResult = results.join(','); });` };
    await page.route('**/api/archive/**', route => route.fulfill({ json: { records: [record], nextCursor: null } }));
    await page.goto('./');
    await expect(active(page)).toHaveAttribute('data-flash-id','sandbox-test');
    const frame = active(page).locator('iframe').contentFrame();
    await expect(frame.locator('body')).toHaveAttribute('data-parent-blocked', 'true');
    await expect(frame.locator('body')).toHaveAttribute('data-network-result','allowed,blocked');
    expect(allowedRequests).toBe(1); expect(blockedRequests).toBe(0);
    expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
    await expect(active(page).getByRole('button', {name:'Next flash',exact:true})).toBeVisible();
    const bounds = await active(page).locator('iframe').boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.height).toBeGreaterThan(300);
    await page.screenshot({ path: '/tmp/archive-html-mobile.png' });
    await active(page).getByRole('button', {name:'Next flash',exact:true}).click();
    await expect(page.getByRole('heading', {name:'You’ve reached the end'})).toBeVisible();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, {recursive:true,force:true}); }
});

test('newer search results win over a delayed older request', async ({ page }) => {
  await page.route('**/api/archive/**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    if (query === 'old') await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({json: {records:[make(query || 'initial')],nextCursor:null}}).catch(() => {});
  });
  await page.goto('./');
  await expect(active(page)).toHaveAttribute('data-flash-id','initial');
  await page.getByLabel('Search and filter', {exact:true}).click();
  await page.getByRole('searchbox').fill('old');
  await page.waitForRequest(request => new URL(request.url()).searchParams.get('q') === 'old');
  await page.getByRole('searchbox').fill('new');
  await expect(active(page)).toHaveAttribute('data-flash-id','new');
  await page.waitForTimeout(1000);
  await expect(active(page)).toHaveAttribute('data-flash-id','new');
});
