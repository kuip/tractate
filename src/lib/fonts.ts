// Load every weight used by the editor and contract output, including fonts
// that would otherwise remain lazy until a code block or menu first appears.
export const editorFonts = [
  '400 16px "Roboto Condensed"',
  '500 16px "Roboto Condensed"',
  '600 16px "Roboto Condensed"',
  '700 16px "Roboto Condensed"',
  '400 16px "Roboto Mono"',
];
export async function loadEditorFonts() {
  const loaded = await Promise.all(
    editorFonts.map((font) => document.fonts.load(font)),
  );
  if (
    loaded.some(
      (faces) =>
        faces.length === 0 || faces.some((face) => face.status !== 'loaded'),
    )
  ) {
    throw new Error('The editor fonts could not be loaded.');
  }
  await document.fonts.ready;
}
