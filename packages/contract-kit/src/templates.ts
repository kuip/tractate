import approved from '../../../contracts/approved.json' with { type: 'json' };
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { applyFieldEdit, type FieldRange } from './fields.js';
import { MAX_SOURCE_LENGTH } from './constants.js';
export const repositoryPrefix =
  'https://raw.githubusercontent.com/kuip/tractate/';
export const approvedTemplates = Object.freeze(
  approved.map((entry) => Object.freeze({ ...entry })),
);
export function sourceHash(source: string) {
  return bytesToHex(sha256(new TextEncoder().encode(source)));
}
export function approvedReference(reference: string) {
  if (
    !/^[a-f0-9]{40}\/contracts\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.mdx$/.test(
      reference,
    )
  )
    throw new Error(
      'Use an approved full commit SHA and contracts/...mdx path.',
    );
  const record = approvedTemplates.find(
    (entry) => entry.reference === reference,
  );
  if (!record)
    throw new Error(
      'This contract version is not in the approved GitHub template list.',
    );
  return record;
}
const cache = new Map<
  string,
  Promise<{ source: string; fields: FieldRange[] }>
>();
export async function loadTemplate(reference: string, fresh = false) {
  const record = approvedReference(reference);
  if (fresh || !cache.has(reference)) {
    const request = (async () => {
      const response = await fetch(repositoryPrefix + reference, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        cache: fresh ? 'no-cache' : 'default',
      });
      if (!response.ok)
        throw new Error(
          `Approved contract is unavailable on GitHub (${response.status}).`,
        );
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty GitHub template response.');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_SOURCE_LENGTH * 4) {
          await reader.cancel();
          throw new Error('GitHub template is too large.');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (sourceHash(source) !== record.sha256)
        throw new Error(
          'GitHub template does not match its approved content hash.',
        );
      const { compileDocument } = await import('./compile.js');
      const compiled = await compileDocument(source);
      return { source, fields: compiled.fields };
    })();
    cache.set(reference, request);
    request.catch(() => {
      if (cache.get(reference) === request) cache.delete(reference);
    });
  }
  return cache.get(reference)!;
}
function structure(source: string, fields: FieldRange[]) {
  for (const field of [...fields].reverse())
    source = source.slice(0, field.from) + 'value=""' + source.slice(field.to);
  return source;
}
export function populateTemplate(
  template: { source: string; fields: FieldRange[] },
  values: Record<string, string>,
) {
  if (
    Object.keys(values).length !== template.fields.length ||
    template.fields.some((field) => typeof values[field.id] !== 'string')
  )
    throw new Error('Shared values do not match the approved contract fields.');
  let result = template;
  for (const field of template.fields) {
    // Preserve approved bytes for unchanged values; escape changed values as data.
    if (values[field.id] !== field.value)
      result = applyFieldEdit(
        result.source,
        result.fields,
        field.id,
        values[field.id],
      )!;
  }
  if (result.source.length > MAX_SOURCE_LENGTH)
    throw new Error('Contract values are too large.');
  return result.source;
}
export async function bindTemplate(
  source: string,
  reference?: string,
  fresh = false,
) {
  const { compileDocument } = await import('./compile.js');
  const current = await compileDocument(source);
  const candidates = reference
    ? [approvedReference(reference)]
    : approvedTemplates;
  for (const candidate of candidates) {
    const template = await loadTemplate(candidate.reference, fresh);
    if (
      structure(source, current.fields) !==
      structure(template.source, template.fields)
    )
      continue;
    const values = Object.fromEntries(
      current.fields.map((field) => [field.id, field.value]),
    );
    if (populateTemplate(template, values) !== source)
      throw new Error(
        'Field source formatting differs from the approved template. Edit values through the output fields.',
      );
    return { reference: candidate.reference, values };
  }
  throw new Error(
    'Only field values may differ from an approved GitHub template. Publish and approve source changes before sending or signing.',
  );
}
