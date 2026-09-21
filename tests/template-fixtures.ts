import { readFileSync } from 'node:fs';
import approved from '../contracts/approved.json' with { type: 'json' };
export const reference = approved[0].reference;
export const templates = Object.fromEntries(
  approved.map(({ reference }) => [
    'https://raw.githubusercontent.com/kuip/tractate/' + reference,
    readFileSync(new URL('../' + reference.slice(41), import.meta.url), 'utf8'),
  ]),
);
export const template =
  templates['https://raw.githubusercontent.com/kuip/tractate/' + reference];
export function mockTemplates() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const source = templates[String(input)];
    return source === undefined ? original(input, init) : new Response(source);
  };
}
