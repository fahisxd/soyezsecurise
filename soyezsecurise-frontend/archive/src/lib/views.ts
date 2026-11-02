import { useEffect } from 'react';
import { apiEndpoint } from './api';

const counted = new Set<string>();
const pending = new Set<string>();

export function useArchiveView(id: string | undefined) {
  useEffect(() => {
    if (!id || !apiEndpoint) return;
    const key = `archive-view:${apiEndpoint}:${id}`;
    let timer: number | undefined;
    const start = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      timer = window.setTimeout(() => {
        if (counted.has(key) || pending.has(key)) return;
        try { if (sessionStorage.getItem(key)) return; } catch { /* Memory fallback. */ }
        pending.add(key);
        void fetch(`${apiEndpoint.replace(/\/$/, '')}/${encodeURIComponent(id)}/view`, {
          method: 'POST', credentials: 'omit', keepalive: true,
        }).then(response => {
          if (!response.ok) return;
          counted.add(key);
          try { sessionStorage.setItem(key, '1'); } catch { /* Memory fallback. */ }
        }).catch(() => { /* Counting must never interrupt reading. */ })
          .finally(() => pending.delete(key));
      }, 2000);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', start); };
  }, [id]);
}
