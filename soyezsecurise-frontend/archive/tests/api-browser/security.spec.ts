import { test, expect } from '@playwright/test';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import example from '../../../../soyezsecurise-backend/archive_examples/community-quiz.json' with { type: 'json' };

test.use({ ignoreHTTPSErrors: true });
const active = (page: import('@playwright/test').Page) => page.locator('.feed-slot:not([inert]) iframe');
const make = (id: string, javascript: string, html = '<button id="attack">Try privileged actions</button><p id="report"></p>') => ({ ...example, id, title: id, status: 'published', publishedAt: '2026-10-27T00:00:00Z', html, javascript });

async function httpsProbe() {
  const directory = mkdtempSync(join(tmpdir(), 'archive-security-'));
  const key = join(directory, 'key.pem'); const cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const requests: { path: string; cookie?: string; authorization?: string; referer?: string }[] = [];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    requests.push({ path: request.url!, cookie: request.headers.cookie, authorization: request.headers.authorization, referer: request.headers.referer });
    response.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': request.headers.origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><body>probe</body>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `https://localhost:${(server.address() as AddressInfo).port}`;
  return { origin, requests, async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, {recursive:true,force:true}); } };
}

test('opaque frames cannot read parent credentials, sibling content, storage, or act on messages', async ({ page, context }) => {
  await context.addCookies([{ name:'archive-test-auth', value:'dummy-auth-sentinel', url:'http://127.0.0.1:4175', httpOnly:true, sameSite:'Lax' }]);
  await page.addInitScript(() => {
    if (window === window.top) {
      localStorage.setItem('auth-token', 'dummy-local-secret'); sessionStorage.setItem('auth-token','dummy-session-secret');
      (window as unknown as Record<string, unknown>).authToken = 'dummy-global-secret';
      const channel = new BroadcastChannel('auth');
      channel.onmessage = () => { (window as unknown as Record<string, unknown>).compromised = true; };
      setInterval(() => channel.postMessage('dummy-parent-channel-secret'), 30);
    }
  });
  const attacker = make('attacker', `
    const blocked = fn => { try { fn(); return false; } catch { return true; } };
    (async () => {
      const report = {
        credentialless: window.credentialless === true,
        parentDOM: blocked(() => parent.document.body.innerHTML),
        parentLocal: blocked(() => parent.localStorage.getItem('auth-token')),
        parentSession: blocked(() => parent.sessionStorage.getItem('auth-token')),
        parentGlobal: blocked(() => parent.authToken),
        parentCookie: blocked(() => parent.document.cookie),
        ownCookie: blocked(() => document.cookie),
        localStorage: blocked(() => localStorage.getItem('auth-token')),
        sessionStorage: blocked(() => sessionStorage.getItem('auth-token')),
        indexedDB: blocked(() => indexedDB.open('auth')),
        siblingExists: parent.frames.length >= 2,
        siblingDOM: blocked(() => parent.frames[1].document.body.innerHTML),
        siblingGlobal: blocked(() => parent.frames[1].contributorSecret),
        frameElementHidden: window.frameElement === null,
        domainChange: blocked(() => { document.domain = '127.0.0.1'; }),
        permissions: document.featurePolicy.allowedFeatures(),
      };
      report.broadcast = await new Promise(resolve => {
        try {
          const channel = new BroadcastChannel('auth');
          channel.onmessage = () => resolve(false); channel.postMessage('read-secret');
          setTimeout(() => { channel.close(); resolve(true); }, 180);
        } catch { resolve(true); }
      });
      for (const [name, operation] of Object.entries({
        serviceWorker: () => navigator.serviceWorker.register('/auth-worker.js'),
        cacheStorage: () => caches.open('auth'),
        clipboard: () => navigator.clipboard.readText(),
        storageAccess: () => document.requestStorageAccess(),
        passwordCredentials: () => navigator.credentials.get({password:true, mediation:'silent'}),
        publicKeyCredentials: () => navigator.credentials.get({publicKey:{challenge:new Uint8Array([1,2,3]), timeout:500}}),
      })) { try { await operation(); report[name] = false; } catch { report[name] = true; } }
      parent.postMessage({ type:'bookmark', flashId:'victim', token:'steal', command:'eval', code:'window.compromised=true' }, '*');
      document.querySelector('#report').textContent = JSON.stringify(report);
      document.querySelector('#attack').onclick = async () => {
        const actions = { popupBlocked: window.open('https://example.invalid') === null,
          topNavigationBlocked: blocked(() => { top.location.href = 'https://example.invalid/escape'; }) };
        try { await document.documentElement.requestFullscreen(); actions.fullscreenBlocked = false; } catch { actions.fullscreenBlocked = true; }
        document.body.dataset.actions = JSON.stringify(actions);
      };
    })();`);
  const victim = make('victim', `window.contributorSecret = crypto.randomUUID(); document.body.dataset.secret = window.contributorSecret;`);
  await page.route('**/api/archive/**', route => route.fulfill({ json: { records:[attacker, victim], nextCursor:null } }));
  await page.goto('./');
  const iframe = active(page);
  await expect(iframe).toHaveAttribute('sandbox','allow-scripts');
  await expect(iframe).toHaveAttribute('credentialless','');
  await expect(iframe.contentFrame().locator('#report')).toContainText('credentialless');
  const report = JSON.parse(await iframe.contentFrame().locator('#report').innerText());
  for (const [key, value] of Object.entries(report)) {
    if (key === 'permissions') expect(value).toEqual([]);
    else expect(value, key).toBe(true);
  }
  await iframe.contentFrame().getByRole('button',{name:'Try privileged actions'}).click();
  await expect(iframe.contentFrame().locator('body')).toHaveAttribute('data-actions',JSON.stringify({popupBlocked:true,topNavigationBlocked:true,fullscreenBlocked:true}));
  expect(await page.evaluate(() => ({ local:localStorage.getItem('auth-token'), session:sessionStorage.getItem('auth-token'), compromised:(window as unknown as Record<string,unknown>).compromised, saved:localStorage.getItem('soyezsecurise.archive.bookmarks.v1') }))).toEqual({local:'dummy-local-secret',session:'dummy-session-secret',compromised:undefined,saved:null});
  expect(page.url()).toContain('/archive/');
});

test('credentialless isolation strips ambient cookies on credentialed fetch, image, and self-navigation', async ({ page, context }) => {
  const probe = await httpsProbe();
  try {
    await context.addCookies([{name:'private-auth',value:'dummy-http-only-secret',url:probe.origin,httpOnly:true,secure:true,sameSite:'None'}]);
    // Positive control: the same browser really has and transmits this credential.
    await page.goto(`${probe.origin}/trusted-control`);
    expect(probe.requests.find(request => request.path === '/trusted-control')?.cookie).toContain('private-auth=');
    const attacker = { ...make('network-attacker', `
      (async () => {
        try { await fetch('${probe.origin}/fetch', {credentials:'include'}); } catch {}
        const image = new Image(); image.src = '${probe.origin}/image'; document.body.append(image);
        document.querySelector('#attack').onclick = () => { location.href = '${probe.origin}/navigation'; };
        document.querySelector('#report').textContent = 'ready';
      })();`), externalHosts:{connect:[probe.origin],image:[probe.origin]} };
    await page.route('**/api/archive/**', route => route.fulfill({json:{records:[attacker],nextCursor:null}}));
    await page.goto('http://127.0.0.1:4175/archive/');
    await expect(active(page).contentFrame().locator('#report')).toHaveText('ready');
    await expect.poll(() => probe.requests.some(request => request.path === '/image')).toBe(true);
    await active(page).contentFrame().getByRole('button',{name:'Try privileged actions'}).click();
    await expect.poll(() => probe.requests.some(request => request.path === '/navigation')).toBe(true);
    const attempts = probe.requests.filter(request => ['/fetch','/image','/navigation'].includes(request.path));
    expect(attempts.map(request => request.path).sort()).toEqual(['/fetch','/image','/navigation']);
    for (const request of attempts) { expect(request.cookie).toBeUndefined(); expect(request.authorization).toBeUndefined(); expect(request.referer).toBeUndefined(); }
  } finally { await probe.close(); }
});

test('unsupported credentialless browsers never instantiate contributor frames', async ({ page }) => {
  await page.addInitScript(() => { delete (HTMLIFrameElement.prototype as unknown as Record<string, unknown>).credentialless; });
  await page.route('**/api/archive/**', route => route.fulfill({json:{records:[make('fallback',"parent.postMessage('executed','*')")],nextCursor:null}}));
  await page.goto('./');
  await expect(page.getByText('Your browser cannot safely display this interactive flash.',{exact:false})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('application and authentication hosts cannot be allowlisted by content', async ({ page }) => {
  await page.route('**/api/archive/**', route => route.fulfill({json:{records:[{...make('bad-host',''),externalHosts:{connect:['https://api.soyezsecurise.com']}}],nextCursor:null}}));
  await page.goto('./');
  await expect(page.getByText('Some invalid records were skipped.')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
