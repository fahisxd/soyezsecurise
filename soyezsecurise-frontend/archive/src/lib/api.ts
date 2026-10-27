import { useCallback, useEffect, useRef, useState } from 'react';
import type { Flash } from '../types';
import { buildFeedURL, type FeedOptions } from './feed';
import { parseFeedResponse, validateFlash } from './validation';

export const apiEndpoint = import.meta.env.VITE_ARCHIVE_API_URL?.trim() ?? '';
export async function fetchFlash(id: string, signal?: AbortSignal): Promise<Flash> {
  const response = await fetch(`${apiEndpoint.replace(/\/$/, '')}/${encodeURIComponent(id)}`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(response.status === 404 ? 'That flash is unavailable.' : 'Unable to open that flash. Please retry.');
  const result = validateFlash(await response.json());
  if ('error' in result || result.record.status !== 'published') throw new Error('That flash is unavailable.');
  return result.record;
}

export function useArchiveFeed(options: FeedOptions) {
  const [records, setRecords] = useState<Flash[]>([]);
  const [loading, setLoading] = useState(!!apiEndpoint);
  const [error, setError] = useState(apiEndpoint ? '' : 'The archive backend is not configured.');
  const [rejected, setRejected] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const request = useRef<{ controller: AbortController; busy: boolean; cursor: string | null; started: boolean } | null>(null);
  const { strategy, category, query, seed } = options;
  const loadMore = useCallback(async () => {
    const current = request.current;
    if (!apiEndpoint || !current || current.busy || current.controller.signal.aborted || (current.started && !current.cursor)) return;
    current.busy = true; setLoading(true); setError('');
    try {
      const url = buildFeedURL(apiEndpoint, { strategy, category, query, seed });
      url.searchParams.set('limit', '10');
      if (current.cursor) url.searchParams.set('cursor', current.cursor);
      const response = await fetch(url, { signal: current.controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Archive API returned HTTP ${response.status}.`);
      const body: unknown = await response.json();
      const result = parseFeedResponse(body);
      const next = (body as { nextCursor?: unknown }).nextCursor;
      if (next !== null && typeof next !== 'string') throw new Error('Invalid archive pagination response.');
      if (current.controller.signal.aborted) return;
      current.started = true; current.cursor = next; setCursor(next);
      setRecords(previous => [...new Map([...previous, ...result.records].map(record => [record.id, record])).values()]);
      setRejected(previous => previous + result.rejected);
    } catch (cause) {
      if (!current.controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the archive.');
    } finally {
      current.busy = false;
      if (!current.controller.signal.aborted) setLoading(false);
    }
  }, [strategy, category, query, seed]);
  useEffect(() => {
    if (!apiEndpoint) { setRecords([]); setError('The archive backend is not configured.'); setLoading(false); return; }
    const current = { controller: new AbortController(), busy: false, cursor: null, started: false };
    request.current = current;
    setRecords([]); setCursor(null); setRejected(0); setError(''); setLoading(true);
    const timer = window.setTimeout(() => { void loadMore(); }, query ? 200 : 0);
    return () => { clearTimeout(timer); current.controller.abort(); };
  }, [strategy, category, query, seed, retryVersion, loadMore]);
  return { records, loading, error, rejected, hasMore: !!cursor, loadMore,
    retry: () => { if (request.current?.started) void loadMore(); else setRetryVersion(value => value + 1); } };
}
