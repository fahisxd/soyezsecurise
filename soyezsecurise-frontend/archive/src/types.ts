export const categories = ['incidents', 'vulnerabilities', 'malware', 'research', 'memes', 'facts'] as const;
export type Category = typeof categories[number];
export type ContentType = 'historical-incident' | 'vulnerability' | 'malware-history' | 'security-research' | 'meme' | 'security-fact';
export interface Face { heading: string; body: string; code?: string; caption?: string }
export interface Media { kind: 'image'; url: string; alt: string }
export interface Presentation {
  visual: 'memory-leak' | 'network' | 'timeline' | 'bit-flip' | 'terminal' | 'typography' | 'disclosure' | 'entropy';
  accent?: 'sage' | 'coral' | 'amber' | 'ice';
  displayText?: string;
  caption?: string;
}
export interface LegacyFlash {
  schemaVersion: 1; id: string; type: ContentType; title: string; description: string;
  category: Category; tags?: string[]; media?: Media[];
  presentation?: Presentation;
  slides: { front: Face; back: Face }[];
  sources?: { title: string; url: string; note?: string }[];
  eventDate?: string; publishedAt?: string; author: { name: string; handle?: string; url?: string };
  status: 'draft' | 'published' | 'rejected';
  provenance: { kind: 'sample' | 'editorial' | 'original-research'; origin: 'manual' | 'monday'; generatedAt?: string };
  review?: { reviewedBy: string; reviewedAt: string };
}
export interface Catalog { records: Flash[]; issues: { file: string; message: string }[]; ignored: number }

export type ExternalHosts = Partial<Record<'connect' | 'script' | 'image' | 'style' | 'font' | 'media' | 'frame', string[]>>;
export interface HtmlFlash extends Omit<LegacyFlash, 'schemaVersion' | 'slides'> {
  schemaVersion: 2; html: string; css: string; javascript: string; externalHosts?: ExternalHosts;
  slides?: never;
}
export type Flash = LegacyFlash | HtmlFlash;
