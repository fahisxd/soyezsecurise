import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../../schema/flash.schema.json';
import type { Catalog, Flash } from '../types';
import { externalHostError } from './flashIsolation';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile<Flash>(schema);

/** One schema is used by the build, CLI, and tests. Never coerce malformed input. */
export function validateFlash(value: unknown): { record: Flash } | { error: string } {
  if (!validate(value)) return { error: ajv.errorsText(validate.errors, { separator: '; ' }) };
  if (value.schemaVersion === 2) {
    const error = externalHostError(value.externalHosts);
    if (error) return { error };
  }
  if (value.media?.some(media => media.url.split('/').includes('..'))) return { error: 'Media paths cannot contain parent traversal' };
  if (value.status === 'published' && value.review && value.publishedAt && Date.parse(value.review.reviewedAt) > Date.parse(value.publishedAt)) {
    return { error: 'Publication must be on or after review' };
  }
  return { record: value };
}

export function parseCatalog(files: { file: string; raw: string }[]): Catalog {
  const catalog: Catalog = { records: [], issues: [], ignored: 0 };
  const candidates: { file: string; record: Flash }[] = [];
  for (const { file, raw } of files) {
    try {
      const result = validateFlash(JSON.parse(raw) as unknown);
      if ('error' in result) catalog.issues.push({ file, message: result.error });
      else candidates.push({ file, record: result.record });
    } catch { catalog.issues.push({ file, message: 'Invalid JSON syntax' }); }
  }
  const counts = new Map<string, number>();
  for (const { record } of candidates) counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
  for (const { file, record } of candidates) {
    if (counts.get(record.id)! > 1) catalog.issues.push({ file, message: `Duplicate ID: ${record.id}; all copies rejected` });
    else if (record.status !== 'published') catalog.ignored++;
    else catalog.records.push(record);
  }
  return catalog;
}

export function parseFeedResponse(value: unknown): { records: Flash[]; rejected: number } {
  if (!value || typeof value !== 'object' || !('records' in value) || !Array.isArray(value.records)) throw new Error('The archive API must return an object containing a records array.');
  const catalog = parseCatalog(value.records.map((record: unknown, i: number) => ({ file: `API record ${i + 1}`, raw: JSON.stringify(record) })));
  // Validation never reorders the backend response.
  return { records: catalog.records, rejected: catalog.issues.length };
}
