import { describe, expect, it } from 'vitest';
import { readCatalog } from '../scripts/catalog';
import { parseCatalog, validateFlash, parseFeedResponse } from '../src/lib/validation';
import { flashAt, buildFeedURL, filterDemo, visibleWindow } from '../src/lib/feed';
import { parseBookmarks } from '../src/lib/bookmarks';
import { MemoryAggregate } from '../src/lib/engagement';

const catalog = readCatalog();
const records = catalog.records;
const sample = records.find(record => record.id === 'heartbleed')!;
const file = (record: unknown, name = 'test.json') => ({ file: name, raw: JSON.stringify(record) });

describe('publication boundary', () => {
  it('validates all eight examples and withholds the draft', () => {
    expect(catalog.issues).toEqual([]); expect(records).toHaveLength(8); expect(catalog.ignored).toBe(1);
    expect(new Set(records.map(record => record.type)).size).toBe(6);
  });
  it('rejects malformed records without losing valid neighbors', () => {
    const result = parseCatalog([file(sample), { file: 'broken.json', raw: '{' }, file({ ...sample, id: 'invalid', slides: [] }, 'invalid.json')]);
    expect(result.records).toHaveLength(1); expect(result.issues).toHaveLength(2);
  });
  it('rejects every duplicate, independent of input order', () => {
    const result = parseCatalog([file(sample), file({ ...sample, title: 'An ambiguous copy' }, 'copy.json')]);
    expect(result.records).toEqual([]); expect(result.issues).toHaveLength(2);
  });
  it('ignores drafts and rejected records', () => {
    expect(parseCatalog([file({ ...sample, status: 'draft' }, 'draft.json'), file({ ...sample, id: 'rejected', status: 'rejected' }, 'rejected.json')])).toMatchObject({ records: [], issues: [], ignored: 2 });
  });
  it('requires a reviewer and publication date before publication', () => {
    expect(validateFlash({ ...sample, review: undefined })).toHaveProperty('error');
    expect(validateFlash({ ...sample, publishedAt: undefined })).toHaveProperty('error');
    expect(validateFlash({ ...sample, publishedAt: '2026-02-30T00:00:00Z' })).toHaveProperty('error');
    expect(validateFlash({ ...sample, publishedAt: '2026-01-01T00:00:00Z' })).toHaveProperty('error');
  });
  it('allows minimal records without optional tags, media, date or sources', () => {
    const { tags: _tags, media: _media, sources: _sources, eventDate: _eventDate, ...minimal } = sample;
    expect(validateFlash(minimal)).toHaveProperty('record');
  });
  it('rejects unsafe URLs, traversal, unknown fields and missing image alt text', () => {
    expect(validateFlash({ ...sample, sources: [{ title: 'unsafe', url: 'javascript:alert(1)' }] })).toHaveProperty('error');
    expect(validateFlash({ ...sample, media: [{ kind: 'image', url: 'media/../secret', alt: 'x' }] })).toHaveProperty('error');
    expect(validateFlash({ ...sample, media: [{ kind: 'image', url: 'media/photo.png' }] })).toHaveProperty('error');
    expect(validateFlash({ ...sample, surprise: true })).toHaveProperty('error');
  });
});

describe('backend feed boundary', () => {
  it('requests strategies from the server without client-side ordering', () => {
    const url = buildFeedURL('https://api.example.com/archive/flashes', { strategy: 'random', seed: 1988, category: 'malware', query: ' worm ' });
    expect(url.searchParams.get('strategy')).toBe('random');
    expect(url.searchParams.get('seed')).toBe('1988');
    expect(url.searchParams.get('category')).toBe('malware');
    expect(url.searchParams.get('q')).toBe('worm');
  });
  it('preserves the backend response sequence exactly', () => {
    const reversed = [...records].reverse();
    expect(parseFeedResponse({ records: reversed }).records).toEqual(reversed);
    expect(parseFeedResponse({ records: [...reversed, { ...sample, id: 'unpublished', status: 'draft' }] }).records).toEqual(reversed);
  });
  it('rejects an invalid response envelope and skips malformed records', () => {
    expect(() => parseFeedResponse([])).toThrow();
    expect(parseFeedResponse({ records: [sample, {}] })).toEqual({ records: [sample], rejected: 1 });
  });
  it('filters demo content without reordering it', () => {
    const reversed = [...records].reverse();
    expect(filterDemo(reversed, {})).toEqual(reversed);
    expect(filterDemo(records, { category: 'vulnerabilities', query: 'OpenSSL' }).map(record => record.id)).toEqual(['heartbleed']);
    expect(filterDemo(records, { query: 'NO SUCH STORY' })).toEqual([]);
  });
  it('bounds mounted cards and cycles through the upstream sequence', () => {
    expect(visibleWindow(10000, 20000)).toEqual({ start: 9998, end: 10002 });
    expect(visibleWindow(0, 2)).toEqual({ start: 0, end: 1 });
    expect(flashAt(records, records.length)).toBe(records[0]);
    expect(flashAt([], 0)).toBeUndefined();
  });
});

describe('local state and future signals', () => {
  it('recovers from missing, malformed and incompatible bookmarks', () => {
    expect(parseBookmarks(null).size).toBe(0); expect(parseBookmarks('{broken').size).toBe(0);
    expect(parseBookmarks('{}').size).toBe(0);
    expect([...parseBookmarks('["heartbleed", "heartbleed", 42, "../x"]')]).toEqual(['heartbleed']);
  });
  it('can aggregate signals without visitors, timestamps or reading trails', () => {
    const sink = new MemoryAggregate();
    sink.record({ type: 'view', flashId: 'heartbleed' }); sink.record({ type: 'view', flashId: 'heartbleed' });
    sink.record({ type: 'completion', flashId: 'heartbleed' });
    expect(sink.counts.get('heartbleed')).toEqual({ view: 2, completion: 1 });
  });
});

// The same v2 schema is enforced before imports, bundling, and API rendering.
describe('HTML flash boundary', () => {
  const html = { schemaVersion: 2, id: 'html-example', type: 'security-fact', title: 'Quiz', description: 'Try a quiz', category: 'facts', author: { name: 'Contributor', handle: '@contributor', url: 'https://www.instagram.com/contributor/' }, status: 'published', publishedAt: '2026-10-27T00:00:00Z', provenance: { kind: 'editorial', origin: 'manual' }, html: '<h1>Quiz</h1>', css: '', javascript: '', externalHosts: { connect: ['https://api.example.com'] } };
  it('allows explicit v2 publication without a legacy review object', () => {
    expect(validateFlash(html)).toHaveProperty('record');
    expect(parseFeedResponse({ records: [html], nextCursor: null }).records).toEqual([html]);
    expect(validateFlash({ ...html, publishedAt: undefined })).toHaveProperty('error');
  });
  it('rejects CSP source injection, wildcards, non-HTTPS and unknown host lists', () => {
    for (const host of ['https://good.test; script-src *', 'https://*.example.com', 'http://example.com', 'https://example.com/path', "https://example.com'", 'data:']) {
      expect(validateFlash({ ...html, externalHosts: { script: [host] } })).toHaveProperty('error');
    }
    expect(validateFlash({ ...html, externalHosts: { unknown: [] } })).toHaveProperty('error');
  });
});

describe('protected application hosts', () => {
  it('never accepts protected hosts in any contributor resource allowlist', async () => {
    const { externalHostError } = await import('../src/lib/flashIsolation');
    for (const key of ['connect', 'script', 'image', 'style', 'font', 'media', 'frame'] as const) {
      for (const origin of ['https://soyezsecurise.com','https://api.soyezsecurise.com','https://coffre.soyezsecurise.com','https://API.SOYEZSECURISE.COM:443']) {
        expect(externalHostError({[key]:[origin]})).toContain('authentication hosts');
      }
    }
    expect(externalHostError({connect:['https://soyezsecurise.com.attacker.test']})).toBeUndefined();
    expect(externalHostError({connect:['https://api.example.com']})).toBeUndefined();
  });
});
