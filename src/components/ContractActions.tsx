import { kayrosEndpoint, registerContract } from '../lib/kayros';
import { useEffect, useRef, useState } from 'preact/hooks';
import { requestWallet } from '../../packages/contract-kit/src/bridge';
import { createSigningProof } from '../../packages/contract-kit/src/proof';
import {
  reviewContract,
  type Review,
} from '../../packages/contract-kit/src/review';
import SigningReview from './SigningReview';
import QRCode from 'qrcode';
import Menu from './Menu';
import {
  canRegister,
  digest,
  parseParties,
  prepareEnvelope,
  portableEnvelope,
  shareUrl,
  verifiedSigners,
  type Envelope,
} from '../lib/envelope';

export default function ContractActions({
  envelope: draft,
  onChange,
  valid,
  requestedAction = 0,
}: {
  envelope: Envelope;
  onChange: (envelope: Envelope) => void;
  valid: boolean;
  requestedAction?: number;
}) {
  const [panel, setPanel] = useState<
    'share' | 'qr' | 'sign' | 'register' | null
  >(null);
  const [binding, setBinding] = useState<{
    source: string;
    reference: string;
  }>();
  const [bindingError, setBindingError] = useState('');
  const ready =
    binding?.source === draft.source &&
    (!draft.reference || draft.reference === binding.reference);
  const envelope = ready ? { ...draft, reference: binding!.reference } : draft;
  useEffect(() => {
    let disposed = false;
    setBindingError('');
    prepareEnvelope(draft)
      .then((prepared) => {
        if (!disposed)
          setBinding({ source: draft.source, reference: prepared.reference! });
      })
      .catch((err) => {
        if (!disposed) {
          setBinding(undefined);
          setBindingError(err.message);
        }
      });
    return () => {
      disposed = true;
    };
  }, [draft.source, draft.reference]);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [parties, setParties] = useState('');
  const [dataType, setDataType] = useState(
    import.meta.env.PUBLIC_KAYROS_DATA_TYPE || 'tractate_v1',
  );
  const [userKey, setUserKey] = useState('');
  const [receipt, setReceipt] = useState<{
    hash: string;
    timeuuid: string;
  } | null>(null);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [review, setReview] = useState<Review>();
  useEffect(() => {
    let disposed = false;
    reviewContract(envelope)
      .then((value) => {
        if (!disposed) setReview(value);
      })
      .catch(() => {
        if (!disposed) setReview(undefined);
      });
    return () => {
      disposed = true;
    };
  }, [
    envelope.source,
    envelope.reference,
    envelope.name,
    envelope.id,
    envelope.parties,
  ]);
  useEffect(() => {
    if (requestedAction) void open('sign');
  }, [requestedAction]);
  const modal = useRef<HTMLDialogElement>(null);
  const latest = useRef(envelope);
  latest.current = envelope;
  const verified = verifiedSigners(envelope);
  const complete = valid && ready && canRegister(envelope);
  let partyError = '';
  let partiesChanged = false;
  try {
    partiesChanged =
      parseParties(parties).join('\n') !== envelope.parties.join('\n');
  } catch (err) {
    partyError = (err as Error).message;
  }
  const signingBlocked = !valid
    ? 'Fix the source errors before signing.'
    : !ready
      ? bindingError || 'Checking the approved template…'
      : !selectedWallet
        ? 'Connect Chrome wallet first, then add your public key to the required parties.'
        : partyError ||
          (partiesChanged
            ? 'Click Set parties to apply your edited party list.'
            : !envelope.parties.includes(selectedWallet)
              ? 'Add your key to the required parties before signing.'
              : '');
  const proofBlocked = !valid
    ? 'Fix the source errors before downloading a proof.'
    : !ready
      ? bindingError || 'Checking the approved template…'
      : !envelope.parties.length
        ? 'Set the required parties, then collect their signatures to download a proof.'
        : !complete
          ? `Awaiting ${envelope.parties.length - verified.length} of ${envelope.parties.length} required signatures for this version.`
          : '';
  useEffect(() => {
    if (!panel) return;
    modal.current?.showModal();
  }, [panel]);
  const open = async (next: 'share' | 'qr' | 'sign' | 'register') => {
    setError('');
    setLink('');
    setQr('');
    setReceipt(null);
    setParties(envelope.parties.join('\n'));
    setPanel(next);
    if (next === 'share' || next === 'qr') {
      try {
        const url = await shareUrl(envelope, location.href);
        setLink(url);
        if (next === 'qr') {
          try {
            setQr(
              await QRCode.toDataURL(url, {
                errorCorrectionLevel: 'M',
                margin: 4,
                width: 640,
              }),
            );
          } catch {
            setError(
              'This complete contract is too large for one QR code. Use Share or download the package instead.',
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };
  const download = async () => {
    try {
      const portable = await portableEnvelope(latest.current, true);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(portable, null, 2)], {
          type: 'application/json',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${envelope.name.replace(/[^a-z0-9_-]/gi, '-')}.tractate.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const sign = async () => {
    if (signingBlocked) {
      setError(signingBlocked);
      return;
    }
    setProgress(
      'Checking the contract, then opening the Chrome wallet for approval…',
    );
    setBusy(true);
    setError('');
    try {
      const before = digest(latest.current);
      const snapshot = await prepareEnvelope(latest.current, true);
      if (digest(latest.current) !== before)
        throw new Error('The contract changed. Review and sign again.');
      if (!valid || !snapshot.parties.length)
        throw new Error(
          'Set the required parties and fix any source errors before signing.',
        );
      if (!selectedWallet) throw new Error('Connect the Chrome wallet first.');
      const hash = digest(snapshot);
      const attestation = await requestWallet(
        'sign',
        await portableEnvelope(snapshot, true),
      );
      if (attestation.signer !== selectedWallet)
        throw new Error(
          'The extension signed with a different wallet. Connect that key before retrying.',
        );
      if (digest(latest.current) !== hash)
        throw new Error(
          'The contract changed while signing. Review and sign again.',
        );
      const signed = {
        ...snapshot,
        signatures: [
          ...snapshot.signatures.filter(
            (record) =>
              !(record.digest === hash && record.signer === selectedWallet),
          ),
          attestation,
        ],
      };
      if (!verifiedSigners(signed).includes(selectedWallet))
        throw new Error('The signature could not be verified.');
      onChange(signed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    setProgress('Approve the connection in the Chrome wallet window…');
    setBusy(true);
    setError('');
    try {
      const key = await requestWallet('connect');
      const normalized = parseParties(key);
      if (normalized.length !== 1 || normalized[0] !== key)
        throw new Error('Invalid wallet public key.');
      setSelectedWallet(key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const downloadProof = async () => {
    if (proofBlocked) {
      setError(proofBlocked);
      return;
    }
    setBusy(true);
    setError('');
    setProgress('Verifying signatures and preparing the proof…');
    try {
      const proof = await createSigningProof(latest.current);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(proof, null, 2)], {
          type: 'application/json',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = envelope.name + '.proof.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportLegacy = () => {
    try {
      const wallets = JSON.parse(
        localStorage.getItem('tractate:native-wallets:v1') || '[]',
      );
      if (!Array.isArray(wallets) || !wallets.length)
        throw new Error('No legacy browser wallets were found.');
      for (const wallet of wallets) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(wallet)], { type: 'application/json' }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download =
          'legacy-kayros-wallet-' +
          String(wallet.publicKey).slice(8, 20) +
          '.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <nav aria-label="Contract actions" class="contract-actions">
        <Menu
          label="Send"
          items={[
            { label: 'by Share', action: () => void open('share') },
            { label: 'by QR', action: () => void open('qr') },
          ]}
        />
        <button class="shared-menu-trigger" onClick={() => void open('sign')}>
          Sign
        </button>
        <button
          class="shared-menu-trigger"
          disabled={!complete}
          title={
            complete
              ? 'All parties signed this version'
              : 'All required parties must sign this version'
          }
          onClick={() => void open('register')}
        >
          Register
        </button>
      </nav>
      <dialog
        ref={modal}
        class="contract-action-dialog"
        onClose={() => {
          setPanel(null);
          setUserKey('');
        }}
      >
        <button
          class="action-close"
          aria-label="Close contract action"
          onClick={() => modal.current?.close()}
        >
          ×
        </button>
        <h2>
          {panel === 'qr'
            ? 'Send by QR'
            : panel === 'share'
              ? 'Share contract'
              : panel === 'sign'
                ? 'Sign contract'
                : 'Register contract'}
        </h2>
        {(panel === 'share' || panel === 'qr') && (
          <>
            <p>
              The package includes an approved GitHub template reference,
              current field values, parties, and any signatures. Source is
              fetched from GitHub. Anyone with this link can read the values.
            </p>
            {qr && (
              <img
                class="share-qr"
                src={qr}
                alt="QR code for the complete contract snapshot"
              />
            )}
            {link && (
              <>
                <label>
                  Contract link
                  <textarea aria-label="Contract link" readOnly value={link} />
                </label>
                <div class="dialog-actions">
                  <button
                    onClick={async () => {
                      try {
                        if (!navigator.clipboard)
                          throw new Error(
                            'Select and copy the link above. Clipboard access requires HTTPS or localhost.',
                          );
                        await navigator.clipboard.writeText(link);
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : String(err),
                        );
                      }
                    }}
                  >
                    Copy link
                  </button>
                  {typeof navigator.share === 'function' && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.share({
                            title: envelope.name,
                            url: link,
                          });
                        } catch (err) {
                          if ((err as Error).name !== 'AbortError')
                            setError(String(err));
                        }
                      }}
                    >
                      Share…
                    </button>
                  )}
                </div>
              </>
            )}
            <button onClick={download}>Download contract package</button>
          </>
        )}
        {panel === 'sign' && (
          <>
            <p>
              Each required party signs the approved template reference,
              document hash, and party list with a native Ed25519 key. No other
              blockchain is involved.
            </p>
            <p>
              {ready
                ? 'Approved template: ' + envelope.reference
                : bindingError || 'Checking approved GitHub template…'}
            </p>
            <label>
              Required party public keys
              <textarea
                aria-label="Required party public keys"
                value={parties}
                onInput={(event) => setParties(event.currentTarget.value)}
                placeholder="One ed25519: public key per party"
              />
            </label>
            <button
              disabled={busy}
              onClick={() => {
                try {
                  const required = parseParties(parties);
                  if (!required.length)
                    throw new Error('Add at least one required party.');
                  onChange({ ...envelope, parties: required });
                  setParties(required.join('\n'));
                  setError('');
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              Set parties
            </button>
            <p>
              {verified.length}/{envelope.parties.length} parties signed this
              version.
            </p>
            <ul>
              {envelope.parties.map((party) => (
                <li class="party-address">
                  {party} —{' '}
                  {verified.includes(party) ? 'signed' : 'awaiting signature'}
                </li>
              ))}
            </ul>
            <hr />
            <h3>Chrome wallet</h3>
            <a
              href={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}downloads/tractate-wallet.zip`}
              download
            >
              Download Chrome extension
            </a>
            <p>
              Open the Tractate wallet extension to create or import a wallet.
              Approval and passwords stay in its own window.
            </p>
            <button disabled={busy} onClick={() => void connect()}>
              Connect Chrome wallet
            </button>
            {selectedWallet && (
              <>
                <label>
                  My public key
                  <textarea
                    readOnly
                    aria-label="My public key"
                    value={selectedWallet}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() => {
                    try {
                      const required = parseParties(
                        parties + '\n' + selectedWallet,
                      );
                      onChange({ ...envelope, parties: required });
                      setParties(required.join('\n'));
                      setError('');
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Add my key to parties
                </button>
              </>
            )}
            <details>
              <summary>Move an existing browser wallet</summary>
              <p>
                Export its encrypted backup here, then import that file in the
                extension. Browser signing has been removed. Existing backups
                remain compatible.
              </p>
              <button onClick={exportLegacy}>
                Export legacy encrypted wallets
              </button>
            </details>
            {review && <SigningReview review={review} />}
            <p>
              The extension shows changes against its own verified signing
              history before approval.
            </p>
            <details>
              <summary>Review exact signed document</summary>
              <pre class="signing-source">{envelope.source}</pre>
              <p>Contract fingerprint: {digest(envelope)}</p>
            </details>
            <button
              disabled={busy || !!signingBlocked}
              aria-describedby="signing-requirement"
              onClick={() => void sign()}
            >
              Review in Chrome wallet
            </button>
            <p id="signing-requirement" role="status">
              {busy
                ? progress
                : signingBlocked ||
                  'Ready to review and sign in the Chrome wallet.'}
            </p>
            <button
              disabled={!!proofBlocked || busy}
              aria-describedby="proof-requirement"
              onClick={() => void downloadProof()}
            >
              Download signing proof
            </button>
            <p id="proof-requirement">
              {proofBlocked ||
                'All required signatures verified. The proof is ready to download.'}
            </p>
            <p>
              Share the final proof with every party. It can be verified in the
              extension or with the public library independently of this editor.
            </p>
            <p>
              Changing the contract or required parties invalidates prior
              signatures for registration.
            </p>
          </>
        )}
        {panel === 'register' && (
          <>
            <p>
              Register the SHA-256 hash of this fully signed package on Kayros.
              Keep the package: the hash alone cannot restore the contract or
              its signatures.
            </p>
            <p>Endpoint: {kayrosEndpoint}</p>
            <label>
              Kayros data type
              <input
                aria-label="Kayros data type"
                value={dataType}
                onInput={(event) => setDataType(event.currentTarget.value)}
              />
            </label>
            <p>
              The data type must already be provisioned on Kayros for 32-byte
              items. The suggested name is tractate_v1.
            </p>
            <label>
              Kayros API key
              <input
                type="password"
                autoComplete="off"
                aria-label="Kayros API key"
                value={userKey}
                onInput={(event) => setUserKey(event.currentTarget.value)}
              />
            </label>
            <p>
              The API key is kept only for this open dialog and is never
              included in sharing.
            </p>
            <button
              disabled={!complete || busy || !!receipt}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  if (!valid)
                    throw new Error('Fix the source before registration.');
                  setReceipt(
                    await registerContract(latest.current, dataType, userKey),
                  );
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Submit to Kayros
            </button>
            {receipt && (
              <p role="status">
                Kayros accepted the hash. Record: {receipt.timeuuid}. Hash:{' '}
                {receipt.hash}
              </p>
            )}
            <button onClick={download}>Download signed package</button>
            <button disabled={!complete} onClick={() => void downloadProof()}>
              Download signing proof
            </button>
            <p id="proof-requirement">
              {proofBlocked ||
                'All required signatures verified. The proof is ready to download.'}
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
