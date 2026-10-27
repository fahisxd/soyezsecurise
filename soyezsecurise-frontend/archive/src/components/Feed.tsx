import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Flash } from '../types';
import { flashAt, visibleWindow } from '../lib/feed';
import { engagement } from '../lib/engagement';
import { FlashCard } from './FlashCard';
import { Icon } from './Icon';

interface Props {
  finite?: boolean; loading?: boolean; hasMore?: boolean; onLoadMore?: () => void; onRestart?: () => void;
  records: readonly Flash[]; saved: ReadonlySet<string>; initialId?: string;
  onBookmark: (id: string) => void; onShare: (id: string) => void;
  onActive: (flash: Flash | undefined) => void; onReset: () => void;
}
export function Feed({ records, saved, initialId, onBookmark, onShare, onActive, onReset, finite = false, loading, hasMore, onLoadMore, onRestart }: Props) {
  const initial = Math.max(0, records.findIndex(record => record.id === initialId));
  const [active, setActive] = useState(initial);
  const [loopCount, setCount] = useState(Math.max(12, records.length * 2));
  const count = finite ? records.length + 1 : loopCount;
  const [height, setHeight] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const restoreFocus = useRef(false);
  const measuredHeight = useRef(0);
  const resizing = useRef(false);
  activeRef.current = active;
  const flash = finite ? records[active] : flashAt(records, active);
  useEffect(() => { if (finite && hasMore && !loading && active >= records.length - 4) onLoadMore?.(); }, [finite, hasMore, loading, active, records.length, onLoadMore]);

  useLayoutEffect(() => {
    if (restoreFocus.current) { viewport.current?.focus({ preventScroll: true }); restoreFocus.current = false; }
  }, [active]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => {
      if (measuredHeight.current === element.clientHeight) return;
      measuredHeight.current = element.clientHeight;
      resizing.current = true;
      setHeight(element.clientHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!height) return;
    viewport.current?.scrollTo({ top: activeRef.current * height, behavior: 'instant' });
    const frame = requestAnimationFrame(() => { resizing.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [height]);

  useEffect(() => {
    onActive(flash);
    if (!flash) return;
    let viewed = false;
    const timer = window.setTimeout(() => { viewed = true; engagement.record({ type: 'view', flashId: flash.id }); }, 1200);
    return () => {
      window.clearTimeout(timer);
      if (!viewed) engagement.record({ type: 'skip', flashId: flash.id });
    };
  }, [flash, onActive]);

  // Warm only nearby image assets; distant cards are unmounted and images are not requested.
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (let i = active; i <= active + 2; i++) {
      for (const media of (finite ? records[i] : flashAt(records, i))?.media ?? []) {
        const image = new Image();
        image.src = media.url;
        images.push(image);
      }
    }
    return () => { for (const image of images) image.onload = null; };
  }, [active, records, finite]);

  const navigate = (delta: number) => {
    const next = Math.min(count - 1, Math.max(0, active + delta));
    if (!finite && next >= count - 3) setCount(value => value + Math.max(12, records.length));
    viewport.current?.scrollTo({ top: next * height, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  function keyDown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('input, textarea, select, summary, a, dialog') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); navigate(event.key === 'ArrowDown' ? 1 : -1); }
    if (event.key === 'Home') { event.preventDefault(); viewport.current?.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  const range = visibleWindow(active, count);
  const visible = Array.from({ length: Math.max(0, range.end - range.start + 1) }, (_, i) => range.start + i);
  return <div className="feed-layout" onKeyDown={keyDown}>
    <div className="feed-viewport" ref={viewport} tabIndex={0} aria-label="Flashes. Scroll or use up and down arrow keys." onScroll={event => {
      if (resizing.current) return;
      const next = Math.max(0, Math.round(event.currentTarget.scrollTop / (event.currentTarget.clientHeight || 1)));
      if (next !== active) {
        restoreFocus.current = !!document.activeElement?.closest('.feed-slot');
        setActive(next);
      }
      if (!finite && next >= count - 4) setCount(value => value + Math.max(12, records.length));
    }}>
      {records.length ? <div className="feed-track" style={{ height: height * count }}>{height > 0 && visible.map(index => {
        const record = finite ? records[index] : flashAt(records, index);
        if (!record) return <div className="feed-slot" key="feed-end" style={{ top: height * index, height }} inert={index !== active} aria-hidden={index !== active}><div className="feed-end"><h2>{loading ? 'Opening more flashes…' : hasMore ? 'More flashes are waiting' : 'You’ve reached the end'}</h2>{!loading && (hasMore ? <button onClick={onLoadMore}>Load more</button> : <button onClick={onRestart}>Start a fresh shuffle</button>)}</div></div>;
        return <div className="feed-slot" key={`${index}:${record.id}`} style={{ top: height * index, height }} inert={index !== active} aria-hidden={index !== active}>
          <FlashCard flash={record} index={index % records.length} saved={saved.has(record.id)} onBookmark={onBookmark} onShare={onShare} onNext={() => navigate(1)} onPrevious={index > 0 ? () => navigate(-1) : undefined}/>
        </div>;
      })}</div> : <div className="empty-state"><Icon name="search" size={42}/><h2>{loading ? 'Opening the archive…' : 'No matching flashes.'}</h2>{!loading && <><p>Try another search, category, or save a flash to keep it here.</p><button onClick={onReset}>Back to all flashes <Icon name="arrow"/></button></>}</div>}
    </div>
    <span className="sr-only" role="status">{flash ? `Flash ${(active % records.length) + 1} of ${records.length}: ${flash.title.replaceAll('\n', ' ')}` : 'No matching flashes'}</span>
  </div>;
}
