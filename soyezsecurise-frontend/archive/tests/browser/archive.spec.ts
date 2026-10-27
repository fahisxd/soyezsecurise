import { expect, test } from '@playwright/test';

const current = '[data-flash-id]:not([aria-hidden=true])';
const activeCard = (page: import('@playwright/test').Page) => page.locator('.feed-slot:not([inert]) .flash');

test('flips, changes slides, saves across reload, and opens citations', async ({ page }) => {
  await page.goto('./');
  const card = activeCard(page);
  await expect(card).toHaveAttribute('data-flash-id', 'heartbleed');
  await card.getByRole('button', { name: /Reveal the debrief/ }).click();
  await expect(card.getByRole('button', { name: /Show front/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.card-back').getByText('The server trusted\nthe wrong number.')).toBeVisible();
  await card.getByRole('button', { name: 'Slide 2 of 2' }).click();
  await expect(card.getByRole('button', { name: /Reveal the debrief/ })).toHaveAttribute('aria-pressed', 'false');
  await card.getByRole('button', { name: 'Bookmark flash', exact: true }).click();
  await page.reload();
  await expect(activeCard(page).getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true');
  await activeCard(page).locator('summary').click();
  await expect(activeCard(page).getByRole('link', { name: /OpenSSL/ })).toHaveAttribute('href', 'https://openssl-library.org/news/secadv/20140407.txt');
});

test('wheel and keyboard move through a bounded, continuous feed', async ({ page }) => {
  await page.goto('./');
  await page.locator('.feed-viewport').focus();
  await page.keyboard.press('ArrowDown');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
  await page.keyboard.press('ArrowUp');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'heartbleed');
  await page.locator('.feed-viewport').hover();
  await page.mouse.wheel(0, 600);
  await expect(activeCard(page)).not.toHaveAttribute('data-flash-id', 'heartbleed');
  // Browse beyond a full cycle using the actual navigation, including track extension.
  const firstTrackHeight = await page.locator('.feed-track').evaluate(element => element.clientHeight);
  for (let i = 0; i < 14; i++) {
    const previous = await activeCard(page).getAttribute('data-flash-id');
    await page.locator('.feed-viewport').focus();
    await page.keyboard.press('ArrowDown');
    await expect(activeCard(page)).not.toHaveAttribute('data-flash-id', previous!);
    await expect.poll(() => page.locator('.feed-viewport').evaluate(element => Math.abs(element.scrollTop / element.clientHeight - Math.round(element.scrollTop / element.clientHeight)))).toBeLessThan(.001);
  }
  expect(await page.locator('.feed-slot').count()).toBeLessThanOrEqual(5);
  expect(await page.locator('.feed-track').evaluate(element => element.clientHeight)).toBeGreaterThan(firstTrackHeight);
});

test('search, category, empty states, and honest recommendation fallback', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Search and filter').click();
  await page.getByRole('searchbox', { name: 'Search the archive' }).fill('Rowhammer');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'rowhammer');
  await page.getByRole('searchbox').fill('unfindable-string');
  await expect(page.getByRole('heading', { name: 'No matching flashes.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to all flashes' }).click();
  await page.getByLabel('Search and filter').click();
  await page.getByRole('button', { name: /^Malware/ }).click();
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'morris-worm');
  await page.getByLabel('Search and filter').click();
  await page.getByLabel('Feed order').selectOption('recommended');
  await expect(page.getByText('Recommended currently uses a shuffled feed.', { exact: false })).toBeVisible();
  await expect(page.locator(current).filter({ hasText: 'Draft only' })).toHaveCount(0);
});

test('deep links and share links identify the correct flash', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#flash/rowhammer');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'rowhammer');
  await activeCard(page).getByRole('button', { name: 'Copy shareable link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/archive/#flash/rowhammer');
  await page.goto('./#flash/missing');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'heartbleed');
});

test('mobile layout swipes and stays inside the viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/archive/');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'heartbleed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cardBox = await activeCard(page).boundingBox();
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(844);
  const metadataBox = await activeCard(page).locator('.card-front .face-top').boundingBox();
  const headlineBox = await activeCard(page).locator('.card-front .card-title').boundingBox();
  expect(metadataBox!.y + metadataBox!.height).toBeLessThanOrEqual(headlineBox!.y + 1);
  expect(await page.locator('.next-story-peek').count()).toBe(0);
  const cdp = await context.newCDPSession(page);
  // A finger gesture on the story moves the single feed scroll surface.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 22, y: 690 }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 22, y: 690 - step * 50 }] });
    await page.waitForTimeout(20); // Finger moves over time rather than teleporting.
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
  const storySurface = activeCard(page).locator('.card-stage');
  await expect(storySurface).toHaveAttribute('aria-pressed', 'false');
  // A stationary tap flips the active story; a vertical gesture above only advanced the feed.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 390 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(storySurface).toHaveAttribute('aria-pressed', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 390 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(storySurface).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Search and filter').click();
  await page.getByRole('button', { name: 'Memes', exact: true }).click();
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'localhost-meme');
  await activeCard(page).getByRole('button', { name: 'Bookmark flash', exact: true }).click();
  await page.getByRole('button', { name: /^Saved/ }).click();
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'localhost-meme');
  await context.close();
});

test('reduced motion, keyboard focus, and corrupted storage remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('soyezsecurise.archive.bookmarks.v1', 'broken'));
  await page.goto('./');
  const button = activeCard(page).getByRole('button', { name: /Reveal the debrief/ });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(activeCard(page).getByRole('button', { name: /Show front/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.feed-slot:not([inert]) .card-rotator').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.keyboard.press('ArrowDown');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
  await page.keyboard.press('ArrowDown');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'morris-worm');
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('optional media is rendered with an accessible description', async ({ page }) => {
  await page.goto('./#flash/security-txt');
  await expect(activeCard(page).getByRole('img')).toHaveAttribute('alt', 'Illustration: a bug report travels from a researcher to a published security contact.');
  await expect(activeCard(page).getByRole('img')).toHaveJSProperty('complete', true);
});

test('no console errors or unexpected network services', async ({ page }) => {
  const errors: string[] = []; const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('ws://127.0.0.1:4173/')) external.push(request.url()); });
  await page.goto('./'); await expect(activeCard(page)).toBeVisible();
  await page.getByLabel('Search and filter').click();
  await page.getByLabel('Feed order').selectOption('random');
  await page.getByRole('button', { name: 'Reshuffle feed' }).click();
  expect(errors).toEqual([]); expect(external).toEqual([]);
});


test('the story dominates the viewport with no dashboard or nested card scroll', async ({ page }) => {
  await page.goto('./');
  const surface = activeCard(page).locator('.card-stage');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box!.width * box!.height / (1440 * 1000)).toBeGreaterThan(.7);
  expect(await page.locator('.sidebar, .context-rail, .feed-navigation').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const innerScrollers = await activeCard(page).evaluate(element => [...element.querySelectorAll('*')].filter(child => ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight && !child.closest('dialog, .source-popover')).length);
  expect(innerScrollers).toBe(0);
  const fontSize = await activeCard(page).locator('.card-front .card-title').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(64);
  await page.locator('.feed-viewport').evaluate(element => element.scrollTo({ top: element.clientHeight, behavior: 'instant' }));
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
});

test('the full story stays readable without a scrollbar inside the card', async ({ page }) => {
  await page.goto('./');
  await activeCard(page).getByRole('button', { name: 'Read full flash' }).click();
  const dialog = page.getByRole('dialog', { name: 'Full flash text' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('The server trusted\nthe wrong number.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(activeCard(page).getByRole('button', { name: 'Read full flash' })).toBeFocused();
});

test('all story treatments keep text, artwork, and actions apart on phones', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    for (const id of ['heartbleed', 'wannacry', 'morris-worm', 'log4shell', 'rowhammer', 'security-txt', 'randomness', 'localhost-meme']) {
      await page.goto(`./#flash/${id}`);
      await expect(activeCard(page)).toHaveAttribute('data-flash-id', id);
      for (const side of ['front', 'back']) {
        if (side === 'back') await activeCard(page).locator('.card-stage').click();
        const geometry = await activeCard(page).evaluate((element, faceSide) => {
          const face = element.querySelector(`.card-${faceSide}`)!;
          const rect = (selector: string) => {
            const box = (face.querySelector(selector) ?? element.querySelector(selector))!.getBoundingClientRect();
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
          };
          const layout = face.querySelector('.face-layout')!;
          const visual = face.querySelector('.story-visual, .debrief-visual')!;
          const title = face.querySelector('.card-title')!;
          return {
            metadata: rect('.face-top'), copy: rect('.story-copy'), visual: rect('.story-visual, .debrief-visual'),
            controls: rect('.story-controls'), title: rect('.card-title'),
            layoutOverflow: layout.scrollHeight - layout.clientHeight,
            visualOverflow: visual.scrollHeight - visual.clientHeight,
            titleOverflow: title.scrollHeight - title.clientHeight,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        }, side);
        const label = `${id}/${side} at ${size.width}×${size.height}`;
        expect.soft(geometry.metadata.bottom, `${label}: metadata clears text`).toBeLessThanOrEqual(geometry.copy.y + 1);
        if (size.width < size.height) {
          expect.soft(geometry.copy.bottom, `${label}: text clears artwork`).toBeLessThanOrEqual(geometry.visual.y + 1);
        } else {
          expect.soft(geometry.copy.right, `${label}: text clears artwork`).toBeLessThanOrEqual(geometry.visual.x + 1);
        }
        expect.soft(geometry.visual.bottom, `${label}: artwork clears controls`).toBeLessThanOrEqual(geometry.controls.y + 1);
        expect.soft(geometry.controls.bottom, `${label}: controls remain on screen`).toBeLessThanOrEqual(size.height);
        expect.soft(geometry.layoutOverflow, `${label}: content fits`).toBeLessThanOrEqual(2);
        expect.soft(geometry.visualOverflow, `${label}: artwork fits`).toBeLessThanOrEqual(2);
        expect.soft(geometry.titleOverflow, `${label}: headline is readable`).toBeLessThanOrEqual(2);
        expect.soft(geometry.pageOverflow, `${label}: no horizontal scroll`).toBeLessThanOrEqual(0);
        if (side === 'front' && ['heartbleed', 'security-txt', 'localhost-meme'].includes(id) && [360, 390].includes(size.width)) {
          await page.screenshot({ path: testInfo.outputPath(`${id}-${size.width}.png`) });
        }
      }
    }
  }
  await context.close();
});

test('rotating a phone preserves the active story and revealed face', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./#flash/wannacry');
  await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
  await activeCard(page).locator('.card-stage').tap();
  await expect(activeCard(page).locator('.card-stage')).toHaveAttribute('aria-pressed', 'true');
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.locator('.feed-viewport').evaluate(element => Math.abs(element.scrollTop - element.clientHeight))).toBeLessThan(1);
    await expect(activeCard(page)).toHaveAttribute('data-flash-id', 'wannacry');
    await expect(activeCard(page).locator('.card-stage')).toHaveAttribute('aria-pressed', 'true');
    await expect(activeCard(page).locator('.card-back .card-title')).toBeVisible();
  }
  await context.close();
});
