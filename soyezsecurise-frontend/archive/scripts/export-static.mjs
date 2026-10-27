// Keep the plain-HTML main site and the standalone deployment in sync. Classic
// scripts and relative URLs work over HTTP and when index.html is opened on disk.
import { cp, copyFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await copyFile(new URL('index.html', root), new URL('index.html', dist));
for (const directory of ['assets', 'media']) {
  await mkdir(new URL(`${directory}/`, root), { recursive: true });
  await cp(new URL(`${directory}/`, dist), new URL(`${directory}/`, root), { recursive: true });
}
console.log('Archive exported: index.html, assets/, and media/ (also available in dist/).');
