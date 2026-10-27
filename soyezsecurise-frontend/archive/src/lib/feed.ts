import type { Category, Flash } from '../types';

/** Strategy names are backend request parameters, never browser ranking functions. */
export type StrategyName = 'latest' | 'random' | 'chronological' | 'category' | 'recommended';
export interface FeedOptions { strategy: StrategyName; category?: Category; query?: string; seed?: number }
export function buildFeedURL(endpoint: string, options: FeedOptions): URL {
  const url = new URL(endpoint);
  url.searchParams.set('strategy', options.strategy);
  if (options.category) url.searchParams.set('category', options.category);
  if (options.query?.trim()) url.searchParams.set('q', options.query.trim());
  if (options.seed !== undefined && (options.strategy === 'random' || options.strategy === 'recommended')) url.searchParams.set('seed', String(options.seed));
  return url;
}
/** Demo search only. Retain the authored fixture sequence without any sorting. */
export function filterDemo(records: readonly Flash[], options: Pick<FeedOptions, 'category' | 'query'>): Flash[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? '';
  return records.filter(record => record.status === 'published' && (!options.category || options.category === record.category)
    && (!query || [record.title, record.description, record.id, record.category, record.author.name, record.author.handle ?? '', ...(record.tags ?? []),
      ...(record.slides ?? []).flatMap(slide => [slide.front.heading, slide.front.body, slide.back.heading, slide.back.body])]
      .some(value => value.toLocaleLowerCase().includes(query))));
}
export function visibleWindow(active: number, count: number, overscan = 2) {
  return { start: Math.max(0, active - overscan), end: Math.min(count - 1, active + overscan) };
}
export function flashAt(records: readonly Flash[], index: number): Flash | undefined {
  return index < 0 || !records.length ? undefined : records[index % records.length];
}
