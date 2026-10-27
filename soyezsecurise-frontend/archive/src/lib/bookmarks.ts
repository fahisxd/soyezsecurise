export const bookmarkKey = 'soyezsecurise.archive.bookmarks.v1';
export function parseBookmarks(raw: string | null): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)).slice(0, 10000) : []);
  } catch { return new Set(); }
}
export function readBookmarks(): Set<string> {
  try { return parseBookmarks(localStorage.getItem(bookmarkKey)); } catch { return new Set(); }
}
export function writeBookmarks(bookmarks: ReadonlySet<string>): boolean {
  try { localStorage.setItem(bookmarkKey, JSON.stringify([...bookmarks])); return true; } catch { return false; }
}
