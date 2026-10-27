import { useState } from 'react';
import type { Flash, Face, Media } from '../types';

function StoryImage({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="image-fallback">Image unavailable: {media.alt}</span> : <img src={media.url} alt={media.alt} decoding="async" loading="lazy" onError={() => setFailed(true)}/>;
}

function PixelHeart() {
  const rows = ['0011001100', '0111111110', '1111111111', '1111111111', '0111111110', '0011111100', '0001111000', '0000110000'];
  return <svg viewBox="0 0 400 310" aria-hidden="true" className="heart-art">
    <g stroke="currentColor" strokeWidth=".5" opacity=".12">{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${i * 32} 0v310M0 ${i * 26}h400`}/>)}</g>
    <g fill="currentColor" opacity=".16" transform="translate(7 9)">{rows.flatMap((row, y) => [...row].map((cell, x) => cell === '1' && <rect key={`${x}-${y}`} x={80 + x * 24} y={36 + y * 24} width="23" height="23"/>))}</g>
    <g fill="currentColor">{rows.flatMap((row, y) => [...row].map((cell, x) => cell === '1' && <rect key={`${x}-${y}`} x={80 + x * 24} y={36 + y * 24} width="23" height="23" opacity={.73 + ((x + y) % 4) * .09}/>))}</g>
    <g fill="currentColor" opacity=".6"><rect x="262" y="244" width="17" height="17"/><rect x="310" y="220" width="10" height="10"/><rect x="340" y="262" width="7" height="7"/><rect x="218" y="275" width="12" height="12"/><rect x="285" y="291" width="5" height="5"/><rect x="361" y="305" width="10" height="10"/></g>
    <path d="M40 58H15v50m345 130h25v-50" fill="none" stroke="currentColor" opacity=".55"/>
  </svg>;
}

function Network() {
  const nodes = [[200, 60], [90, 165], [310, 165], [40, 285], [145, 285], [255, 285], [360, 285]];
  return <svg viewBox="0 0 400 340" aria-hidden="true" className="network-art"><g fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45"><path d="M200 85v25H90v30m110-30h110v30M90 190v40H40v30m50-30h55v30m165-70v40h-55v30m55-30h50v30"/>
    {nodes.map(([x, y], i) => <g key={i} transform={`translate(${x - 24} ${y - 20})`}><rect width="48" height="36" rx="3"/><path d="M12 43h24m-12-7v7"/><path d="m11 12 5 5-5 5m10 0h10" strokeWidth="2"/></g>)}</g><circle cx="200" cy="60" r="38" fill="currentColor" opacity=".12"/><path d="M188 60h24m-12-12v24" stroke="currentColor" strokeWidth="2"/></svg>;
}

export function StoryVisual({ flash, face }: { flash: Flash; face: Face }) {
  const kind = flash.presentation?.visual ?? (flash.media?.length ? 'disclosure' : flash.category === 'memes' ? 'typography' : 'terminal');
  const text = flash.presentation?.displayText ?? flash.eventDate?.slice(0, 4) ?? 'Look closer.';
  const caption = flash.presentation?.caption ?? face.caption ?? flash.description;
  return <span className={`story-visual visual-${kind}`} aria-label={caption}>
    {kind === 'memory-leak' ? <><span className="visual-label">ANATOMY OF A MEMORY LEAK</span><PixelHeart/><span className="visual-stat">{text}</span><span className="visual-caption">{caption}</span></>
      : kind === 'network' ? <><span className="network-year">{text}</span><Network/><span className="visual-caption">{caption}</span></>
      : kind === 'timeline' ? <><span className="visual-label">THE TIMELINE</span><span className="timeline-year">{text}<span>↘</span></span><span className="timeline-code"><i/>{face.code && <code>{face.code}</code>}</span><span className="visual-caption">{caption}</span></>
      : kind === 'bit-flip' ? <><span className="visual-label">PHYSICAL MEMORY / CONCEPTUAL VIEW</span><span className="bit-grid">{Array.from({ length: 35 }, (_, i) => <span key={i} className={i === 17 ? 'changed-bit' : ''}>{i === 17 ? '1' : i % 3 === 0 ? '1' : '0'}</span>)}</span><span className="bit-verdict">{text}</span><span className="visual-caption">{caption}</span></>
      : kind === 'typography' ? <><span className="meme-sticker">FAMOUS LAST WORDS</span><span className="meme-type">{text}</span><span className="meme-stamp">DEPLOY<br/>AND PRAY ↗</span><span className="visual-caption">{caption}</span></>
      : kind === 'entropy' ? <><span className="entropy-grid" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => <i key={i} style={{ opacity: ((i * 37 + 19) % 100) / 100, transform: `rotate(${i % 4 * 90}deg)` }}/>)}</span><span className="entropy-type">{text}</span><span className="visual-caption">{caption}</span></>
      : kind === 'disclosure' && flash.media?.length ? <><span className="visual-label">A VERY SMALL FILE. A BETTER CONVERSATION.</span><span className="disclosure-type">{text}</span><span className="story-images">{flash.media.map(media => <StoryImage key={media.url} media={media}/>)}</span><span className="visual-caption">{caption}</span></>
      : <><span className="terminal-art"><span className="terminal-art-bar"><i/><i/><i/><span>the part nobody expected</span></span><span className="terminal-art-title">{text}</span><code>{face.code ?? face.caption ?? flash.description}</code><span className="terminal-art-cursor">▌</span></span><span className="visual-caption">{caption}</span></>}
  </span>;
}
