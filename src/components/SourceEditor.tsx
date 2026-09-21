import { useEffect, useRef } from 'preact/hooks';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Annotation } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

const externalChange = Annotation.define<boolean>();

export default function SourceEditor({
  source,
  onChange,
  onCursor,
}: {
  source: string;
  onChange: (value: string) => void;
  onCursor: (line: number, col: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>();
  const callbacks = useRef({ onChange, onCursor });
  callbacks.current = { onChange, onCursor };
  useEffect(() => {
    const theme = new Compartment();
    const media = matchMedia('(prefers-color-scheme: dark)');
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'MDX source',
            spellcheck: 'false',
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '12px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: '"Roboto Mono", monospace',
              lineHeight: '1.9',
            },
            '.cm-content': { padding: '26px 0' },
            '.cm-line': { padding: '0 22px 0 12px' },
            '.cm-gutters': {
              background: 'transparent',
              border: 'none',
              color: '#8b938c',
              paddingLeft: '10px',
            },
            '.cm-activeLine': { background: '#91a78c0d' },
            '.cm-activeLineGutter': { background: 'transparent' },
            '&.cm-focused': { outline: 'none' },
          }),
          theme.of(media.matches ? oneDark : []),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(externalChange),
              )
            )
              callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onCursor(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    editor.current = view;
    const changeTheme = () =>
      view.dispatch({
        effects: theme.reconfigure(media.matches ? oneDark : []),
      });
    media.addEventListener('change', changeTheme);
    return () => {
      media.removeEventListener('change', changeTheme);
      view.destroy();
    };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && source !== view.state.doc.toString())
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        annotations: externalChange.of(true),
      });
  }, [source]);
  return <div class="code-editor" ref={container} />;
}
