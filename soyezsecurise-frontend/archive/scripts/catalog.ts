import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalog } from '../src/lib/validation';

export const contentRoot = fileURLToPath(new URL('../content/flashes/', import.meta.url));
export function readCatalog(root = contentRoot) {
  const files: { file: string; raw: string }[] = [];
  function walk(dir: string) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.isFile() && item.name.endsWith('.json')) files.push({ file: relative(root, path), raw: readFileSync(path, 'utf8') });
    }
  }
  walk(root);
  return parseCatalog(files);
}
