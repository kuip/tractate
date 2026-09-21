import { compileDocument } from './compile.js';
import { digest, verifiedSigners, type Envelope } from './envelope.js';
import { sourceHash } from './templates.js';
export type Review = {
  id: string;
  name: string;
  reference: string;
  digest: string;
  sourceHash: string;
  parties: string[];
  fields: { id: string; label: string; value: string }[];
};
export async function reviewContract(envelope: Envelope): Promise<Review> {
  const { fields } = await compileDocument(envelope.source);
  return {
    id: envelope.id,
    name: envelope.name,
    reference: envelope.reference || '',
    digest: digest(envelope),
    sourceHash: sourceHash(envelope.source),
    parties: [...envelope.parties],
    fields: fields.map(({ id, label, value }) => ({ id, label, value })),
  };
}
export function reviewChanges(current: Review, previous?: Review) {
  if (!previous)
    return [
      'No previous signature from this wallet is stored for this contract instance.',
    ];
  if (previous.id !== current.id)
    throw new Error('Cannot compare different contract instances.');
  const changes: string[] = [];
  for (const key of ['name', 'reference'] as const)
    if (current[key] !== previous[key])
      changes.push(`${key}: ${previous[key]} → ${current[key]}`);
  for (const party of previous.parties)
    if (!current.parties.includes(party))
      changes.push(`Removed party: ${party}`);
  for (const party of current.parties)
    if (!previous.parties.includes(party))
      changes.push(`Added party: ${party}`);
  for (const old of previous.fields)
    if (!current.fields.some((field) => field.id === old.id))
      changes.push(
        `Removed field ${old.id} (${old.label}): ${JSON.stringify(old.value)}`,
      );
  for (const field of current.fields) {
    const old = previous.fields.find((item) => item.id === field.id);
    if (!old || old.value !== field.value || old.label !== field.label)
      changes.push(
        `Field ${field.id} (${field.label}): ${old ? JSON.stringify(old.value) : '(absent)'} → ${JSON.stringify(field.value)}`,
      );
  }
  if (previous.sourceHash !== current.sourceHash && !changes.length)
    changes.push('Document content changed outside field values.');
  return changes.length
    ? changes
    : ['No changes since your previous signature.'];
}
export function isSignedReview(envelope: Envelope, signer: string) {
  return verifiedSigners(envelope).includes(signer);
}
