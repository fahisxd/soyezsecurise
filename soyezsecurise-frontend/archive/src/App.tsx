import { useCallback, useEffect, useMemo, useState } from 'react';
import { categories, type Category, type Flash } from './types';
import type { StrategyName } from './lib/feed';
import { apiEndpoint, fetchFlash, useArchiveFeed } from './lib/api';
import { bookmarkKey, parseBookmarks, readBookmarks, writeBookmarks } from './lib/bookmarks';
import { engagement } from './lib/engagement';
import { Feed } from './components/Feed';
import { Icon } from './components/Icon';

const categoryLabels: Record<Category, string> = { incidents: 'Incidents', vulnerabilities: 'Vulnerabilities', malware: 'Malware', research: 'Research', memes: 'Memes', facts: 'Curiosities' };
function linkedId() {
  if (!location.hash.startsWith('#flash/')) return '';
  try { return decodeURIComponent(location.hash.replace(/^#flash\//, '')); } catch { return ''; }
}

export default function App() {
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState(readBookmarks);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const [strategy, setStrategy] = useState<StrategyName>('random');
  const [seed, setSeed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647);
  const [jump, setJump] = useState(() => ({ id: linkedId(), version: 0 }));
  const upstream = useArchiveFeed({ strategy, category, query, seed });
  const [notice, setNotice] = useState('');
  const [manualLink, setManualLink] = useState('');

  const [linkedRecord, setLinkedRecord] = useState<Flash>();
  const [savedRecords, setSavedRecords] = useState<Flash[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [lookupVersion, setLookupVersion] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  useEffect(() => {
    if (!apiEndpoint || (!savedOnly && !jump.id)) { setLookupLoading(false); setLookupError(''); return; }
    const controller = new AbortController();
    setLookupError(''); setLookupLoading(true);
    async function resolve() {
      try {
        if (savedOnly) {
          setSavedRecords([]);
          const ids = [...saved]; const found: Flash[] = [];
          // Bound request concurrency even for a large bookmark collection.
          for (let offset = 0; offset < ids.length; offset += 6) {
            const batch = await Promise.all(ids.slice(offset, offset + 6).map(async id => {
              try { return await fetchFlash(id, controller.signal); }
              catch (error) { if (error instanceof Error && error.message === 'That flash is unavailable.') return undefined; throw error; }
            }));
            found.push(...batch.filter((record): record is Flash => !!record));
          }
          if (!controller.signal.aborted) setSavedRecords(found);
        } else {
          const record = await fetchFlash(jump.id, controller.signal);
          if (!controller.signal.aborted) setLinkedRecord(record);
        }
      } catch (error) {
        if (!controller.signal.aborted) { setLookupError(error instanceof Error ? error.message : 'Unable to load flashes.'); setLinkedRecord(undefined); }
      } finally { if (!controller.signal.aborted) setLookupLoading(false); }
    }
    void resolve();
    return () => controller.abort();
  }, [savedOnly, saved, jump.id, lookupVersion]);
  const filtered = useMemo(() => {
    if (savedOnly) return apiEndpoint ? savedRecords.filter(record => saved.has(record.id)) : upstream.records.filter(record => saved.has(record.id));
    const selected = linkedRecord && linkedRecord.id === jump.id ? linkedRecord : undefined;
    return selected ? [selected, ...upstream.records.filter(record => record.id !== selected.id)] : upstream.records;
  }, [upstream.records, savedOnly, saved, savedRecords, linkedRecord, jump.id]);
  const savedCount = saved.size;
  const onActive = useCallback((flash: Flash | undefined) => {
    if (flash) history.replaceState(null, '', `${location.pathname}${location.search}#flash/${flash.id}`);
  }, []);
  const openFlash = useCallback((id: string) => {
    setLinkedRecord(undefined); setQuery(''); setCategory(undefined); setSavedOnly(false);
    setJump(old => ({ id, version: old.version + 1 }));
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === bookmarkKey || event.key === null) setSaved(event.key === null ? new Set() : parseBookmarks(event.newValue)); };
    const hash = (event: HashChangeEvent) => {
      const targetHash = new URL(event.newURL).hash;
      if (!targetHash.startsWith('#flash/')) return;
      try { openFlash(decodeURIComponent(targetHash.slice(7))); }
      catch { openFlash(''); }
    };
    window.addEventListener('storage', sync); window.addEventListener('hashchange', hash);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('hashchange', hash); };
  }, [openFlash]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const dismissMenus = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      document.querySelectorAll<HTMLDetailsElement>('.header-menu[open]').forEach(menu => {
        if (!menu.contains(target)) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', dismissMenus);
    return () => document.removeEventListener('pointerdown', dismissMenus);
  }, []);
  function bookmark(id: string) {
    const next = new Set(saved);
    const removing = next.has(id);
    if (removing) next.delete(id); else { next.add(id); engagement.record({ type: 'bookmark', flashId: id }); }
    setSaved(next);
    const persisted = writeBookmarks(next);
    setNotice(persisted ? (removing ? 'Removed from your saved flashes.' : 'Saved on this device.') : 'Saved for this session. Browser storage is unavailable.');
  }
  async function share(id: string) {
    const url = new URL(location.href); url.hash = `flash/${id}`;
    try { await navigator.clipboard.writeText(url.href); setNotice('Link copied. Send someone down the rabbit hole.'); }
    catch { setManualLink(url.href); }
  }
  function reset() { setQuery(''); setCategory(undefined); setSavedOnly(false); setLinkedRecord(undefined); setJump(old => ({ id: '', version: old.version + 1 })); }
  const feedKey = `${strategy}:${category}:${query}:${seed}:${savedOnly}:${savedOnly ? [...saved].sort().join(',') : ''}:${jump.version}:${linkedRecord?.id ?? ''}`;
  function closeMenus() { document.querySelectorAll<HTMLDetailsElement>('.header-menu[open]').forEach(menu => { menu.open = false; }); }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to archive</a>
    <header className="archive-header">
      <button className="archive-logo" onClick={() => { reset(); closeMenus(); }} aria-label="The Archive home">
        <span className="logo-symbol" aria-hidden="true">a<span>_</span></span>
        <span>THE ARCHIVE<span className="logo-byline">by SoyezSécurisé</span></span>
      </button>
      <nav className="view-switch" aria-label="Flash feeds">
        <button className={!savedOnly ? 'active' : ''} aria-pressed={!savedOnly} onClick={() => { setSavedOnly(false); closeMenus(); }}>Flashes</button>
        <button className={savedOnly ? 'active' : ''} aria-label="Saved flashes" aria-pressed={savedOnly} onClick={() => { setSavedOnly(true); closeMenus(); }}><Icon name="bookmark" size={16}/><span>Saved</span>{savedCount > 0 && <span className="saved-count">{savedCount}</span>}</button>
      </nav>
      <div className="header-tools">
        <details className={`header-menu search-menu ${query || category ? 'has-filter' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
          <summary aria-label="Search and filter"><Icon name="search"/><span>Search & filter</span></summary>
          <div className="menu-panel">
            <label className="search-box"><Icon name="search"/><input type="search" aria-label="Search the archive" placeholder="Find your next rabbit hole…" value={query} onChange={event => { setLinkedRecord(undefined); setJump(old => ({ id: '', version: old.version + 1 })); setQuery(event.target.value); }}/></label>
            <span className="menu-label">Explore a topic</span>{(query || category || savedOnly) && <button className="clear-view" onClick={reset}>Clear filters <Icon name="close" size={13}/></button>}
            <div className="category-chips"><button className={!category ? 'active' : ''} onClick={() => { reset(); closeMenus(); }}>Everything</button>{categories.map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => { setLinkedRecord(undefined); setJump(old => ({ id: '', version: old.version + 1 })); setCategory(value); setSavedOnly(false); closeMenus(); }}>{categoryLabels[value]}</button>)}</div>
            <label className="order-label">Feed order<select aria-label="Feed order" value={strategy} onChange={event => { const next = event.target.value as StrategyName; setLinkedRecord(undefined); setJump(old => ({ id: '', version: old.version + 1 })); setStrategy(next); if (next === 'category' && !category) setCategory('incidents'); }}><option value="latest">Latest first</option><option value="random">Shuffle</option><option value="chronological">Oldest events</option><option value="category">By category</option><option value="recommended">Recommended · preview</option></select></label>
            {strategy === 'random' && <button className="menu-reshuffle" onClick={() => { setLinkedRecord(undefined); setJump(old => ({ id: '', version: old.version + 1 })); setSeed(value => (value + 1) % 2147483647); }}><Icon name="shuffle"/>Reshuffle feed</button>}
            {strategy === 'recommended' && <p className="menu-note">Recommended currently uses a shuffled feed. No personalization yet.</p>}
          </div>
        </details>
      </div>
    </header>
    <main id="main-content" className="main-content" tabIndex={-1}>
      <h1 className="sr-only">THE ARCHIVE — cybersecurity stories, one flash at a time</h1>
      <Feed key={feedKey} records={filtered} finite loading={upstream.loading || lookupLoading} hasMore={!savedOnly && upstream.hasMore} onLoadMore={() => { if (!savedOnly && !upstream.error) void upstream.loadMore(); }} onRestart={() => { reset(); setSeed(crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647); }} saved={saved} initialId={jump.id} onBookmark={bookmark} onShare={share} onActive={onActive} onReset={reset}/>
    </main>
    {lookupError && <div className="network-status" role="alert">{lookupError} <button onClick={() => setLookupVersion(value => value + 1)}>Retry</button></div>}
    {upstream.loading && <div className="network-status" role="status">Opening the archive…</div>}
    {upstream.error && <div className="network-status" role="alert">{upstream.error} <button onClick={upstream.retry}>Retry</button></div>}
    {!!upstream.rejected && <div className="network-status">Some invalid records were skipped.</div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={16}/></button></div>}
    {manualLink && <div className="share-fallback"><label htmlFor="share-url">Copy this shareable link</label><input id="share-url" readOnly value={manualLink} autoFocus onFocus={event => event.target.select()}/><button onClick={() => setManualLink('')} aria-label="Close share link"><Icon name="close"/></button></div>}
  </div>;
}
