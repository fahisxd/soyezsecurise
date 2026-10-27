import { HtmlFlashCard } from './HtmlFlashCard';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Flash, Face, LegacyFlash } from '../types';
import { engagement } from '../lib/engagement';
import { Icon } from './Icon';
import { StoryVisual } from './StoryVisual';

function CardFace({ face, flash, back, hidden, descriptionId }: { face: Face; flash: LegacyFlash; back?: boolean; hidden: boolean; descriptionId: string }) {
  const excerpt = face.body.length > 320 ? `${face.body.slice(0, 317).trimEnd()}…` : face.body;
  return <span className={`card-face ${back ? 'card-back' : 'card-front'}`} aria-hidden={hidden}>
    <span className="face-top"><span className="face-topic"><span className="topic-dot"/><span>{flash.category === 'facts' ? 'Curiosities' : flash.category}</span><span className="face-date">{flash.eventDate?.slice(0, 4) ?? 'Undated'}</span><span className="face-kind">{back ? 'Debrief' : flash.type.replaceAll('-', ' ')}</span></span><span className="sample-label">{flash.provenance.kind === 'sample' ? 'Demo story' : 'Curated story'}</span></span>
    <span className="face-layout">
      <span className="story-copy" id={descriptionId}>
        {back && <span className="card-kicker">THE DEBRIEF</span>}
        <span className={`card-title ${face.heading.replace(/\s/g, '').length > 28 ? 'card-title-long' : ''}`} role="heading" aria-level={2}>{face.heading}</span>
        <span className="card-copy">{excerpt}</span>
        <span className="card-inline-hint"><Icon name="flip" size={16}/>{back ? 'Tap to return to the story' : 'Tap anywhere to flip the story'}</span>
      </span>
      {back ? <span className="debrief-visual"><span className="debrief-mark" aria-hidden="true">↳</span><span className="debrief-heading">The detail<br/>that matters.</span>{face.code && <code>{face.code}</code>}<span className="visual-caption">{face.caption ?? flash.description}</span></span> : <StoryVisual flash={flash} face={face}/>}
    </span>
    <span className="face-bottom"><span>{back ? 'Check the sources. Stay curious.' : face.caption ?? 'A little history. A different perspective.'}</span><span>{back ? '02 / CONTEXT' : '01 / THE STORY'}</span></span>
  </span>;
}

function LegacyFlashCard({ flash, index, saved, onBookmark, onShare }: { flash: LegacyFlash; index: number; saved: boolean; onBookmark: (id: string) => void; onShare: (id: string) => void }) {
  const descriptionId = useId();
  const transcript = useRef<HTMLDialogElement>(null);
  const [slide, setSlide] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [read, setRead] = useState<Set<number>>(() => new Set());
  const current = flash.slides[slide]!;
  const changeSlide = (next: number) => { setSlide(next); setFlipped(false); };
  function flip() {
    setFlipped(!flipped);
    if (!flipped && !read.has(slide)) {
      const next = new Set(read).add(slide);
      setRead(next);
      if (next.size === flash.slides.length) engagement.record({ type: 'completion', flashId: flash.id });
    }
  }
  function keys(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('dialog')) return;
    if (event.key === 'ArrowRight' && slide < flash.slides.length - 1) { event.preventDefault(); event.stopPropagation(); changeSlide(slide + 1); }
    if (event.key === 'ArrowLeft' && slide > 0) { event.preventDefault(); event.stopPropagation(); changeSlide(slide - 1); }
  }
  return <article className={`flash accent-${flash.presentation?.accent ?? 'sage'} story-${flash.presentation?.visual ?? 'default'}`} aria-label={flash.title.replaceAll('\n', ' ')} data-flash-id={flash.id} onKeyDown={keys}>
    <div className="card-stack">
      <button className={`card-stage ${flipped ? 'is-flipped' : ''}`} onClick={flip} aria-pressed={flipped} aria-describedby={`${descriptionId}-${flipped ? 'back' : 'front'}`} aria-label={`${flipped ? 'Show front' : 'Reveal the debrief'}: ${flash.title.replaceAll('\n', ' ')}`}>
        <span className="card-rotator" key={slide}>
          <CardFace face={current.front} flash={flash} hidden={flipped} descriptionId={`${descriptionId}-front`}/>
          <CardFace face={current.back} flash={flash} back hidden={!flipped} descriptionId={`${descriptionId}-back`}/>
        </span>
      </button>
    </div>
    <div className="story-controls">
      <div className="slide-controls"><div className="slide-dots" role="group" aria-label="Slides">{flash.slides.map((_, i) => <button key={i} className={i === slide ? 'selected' : ''} aria-label={`Slide ${i + 1} of ${flash.slides.length}`} aria-current={i === slide ? 'step' : undefined} onClick={() => changeSlide(i)}><span/></button>)}</div><span className="slide-count">{String(slide + 1).padStart(2, '0')} / {String(flash.slides.length).padStart(2, '0')}</span><button className="flip-control" onClick={flip}><Icon name="flip"/>{flipped ? 'The story' : 'The debrief'}</button></div>
      <div className="flash-actions">
        <button className="transcript-button" onClick={() => transcript.current?.showModal()} aria-label="Read full flash"><Icon name="file" size={18}/><span className="read-long">Read full story</span><span className="read-short">Read</span></button>
        <button onClick={() => onBookmark(flash.id)} aria-label={saved ? 'Remove bookmark' : 'Bookmark flash'} aria-pressed={saved} className={saved ? 'is-saved' : ''}><Icon name="bookmark"/><span>{saved ? 'Saved' : 'Save'}</span></button>
        <button onClick={() => onShare(flash.id)} aria-label="Copy shareable link"><Icon name="link"/><span>Share</span></button>
        <details className="sources"><summary><Icon name="external"/><span>Sources</span></summary><div className="source-popover"><span className="popover-label">THE PAPER TRAIL</span>{flash.sources?.length ? flash.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="external" size={14}/>{source.note && <small>{source.note}</small>}</a>) : <p>{flash.type === 'meme' ? 'Original fictional meme. No research claim.' : 'No references supplied for this record.'}</p>}<small>{flash.author.name}<br/>Published {flash.publishedAt?.slice(0, 10) ?? 'date unavailable'}</small></div></details>
      </div>
    </div>
    <dialog ref={transcript} className="story-transcript" aria-label="Full flash text" onClick={event => { if (event.target === event.currentTarget) transcript.current?.close(); }}>
      <div className="transcript-heading"><span>{flash.provenance.kind === 'sample' ? 'Demo story · ' : ''}{flash.category}</span><button onClick={() => transcript.current?.close()} aria-label="Close full story"><Icon name="close"/></button></div><h2>{flash.title}</h2><p>{flash.description}</p>{flash.slides.map((item, i) => <section key={i}><span className="transcript-slide">Slide {i + 1}</span>{[item.front, item.back].map((face, j) => <div key={j}><h3>{face.heading}</h3><p>{face.body}</p>{face.code && <pre>{face.code}</pre>}{face.caption && <small>{face.caption}</small>}</div>)}</section>)}<p className="transcript-author">{flash.author.name}</p>
    </dialog>
    <span className="sr-only">Flash {index + 1}</span>
  </article>;
}

export function FlashCard(props: { onNext?: () => void; onPrevious?: () => void; flash: Flash; index: number; saved: boolean; onBookmark: (id: string) => void; onShare: (id: string) => void }) {
  return props.flash.schemaVersion === 2 ? <HtmlFlashCard {...props} flash={props.flash}/> : <LegacyFlashCard {...props} flash={props.flash}/>;
}
