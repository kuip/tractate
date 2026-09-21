import { readCard, signWithCard, type Card } from './card';
import {
  certificateDetails,
  certificateTrustNotice,
} from '../../packages/contract-kit/src/certificates';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  createKeystore,
  parseKeystore,
  signWithKeystore,
  unlockKeystore,
  type Keystore,
} from './keystore';
import {
  hydrateEnvelope,
  verifiedSigners,
  digest,
  type Envelope,
} from '../../packages/contract-kit/src/envelope';
import {
  reviewContract,
  type Review,
} from '../../packages/contract-kit/src/review';
import { sourceHash } from '../../packages/contract-kit/src/templates';
import { verifySigningProof } from '../../packages/contract-kit/src/proof';
import SigningReview from '../../src/components/SigningReview';
import './wallet.css';
const token = new URLSearchParams(location.search).get('request');
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Wallet() {
  const [wallets, setWallets] = useState<Keystore[]>([]);
  const [selected, setSelected] = useState('');
  const [card, setCard] = useState<Card>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<any>();
  const [envelope, setEnvelope] = useState<Envelope>();
  const [review, setReview] = useState<Review>();
  const [previous, setPrevious] = useState<Review>();
  const [historyReady, setHistoryReady] = useState(false);
  const [approved, setApproved] = useState(false);
  const [proofStatus, setProofStatus] = useState('');
  const historyKey = (id: string, signer: string) =>
    'signed:' + sourceHash(JSON.stringify([id, signer]));
  useEffect(() => {
    (async () => {
      await chrome.storage.local.setAccessLevel({
        accessLevel: 'TRUSTED_CONTEXTS',
      });
      const stored = await chrome.storage.local.get('wallets');
      const list = (stored.wallets || []).map(parseKeystore);
      setWallets(list);
      setSelected(list[0]?.publicKey || '');
      if (token) {
        const result = await chrome.runtime.sendMessage({
          type: 'get-request',
        });
        if (result.error) throw new Error(result.error);
        setPending(result.pending);
        if (result.pending.method === 'sign') {
          const contract = await hydrateEnvelope(result.pending.contract);
          setEnvelope(contract);
          setReview(await reviewContract(contract));
        }
      }
    })().catch((error) => setError(error.message));
  }, []);
  useEffect(() => {
    let disposed = false;
    setApproved(false);
    setPrevious(undefined);
    setHistoryReady(false);
    if (!envelope || !selected) return;
    const id = historyKey(envelope.id, selected);
    chrome.storage.local
      .get(id)
      .then(async (stored: any) => {
        const old = stored[id] as Envelope | undefined;
        if (
          old &&
          (old.id !== envelope.id ||
            !(await verifiedSigners(old)).includes(selected))
        )
          throw new Error('Stored signing history could not be verified.');
        const prior = old ? await reviewContract(old) : undefined;
        if (!disposed) {
          setPrevious(prior);
          setHistoryReady(true);
        }
      })
      .catch((error: Error) => {
        if (!disposed) setError(error.message);
      });
    return () => {
      disposed = true;
    };
  }, [envelope, selected]);
  async function saveWallet(wallet: Keystore) {
    const stored = await chrome.storage.local.get('wallets');
    const list: Keystore[] = (stored.wallets || []).map(parseKeystore);
    if (!list.some((item) => item.publicKey === wallet.publicKey))
      list.push(wallet);
    if (list.length > 20) throw new Error('At most 20 wallets can be stored.');
    await chrome.storage.local.set({ wallets: list });
    setWallets(list);
    setSelected(wallet.publicKey);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  async function finish(result?: unknown, error?: string) {
    const response = await chrome.runtime.sendMessage({
      type: 'finish',
      result,
      error,
    });
    if (response.error) throw new Error(response.error);
    window.close();
  }
  return (
    <main>
      <h1>Tractate wallet</h1>
      {pending && (
        <>
          <p>
            Requested by <strong>{pending.site}</strong>
          </p>
          <p>
            {pending.method === 'connect'
              ? 'Share one public key with this application.'
              : 'Review this exact contract before signing.'}
          </p>
        </>
      )}
      <label>
        Wallet
        <select
          aria-label="Wallet"
          value={selected}
          disabled={busy}
          onChange={(event) => setSelected(event.currentTarget.value)}
        >
          <option value="">Choose a wallet</option>
          {card && (
            <option value={card.publicKey}>eID card: {card.publicKey}</option>
          )}
          {wallets.map((wallet) => (
            <option key={wallet.publicKey} value={wallet.publicKey}>
              {wallet.publicKey}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <label>
            Public key
            <textarea aria-label="Public key" readOnly value={selected} />
          </label>
          {!selected.startsWith('x509:') && (
            <button
              disabled={busy}
              onClick={() =>
                download(
                  'kayros-wallet.json',
                  wallets.find((wallet) => wallet.publicKey === selected),
                )
              }
            >
              Export encrypted wallet backup
            </button>
          )}
        </>
      )}
      <label>
        Wallet password
        <input
          type="password"
          autoComplete="off"
          aria-label="Wallet password"
          value={password}
          disabled={busy}
          onInput={(event) => setPassword(event.currentTarget.value)}
        />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => saveWallet(await createKeystore(password)))
        }
      >
        Create wallet
      </button>
      <label>
        Import encrypted wallet
        <input
          type="file"
          aria-label="Import encrypted wallet"
          accept=".json"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file)
              void run(async () => {
                if (file.size > 4096)
                  throw new Error('Wallet backup is too large.');
                const wallet = parseKeystore(JSON.parse(await file.text()));
                const secret = await unlockKeystore(wallet, password);
                secret.fill(0);
                await saveWallet(wallet);
              });
          }}
        />
      </label>
      <p>
        Use at least 12 characters. Keep an encrypted backup and its password
        separately. The password and private key stay inside this extension.
      </p>
      <section aria-label="eID card">
        <h2>Sign with an eID card</h2>
        <p>
          Estonia (including e-Residency), Finland, Latvia and Lithuania through
          Web eID. Support depends on the installed ID software and card
          generation. Swedish cards are not supported by this bridge.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const next = await readCard(
                pending ? pending.site : 'https://kuip.github.io',
              );
              setCard(next);
              setSelected(next.publicKey);
            })
          }
        >
          Read eID signing card
        </button>
        <p>
          Insert your card into its reader. Enter the signing PIN only in the
          Web eID application; the wallet password above is only for software
          wallets.
        </p>
        <details>
          <summary>Set up the card reader bridge</summary>
          <p>
            Install the official Web eID / ID software first. Then download the
            setup script and run it with Node.js, using this extension ID:
          </p>
          <code>{chrome.runtime.id}</code>
          <p>
            <a
              href="install-card-bridge.mjs"
              download="install-card-bridge.mjs"
            >
              Download bridge setup
            </a>
          </p>
          <pre>{`node install-card-bridge.mjs ${chrome.runtime.id}`}</pre>
          <p>
            The setup registers the installed Web eID application for this
            extension only. It supports Chrome on macOS, Linux and Windows. No
            keys or PINs are copied.
          </p>
        </details>
        {card && selected === card.publicKey && (
          <>
            <p>
              Certificate subject (unverified):{' '}
              {certificateDetails(card.certificate).subject}
            </p>
            <p>Expires: {certificateDetails(card.certificate).notAfter}</p>
            <p>{certificateTrustNotice}</p>
            <p>
              Signing shares this certificate, which can contain your name and
              personal identifier, with the contract parties.
            </p>
          </>
        )}
      </section>
      {review && <SigningReview review={review} previous={previous} />}
      {envelope && (
        <details>
          <summary>Exact document and terms</summary>
          <pre>{envelope.source}</pre>
        </details>
      )}
      {pending?.method === 'sign' && (
        <>
          <label>
            <input
              type="checkbox"
              checked={approved}
              disabled={!historyReady || busy}
              onChange={(event) => setApproved(event.currentTarget.checked)}
            />
            I reviewed all fields, terms, parties, and changes.
          </label>
          <button
            disabled={
              busy ||
              !approved ||
              !envelope ||
              !historyReady ||
              !envelope.parties.includes(selected)
            }
            onClick={() =>
              void run(async () => {
                if (!envelope || !approved)
                  throw new Error('Review the contract first.');
                const request = await chrome.runtime.sendMessage({
                  type: 'get-request',
                });
                if (request.error) throw new Error(request.error);
                const latest = await hydrateEnvelope(request.pending.contract);
                if (digest(latest) !== digest(envelope))
                  throw new Error('The request changed.');
                const wallet = wallets.find(
                  (item) => item.publicKey === selected,
                );
                if (!wallet && card?.publicKey !== selected)
                  throw new Error('Choose a wallet or read your card.');
                const signature =
                  card?.publicKey === selected
                    ? await signWithCard(envelope, card, request.pending.site)
                    : await signWithKeystore(envelope, wallet!, password);
                const signed = {
                  ...envelope,
                  signatures: [...envelope.signatures, signature],
                };
                await chrome.storage.local.set({
                  [historyKey(envelope.id, selected)]: signed,
                });
                await finish(signature);
              })
            }
          >
            Approve signature
          </button>
        </>
      )}
      {pending?.method === 'connect' && (
        <button
          disabled={busy || !selected}
          onClick={() => void run(() => finish(selected))}
        >
          Share public key
        </button>
      )}
      {pending && (
        <button
          disabled={busy}
          onClick={() =>
            void run(() => finish(undefined, 'Wallet request rejected.'))
          }
        >
          Reject request
        </button>
      )}
      {!token && (
        <section>
          <h2>Verify signing proof</h2>
          <p>
            Check a final proof independently of the editor. Public keys
            identify signers; confirm who owns each key separately.
          </p>
          <input
            type="file"
            aria-label="Verify signing proof"
            accept=".json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              setProofStatus('');
              if (file)
                void run(async () => {
                  if (file.size > 600000)
                    throw new Error('Proof is too large.');
                  const result = await verifySigningProof(
                    JSON.parse(await file.text()),
                  );
                  setEnvelope(result.envelope);
                  setReview(await reviewContract(result.envelope));
                  setProofStatus(
                    `All ${result.signed.length} required signatures verified. Package hash: ${result.packageHash}. This proves signing, not Kayros inclusion. Identity and certificate trust are not verified.`,
                  );
                });
            }}
          />
          <p role="status">{proofStatus}</p>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
render(<Wallet />, document.getElementById('wallet')!);
