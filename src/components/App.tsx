import ContractActions from './ContractActions';
import {
  fromShareUrl,
  parseEnvelope,
  hydrateEnvelope,
  portableEnvelope,
  type Envelope,
} from '../lib/envelope';
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedEvent, TargetedPointerEvent } from 'preact';
import SourceEditor from './SourceEditor';
import Menu, { type MenuItem } from './Menu';
import Compiler from '../lib/compiler.worker?worker';
import { blank, MAX_SOURCE_LENGTH } from '../lib/example';
import { contracts, defaultContract } from '../lib/contracts';
import { applyFieldEdit, type FieldRange } from '../lib/fields';
import { readDraft, saveDraft, type View } from '../lib/storage';

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
type Dialog = {
  title: string;
  description: string;
  action?: () => void;
  button?: string;
};
export default function App() {
  const startSigning =
    new URLSearchParams(location.search).get('action') === 'sign';
  const openSigning = () => {
    setView('no-menu');
    setRequestedAction((value) => value + 1);
  };
  useEffect(() => {
    window.addEventListener('tractate:open-sign', openSigning);
    return () => window.removeEventListener('tractate:open-sign', openSigning);
  }, []);
  const [linkedContract] = useState(() =>
    contracts.find(
      (contract) =>
        contract.path === new URLSearchParams(location.search).get('contract'),
    ),
  );
  const [draftKey, setDraftKey] = useState(
    linkedContract
      ? `contract:${linkedContract.path}`
      : new URLSearchParams(location.search).has('draft')
        ? `shared:${new URLSearchParams(location.search).get('draft')}`
        : 'current',
  );
  const [source, setSource] = useState(
    linkedContract?.source || defaultContract?.source || blank,
  );
  const [name, setName] = useState(
    linkedContract?.name || defaultContract?.name || 'untitled-contract',
  );
  const [view, setView] = useState<View>(
    startSigning || new URLSearchParams(location.search).has('draft')
      ? 'no-menu'
      : linkedContract
        ? 'output'
        : 'both',
  );
  const [ready, setReady] = useState(false);
  const [contract, setContract] = useState<
    Pick<Envelope, 'id' | 'parties' | 'signatures' | 'reference'>
  >(() => ({ id: bytesToHex(randomBytes(16)), parties: [], signatures: [] }));
  const envelope: Envelope = { version: 2, ...contract, source, name };
  const [requestedAction, setRequestedAction] = useState(startSigning ? 1 : 0);
  const sendProof = async () => {
    const snapshot = current.current;
    try {
      const proof = await portableEnvelope({
        version: 2,
        ...snapshot.contract,
        source: snapshot.source,
        name: snapshot.name,
      });
      if (
        current.current.source !== snapshot.source ||
        current.current.name !== snapshot.name ||
        current.current.contract !== snapshot.contract
      )
        return;
      frame.current?.contentWindow?.postMessage(
        { type: 'tractate:proof', contract: proof },
        '*',
      );
    } catch {
      frame.current?.contentWindow?.postMessage(
        { type: 'tractate:proof' },
        '*',
      );
    }
  };
  const [saveStatus, setSaveStatus] = useState('Opening workspace…');
  const [compileStatus, setCompileStatus] = useState('Preparing output');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cursor, setCursor] = useState([1, 1]);
  const [ratio, setRatio] = useState(48);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(`${base}preview.html`);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (rendered) void sendProof();
  }, [source, contract, rendered]);
  const frame = useRef<HTMLIFrameElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker>();
  const latest = useRef<{ code: string; id: number }>();
  const revision = useRef(0);
  const fieldMap = useRef<{ source: string; fields: FieldRange[] }>();
  const channel = useRef<BroadcastChannel>();
  const saveAllowed = useRef(true);
  const saveQueue = useRef(Promise.resolve());
  const pendingSave = useRef(false);
  const registration = useRef<ServiceWorkerRegistration>();
  const current = useRef({ source, name, contract });
  current.current = { source, name, contract };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      if (location.hash.startsWith('#bundle=')) {
        const imported = await fromShareUrl(location.hash);
        setDraftKey(`shared:${imported.id}`);
        history.replaceState(
          null,
          '',
          `${location.pathname}?draft=${encodeURIComponent(imported.id)}`,
        );
        setContract({
          id: imported.id,
          reference: imported.reference,
          parties: imported.parties,
          signatures: imported.signatures,
        });
        setView('no-menu');
        return { ...imported, contract: imported, updated: Date.now() };
      }
      return readDraft(draftKey);
    };
    load()
      .then((draft) => {
        if (disposed) return;
        if (draft) {
          if (draft.contract) {
            const restored = parseEnvelope({
              version: 2,
              ...draft.contract,
              name: draft.name,
              source: draft.source,
            });
            setContract({
              id: restored.id,
              reference: restored.reference,
              parties: restored.parties,
              signatures: restored.signatures,
            });
          }
          setSource(
            draft.contract
              ? draft.source
              : draft.source.replace(
                  /<Field label="(Author|Recipient|Purpose)" value="(Your name or identity|Contributor identity|An open-source contribution)" \/>/g,
                  '<Field label="$1" value="" placeholder="$2" />',
                ),
          );
          setName(draft.name);
        }
        setSaveStatus(draft ? 'saved' : 'Local draft');
      })
      .catch((error) => {
        saveAllowed.current = false;
        setSaveStatus('Autosave unavailable');
        setNotice(
          error instanceof Error
            ? error.message
            : 'Your saved draft could not be opened.',
        );
      })
      .finally(() => {
        if (!disposed) setReady(true);
      });
    const unload = (event: BeforeUnloadEvent) => {
      if (pendingSave.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', unload);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel(`tractate:drafts:${draftKey}`);
      channel.current.onmessage = () => {
        saveAllowed.current = false;
        setSaveStatus('Autosave paused');
        setNotice(
          'This draft changed in another tab. Export this tab’s work, then reload to open the latest saved draft.',
        );
      };
    }
    return () => channel.current?.close();
  }, [draftKey, ready]);

  useEffect(() => {
    // Fetch in the host for offline fallback: opaque sandbox frames cannot
    // use the host service worker. A normal URL works best in embedded WebKit.
    let disposed = false;
    let url = '';
    fetch(`${base}preview.html`)
      .then((response) => {
        if (!response.ok) throw new Error('Preview unavailable');
        return response.text();
      })
      .then((html) => {
        if (disposed) return;
        if (!navigator.onLine) {
          url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
          setPreviewUrl(url);
        }
      })
      .catch(() => {
        setError(
          'The output renderer could not load. Reconnect and reload to cache it.',
        );
        setCompileStatus('Output unavailable');
      });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    worker.current = new Compiler();
    worker.current.onmessage = ({ data }) => {
      if (data.id !== revision.current) return;
      if (data.source && data.source !== current.current.source) return;
      if (data.error) {
        setError(data.error);
        setCompileStatus('Check source');
        return;
      }
      fieldMap.current = { source: data.source, fields: data.fields };
      latest.current = { code: data.code, id: data.id };
      frame.current?.contentWindow?.postMessage(
        { type: 'tractate:render', ...latest.current },
        '*',
      );
    };
    worker.current.onerror = () => {
      setError('The compiler could not start. Reload the app to retry.');
      setCompileStatus('Compiler unavailable');
    };
    const messages = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (
        event.data?.type === 'tractate:action' &&
        event.data.action === 'sign'
      ) {
        setView('no-menu');
        setRequestedAction((value) => value + 1);
        return;
      }
      if (event.data?.type === 'tractate:proof-request') {
        void sendProof();
        return;
      }
      if (event.data?.type === 'tractate:field') {
        const map = fieldMap.current;
        if (
          !map ||
          map.source !== current.current.source ||
          typeof event.data.fieldId !== 'string' ||
          typeof event.data.value !== 'string'
        )
          return;
        const edit = applyFieldEdit(
          map.source,
          map.fields,
          event.data.fieldId,
          event.data.value,
        );
        if (!edit || edit.source.length > MAX_SOURCE_LENGTH) return;
        fieldMap.current = edit;
        current.current = { ...current.current, source: edit.source };
        setSource(edit.source);
        return;
      }
      if (event.data?.type === 'tractate:ready' && latest.current)
        frame.current?.contentWindow?.postMessage(
          { type: 'tractate:render', ...latest.current },
          '*',
        );
      if (event.data?.id !== revision.current) return;
      if (event.data?.type === 'tractate:rendered') {
        setRendered(true);
        setError('');
        setCompileStatus('output OK');
      }
      if (event.data?.type === 'tractate:error') {
        setError(event.data.error);
        setCompileStatus('Check source');
      }
    };
    window.addEventListener('message', messages);
    return () => {
      worker.current?.terminate();
      window.removeEventListener('message', messages);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const id = ++revision.current;
    setCompileStatus('Updating output…');
    const timer = setTimeout(
      () => worker.current?.postMessage({ id, source }),
      300,
    );
    return () => clearTimeout(timer);
  }, [source, ready]);

  useEffect(() => {
    if (!ready || !saveAllowed.current) return;
    pendingSave.current = true;
    setSaveStatus('Saving…');
    const timer = setTimeout(() => {
      const draft = {
        version: 1 as const,
        source,
        name,
        contract,
        updated: Date.now(),
      };
      saveQueue.current = saveQueue.current.then(async () => {
        if (!saveAllowed.current) return;
        try {
          await saveDraft(draft, draftKey);
          channel.current?.postMessage({ updated: draft.updated });
          if (
            current.current.source === source &&
            current.current.name === name &&
            current.current.contract === contract
          ) {
            pendingSave.current = false;
            setSaveStatus('saved');
          }
        } catch {
          setSaveStatus('Could not save');
          setNotice(
            'Browser storage is unavailable or full. Export your draft to keep a copy.',
          );
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [source, name, contract, draftKey, ready]);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        registration.current = reg;
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener('updatefound', () =>
          reg.installing?.addEventListener('statechange', () => {
            if (reg.waiting && navigator.serviceWorker.controller)
              setUpdateReady(true);
          }),
        );
      })
      .catch(() =>
        setNotice(
          'Offline caching is unavailable in this browser session. Editing and export still work.',
        ),
      );
    const refresh = () => location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', refresh);
  }, []);

  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal();
  }, [dialog]);

  const chooseView = (next: View) => setView(next);
  const exportFile = () => {
    const url = URL.createObjectURL(
      new Blob([source], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_-]/gi, '-').replace(/^-+|-+$/g, '') || 'contract'}.mdx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const replace = (nextSource: string, nextName: string) =>
    setDialog({
      title: 'Replace this draft?',
      description:
        'Your current draft will be replaced on this device. Export a copy first if you want to keep it.',
      button: 'Replace draft',
      action: () => {
        setSource(nextSource);
        setName(nextName);
        setContract({
          id: bytesToHex(randomBytes(16)),
          parties: [],
          signatures: [],
        });
        setView('both');
        fieldMap.current = undefined;
      },
    });
  const importFile = async (event: TargetedEvent<HTMLInputElement, Event>) => {
    const selected = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!selected) return;
    if (
      selected.size >
      (selected.name.endsWith('.json') ? 600_000 : MAX_SOURCE_LENGTH * 4)
    ) {
      setNotice(
        'That file is too large. Choose an MDX file under 100,000 characters.',
      );
      return;
    }
    try {
      const text = await selected.text();
      if (!selected.name.endsWith('.json') && text.length > MAX_SOURCE_LENGTH)
        throw new Error();
      if (selected.name.endsWith('.json')) {
        const imported = await hydrateEnvelope(JSON.parse(text));
        setDialog({
          title: 'Open contract package?',
          description:
            'This replaces the current draft with the package, including its parties and signatures.',
          button: 'Open package',
          action: () => {
            setSource(imported.source);
            setName(imported.name);
            setContract({
              id: imported.id,
              reference: imported.reference,
              parties: imported.parties,
              signatures: imported.signatures,
            });
            setView('no-menu');
            fieldMap.current = undefined;
          },
        });
      } else replace(text, selected.name.replace(/\.(mdx?|txt)$/i, ''));
    } catch {
      setNotice(
        'This file could not be imported or exceeds 100,000 characters.',
      );
    }
  };
  const insert = (text: string) => {
    setSource(source + '\n' + text + '\n');
    chooseView('both');
  };
  const resize = (event: TargetedPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = workspace.current!.getBoundingClientRect();
    const update = (e: PointerEvent) =>
      setRatio(
        Math.min(
          70,
          Math.max(30, ((e.clientX - rect.left) / rect.width) * 100),
        ),
      );
    const target = event.currentTarget;
    target.addEventListener('pointermove', update);
    target.addEventListener(
      'pointerup',
      () => target.removeEventListener('pointermove', update),
      { once: true },
    );
  };
  const words = source.trim() ? source.trim().split(/\s+/).length : 0;

  return (
    <div class="app">
      <header class="topbar">
        <button
          class="logo-toggle"
          aria-label={view === 'no-menu' ? 'Show menu' : 'Hide menu'}
          aria-expanded={view !== 'no-menu'}
          onClick={() => setView(view === 'no-menu' ? 'output' : 'no-menu')}
        >
          <img
            src={`${base}assets/tractate.svg`}
            alt=""
            width="34"
            height="34"
          />
        </button>
        <span class="brand" hidden={view === 'no-menu'}>
          tractate
        </span>
        <span class="top-divider" hidden={view === 'no-menu'} />
        {view === 'no-menu' && ready && (
          <ContractActions
            envelope={envelope}
            requestedAction={requestedAction}
            valid={
              !error &&
              compileStatus === 'output OK' &&
              fieldMap.current?.source === source
            }
            onChange={(next) => {
              if (
                current.current.source !== next.source ||
                current.current.name !== next.name ||
                current.current.contract.id !== next.id
              ) {
                setNotice(
                  'The contract changed while signing. Review the current version and sign again.',
                );
                return;
              }
              setContract({
                id: next.id,
                reference: next.reference,
                parties: next.parties,
                signatures: next.signatures,
              });
            }}
          />
        )}
        <nav aria-label="Application menu" hidden={view === 'no-menu'}>
          <button class="shared-menu-trigger" onClick={openSigning}>
            Sign
          </button>
          <Menu
            label="File"
            items={[
              {
                label: 'New contract',
                action: () => replace(blank, 'untitled-contract'),
              },
              {
                label: 'Import contract…',
                action: () => file.current?.click(),
              },
              { label: 'Export MDX', hint: '.mdx', action: exportFile },
              { label: 'Contracts', children: contractMenu(replace) },
            ]}
          />
          <Menu
            label="View"
            items={(['source', 'both', 'output', 'no-menu'] as View[]).map(
              (v) => ({
                label:
                  v === 'no-menu' ? 'No Menu' : v[0].toUpperCase() + v.slice(1),
                action: () => chooseView(v),
              }),
            )}
          />
          <Menu
            label="Insert"
            items={[
              {
                label: 'Contract components',
                children: [
                  {
                    label: 'Contract',
                    action: () =>
                      insert(
                        '<Contract title="New agreement" network="Kayros" status="Draft">\n  <Field label="Author" value="" placeholder="Your identity" />\n</Contract>',
                      ),
                  },
                  {
                    label: 'Field',
                    action: () =>
                      insert(
                        '<Field label="Purpose" value="" placeholder="Describe the purpose" />',
                      ),
                  },
                  {
                    label: 'Menu',
                    action: () =>
                      insert(
                        '<Menu label="Resources">\n  <MenuItem label="MDX documentation" href="https://mdxjs.com/docs/" />\n</Menu>',
                      ),
                  },
                  {
                    label: 'Tabs',
                    action: () =>
                      insert(
                        '<Tabs label="Contract sections">\n  <Tab label="Parties">\n    <Field label="Author" value="" placeholder="Author identity" />\n  </Tab>\n  <Tab label="Terms">\n    Write the terms here.\n  </Tab>\n</Tabs>',
                      ),
                  },
                  {
                    label: 'Callout',
                    action: () =>
                      insert(
                        '<Callout title="Note">\nAdd a note here.\n</Callout>',
                      ),
                  },
                ],
              },
              {
                label: 'Section heading',
                action: () => insert('## A new section'),
              },
            ]}
          />
          <Menu
            label="Help"
            items={[
              {
                label: 'Writing contracts',
                action: () =>
                  setDialog({
                    title: 'A little guide to Tractate',
                    description:
                      'Use Markdown for headings, lists, tables, links, and code blocks. Add Contract (title, network, status), Field (label, value, placeholder), Callout (title), Menu (label), MenuItem (label, href), Tabs (label), and Tab (label) components with quoted text properties. JavaScript, imports, raw HTML, and images are not supported. Source edits your MDX; Output fields update the same source; Both keeps them side by side. Drafts stay in this browser. Export regularly. Use No Menu for Share, QR, native signing, and signature-gated Kayros hash registration.',
                  }),
              },
            ]}
          />
        </nav>
      </header>
      <main class="main">
        <section class="editor-shell" aria-label="Contract editor">
          {notice && (
            <div class="notice" role="status">
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {updateReady && (
            <div class="notice">
              <span>A new version is ready.</span>
              <button
                onClick={async () => {
                  if (pendingSave.current) {
                    setNotice(
                      'Wait for your draft to save before updating, or export it first.',
                    );
                    return;
                  }
                  await saveQueue.current;
                  registration.current?.waiting?.postMessage('activate');
                }}
              >
                Update app
              </button>
            </div>
          )}
          <div
            class={`workspace view-${view}`}
            ref={workspace}
            style={{ '--source-width': `${ratio}%` }}
          >
            <section
              class="source-pane pane"
              aria-label="Source pane"
              hidden={view === 'output' || view === 'no-menu'}
            >
              {ready ? (
                <SourceEditor
                  source={source}
                  onChange={setSource}
                  onCursor={(line, col) => setCursor([line, col])}
                />
              ) : (
                <div class="loading">Opening your draft…</div>
              )}
              <div class="statusbar input-status" aria-label="Source status">
                <span>
                  Ln {cursor[0]}, Col {cursor[1]}
                </span>
                <span>UTF8</span>
                <span
                  class={`save-state ${saveStatus === 'saved' ? 'saved' : ''}`}
                >
                  <i /> <span aria-live="polite">{saveStatus}</span>
                </span>
                <span class="word-count">
                  {words} w<span class="status-separator">/</span>
                  {source.length.toLocaleString()} c
                </span>
              </div>
            </section>
            <div
              class="splitter"
              hidden={view !== 'both'}
              role="separator"
              aria-label="Resize source and output"
              aria-orientation="vertical"
              aria-valuenow={Math.round(ratio)}
              aria-valuemin={30}
              aria-valuemax={70}
              tabIndex={0}
              onPointerDown={resize}
              onKeyDown={(event) => {
                if (
                  ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  setRatio(
                    event.key === 'Home'
                      ? 30
                      : event.key === 'End'
                        ? 70
                        : Math.max(
                            30,
                            Math.min(
                              70,
                              ratio + (event.key === 'ArrowLeft' ? -2 : 2),
                            ),
                          ),
                  );
                }
              }}
            >
              <span />
            </div>
            <section
              class="output-pane pane"
              aria-label="Output pane"
              hidden={view === 'source'}
            >
              {error && (
                <div class="compile-error" role="alert">
                  <strong>Couldn’t update the output</strong>
                  <span>{error}</span>
                  <small>Showing the last valid output.</small>
                </div>
              )}
              <div class="loading" role="status" hidden={rendered || !!error}>
                Loading output…
              </div>
              <iframe
                key="contract-output"
                ref={frame}
                title="Contract output"
                src={previewUrl}
                onLoad={() => {
                  if (latest.current)
                    frame.current?.contentWindow?.postMessage(
                      { type: 'tractate:render', ...latest.current },
                      '*',
                    );
                }}
                sandbox="allow-scripts allow-popups"
              />
              <div class="statusbar output-status" aria-label="Output status">
                <span aria-live="polite">{compileStatus}</span>
              </div>
            </section>
          </div>
        </section>
      </main>
      <input
        ref={file}
        type="file"
        accept=".mdx,.md,.txt,.json,text/markdown,text/plain,application/json"
        hidden
        onChange={importFile}
      />
      <dialog ref={modal} onClose={() => setDialog(null)}>
        <div class="dialog-heading">
          <button
            aria-label="Close dialog"
            onClick={() => modal.current?.close()}
          >
            ×
          </button>
        </div>
        <h2>{dialog?.title}</h2>
        <p>{dialog?.description}</p>
        <div class="dialog-actions">
          {dialog?.action && (
            <button onClick={exportFile}>Export current draft ↗</button>
          )}
          <button
            class="primary"
            onClick={() => {
              dialog?.action?.();
              modal.current?.close();
            }}
          >
            {dialog?.button || 'Got it'}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function contractMenu(
  open: (source: string, name: string) => void,
): MenuItem[] {
  const root: MenuItem[] = [];
  for (const contract of contracts) {
    const directories = contract.path.split('/').slice(0, -1);
    let items = root;
    for (const directory of directories) {
      let group = items.find(
        (item) => item.label === directory && item.children,
      );
      if (!group) {
        group = { label: directory, children: [] };
        items.push(group);
      }
      items = group.children!;
    }
    items.push({
      label: contract.title,
      action: () => open(contract.source, contract.name),
    });
  }
  return root;
}
