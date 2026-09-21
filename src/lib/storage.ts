import type { Envelope } from './envelope';
import { openDB } from 'idb';
export type View = 'source' | 'both' | 'output' | 'no-menu';
export interface Draft {
  version: 1;
  source: string;
  name: string;
  updated: number;
  contract?: Pick<Envelope, 'id' | 'parties' | 'signatures'>;
}
const db = () =>
  openDB('tractate', 1, {
    upgrade(database) {
      database.createObjectStore('drafts');
    },
  });
export async function readDraft(key = 'current'): Promise<Draft | undefined> {
  const value = await (await db()).get('drafts', key);
  if (value === undefined) return undefined;
  if (
    value.version !== 1 ||
    typeof value.source !== 'string' ||
    typeof value.name !== 'string'
  ) {
    throw new Error('This saved draft has an unsupported format.');
  }
  return value;
}
export async function saveDraft(draft: Draft, key = 'current') {
  await (await db()).put('drafts', draft, key);
}
