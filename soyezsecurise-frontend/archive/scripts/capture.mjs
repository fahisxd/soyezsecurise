import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/previews', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173/archive/');
  await page.locator('.feed-slot:not([inert]) .card-stage').waitFor();
  await page.screenshot({ path: 'docs/previews/desktop.png' });
  await page.goto('http://127.0.0.1:4173/archive/#flash/localhost-meme');
  await page.locator('.feed-slot:not([inert]) .flash[data-flash-id=localhost-meme]').waitFor();
  await page.screenshot({ path: 'docs/previews/meme.png' });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const phone = await mobile.newPage();
  await phone.goto('http://127.0.0.1:4173/archive/');
  await phone.locator('.feed-slot:not([inert]) .card-stage').waitFor();
  await phone.screenshot({ path: 'docs/previews/mobile.png' });
  await phone.goto('http://127.0.0.1:4173/archive/#flash/localhost-meme');
  await phone.locator('.feed-slot:not([inert]) .flash[data-flash-id=localhost-meme]').waitFor();
  await phone.screenshot({ path: 'docs/previews/mobile-meme.png' });
  await phone.setViewportSize({ width: 360, height: 640 });
  await phone.goto('http://127.0.0.1:4173/archive/#flash/heartbleed');
  await phone.locator('.feed-slot:not([inert]) .flash[data-flash-id=heartbleed]').waitFor();
  await phone.screenshot({ path: 'docs/previews/mobile-small.png' });
  console.log('Captured desktop and mobile flash previews in docs/previews/.');
} finally { await browser.close(); }
