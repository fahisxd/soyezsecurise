import { useMemo } from 'react';
import type { HtmlFlash } from '../types';
import { Icon } from './Icon';
import { externalHostError, framePermissions, supportsFlashIsolation } from '../lib/flashIsolation';

export function flashDocument(flash: HtmlFlash): string {
  if (externalHostError(flash.externalHosts)) throw new Error('Unsafe flash external hosts');
  const hosts = flash.externalHosts ?? {};
  const directives = ["default-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "worker-src 'none'", "manifest-src 'none'",
    `script-src 'unsafe-inline' ${(hosts.script ?? []).join(' ')}`,
    `style-src 'unsafe-inline' ${(hosts.style ?? []).join(' ')}`,
    ...(['connect', 'font', 'media', 'frame'] as const).map(key => `${key}-src ${(hosts[key] ?? []).join(' ') || "'none'"}`),
    `img-src data: ${(hosts.image ?? []).join(' ')}`];
  const policy = directives.join('; ').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{min-height:100%;box-sizing:border-box}*{box-sizing:inherit}</style><style>${flash.css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${flash.html}<script>${flash.javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

export function HtmlFlashCard({ flash, saved, onBookmark, onShare, onNext, onPrevious }: { onNext?: () => void; onPrevious?: () => void; flash: HtmlFlash; saved: boolean; onBookmark: (id: string) => void; onShare: (id: string) => void }) {
  const supported = supportsFlashIsolation();
  const hostError = externalHostError(flash.externalHosts);
  const document = useMemo(() => supported && !hostError ? flashDocument(flash) : '', [flash, supported, hostError]);
  const permissions = useMemo(() => framePermissions(), []);
  return <article className="flash html-flash" data-flash-id={flash.id} aria-label={flash.title}>
    {supported && !hostError ? <iframe {...{ credentialless: true }} title={flash.title} sandbox="allow-scripts" allow={permissions} referrerPolicy="no-referrer" srcDoc={document}/> : <div className="feed-end" role="status"><h2>{flash.title}</h2><p>{flash.description}</p><p>{hostError ? 'This interactive flash is unavailable.' : 'Your browser cannot safely display this interactive flash. Try a browser with credentialless iframe support.'}</p></div>}
    <div className="html-flash-footer">
      <div><strong>{flash.title}</strong><span>By {flash.author.url ? <a href={flash.author.url} target="_blank" rel="noopener noreferrer">{flash.author.name}{flash.author.handle ? ` · ${flash.author.handle}` : ''}</a> : `${flash.author.name}${flash.author.handle ? ` · ${flash.author.handle}` : ''}`}</span></div>
      <div className="flash-actions">{onPrevious && <button onClick={onPrevious} aria-label="Previous flash">↑</button>}{onNext && <button onClick={onNext} aria-label="Next flash">↓</button>}<button onClick={() => onBookmark(flash.id)} aria-label={saved ? 'Remove bookmark' : 'Bookmark flash'} aria-pressed={saved}><Icon name="bookmark"/>{saved ? 'Saved' : 'Save'}</button><button onClick={() => onShare(flash.id)} aria-label="Copy shareable link"><Icon name="link"/>Share</button><details className="sources"><summary>Sources</summary><div className="source-popover">{flash.sources?.length ? flash.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>) : <p>No references supplied.</p>}</div></details></div>
    </div>
  </article>;
}
