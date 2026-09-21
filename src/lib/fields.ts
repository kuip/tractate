export interface FieldRange {
  id: string;
  from: number;
  to: number;
  value: string;
}
export function applyFieldEdit(
  source: string,
  fields: FieldRange[],
  id: string,
  value: string,
) {
  const field = fields.find((field) => field.id === id);
  if (!field) return undefined;
  // Quoted JSX attributes decode HTML entities. Escape all delimiters so input
  // remains data, including text that resembles MDX or JavaScript.
  const encoded = value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');
  const replacement = `value="${encoded}"`;
  const delta = replacement.length - (field.to - field.from);
  return {
    source: source.slice(0, field.from) + replacement + source.slice(field.to),
    fields: fields.map((item) =>
      item.id === id
        ? { ...item, value, to: item.from + replacement.length }
        : item.from >= field.to
          ? { ...item, from: item.from + delta, to: item.to + delta }
          : item,
    ),
  };
}
