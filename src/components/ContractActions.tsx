import { kayrosEndpoint, registerContract } from '../lib/kayros';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  createKeystore,
  parseKeystore,
  readWallets,
  signWithKeystore,
  storeWallet,
  unlockKeystore,
  type Keystore,
} from '../lib/native-wallet';
import QRCode from 'qrcode';
import Menu from './Menu';
import {
  canRegister,
  digest,
  parseParties,
  shareUrl,
  verifiedSigners,
  type Envelope,
} from '../lib/envelope';

export default function ContractActions({
  envelope,
  onChange,
  valid,
}: {
  envelope: Envelope;
  onChange: (envelope: Envelope) => void;
  valid: boolean;
}) {
  const [panel, setPanel] = useState<
    'share' | 'qr' | 'sign' | 'register' | null
  >(null);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState('');
  const [dataType, setDataType] = useState(
    import.meta.env.PUBLIC_KAYROS_DATA_TYPE || 'tractate_v1',
  );
  const [userKey, setUserKey] = useState('');
  const [receipt, setReceipt] = useState<{
    hash: string;
    timeuuid: string;
  } | null>(null);
  const [wallets, setWallets] = useState<Keystore[]>([]);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [password, setPassword] = useState('');
  const walletFile = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const latest = useRef(envelope);
  latest.current = envelope;
  const verified = verifiedSigners(envelope);
  const complete = valid && canRegister(envelope);
  useEffect(() => {
    if (!panel) return;
    modal.current?.showModal();
  }, [panel]);
  useEffect(() => {
    if (panel !== 'sign') return;
    try {
      const stored = readWallets();
      setWallets(stored);
      setSelectedWallet((selected) => selected || stored[0]?.publicKey || '');
    } catch (err) {
      setError((err as Error).message);
    }
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
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(latest.current, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${envelope.name.replace(/[^a-z0-9_-]/gi, '-')}.tractate.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sign = async () => {
    setBusy(true);
    setError('');
    const snapshot = latest.current;
    try {
      if (!valid || !snapshot.parties.length)
        throw new Error(
          'Set the required parties and fix any source errors before signing.',
        );
      const wallet = wallets.find((item) => item.publicKey === selectedWallet);
      if (!wallet) throw new Error('Create or import a native wallet first.');
      const hash = digest(snapshot);
      const attestation = await signWithKeystore(snapshot, wallet, password);
      if (digest(latest.current) !== hash)
        throw new Error(
          'The contract changed while signing. Review and sign again.',
        );
      const signed = {
        ...snapshot,
        signatures: [
          ...snapshot.signatures.filter(
            (record) =>
              !(record.digest === hash && record.signer === wallet.publicKey),
          ),
          attestation,
        ],
      };
      if (!verifiedSigners(signed).includes(wallet.publicKey))
        throw new Error('The signature could not be verified.');
      onChange(signed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setPassword('');
    }
  };
  const downloadWallet = () => {
    const wallet = wallets.find((item) => item.publicKey === selectedWallet);
    if (!wallet) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(wallet, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kayros-wallet-${wallet.publicKey.slice(8, 20)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          setPassword('');
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
              The complete snapshot includes the source, current field values,
              parties, and any signatures. Anyone with this link can read it.
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
              Each required party signs the exact source, field values, and
              party list with a native Ed25519 key. No other blockchain is
              involved.
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
            <h3>Native wallet</h3>
            <label>
              Wallet
              <select
                aria-label="Native wallet"
                value={selectedWallet}
                onChange={(event) =>
                  setSelectedWallet(event.currentTarget.value)
                }
              >
                <option value="">Choose a wallet</option>
                {wallets.map((wallet) => (
                  <option value={wallet.publicKey}>{wallet.publicKey}</option>
                ))}
              </select>
            </label>
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
                      setParties(
                        parseParties(
                          parties +
                            '\n' +
                            (parties.includes(selectedWallet)
                              ? ''
                              : selectedWallet),
                        ).join('\n'),
                      );
                      setError('');
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Add my key to parties
                </button>
                <button onClick={downloadWallet}>
                  Export encrypted wallet backup
                </button>
              </>
            )}
            <label>
              Wallet password
              <input
                type="password"
                autoComplete="off"
                aria-label="Wallet password"
                value={password}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const wallet = await createKeystore(password);
                  setWallets(storeWallet(wallet));
                  setSelectedWallet(wallet.publicKey);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                  setPassword('');
                }
              }}
            >
              Create native wallet
            </button>
            <button disabled={busy} onClick={() => walletFile.current?.click()}>
              Import encrypted wallet
            </button>
            <input
              ref={walletFile}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  if (file.size > 4096)
                    throw new Error('Wallet backup is too large.');
                  const wallet = parseKeystore(JSON.parse(await file.text()));
                  const secret = await unlockKeystore(wallet, password);
                  secret.fill(0);
                  setWallets(storeWallet(wallet));
                  setSelectedWallet(wallet.publicKey);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                  setPassword('');
                }
              }}
            />
            <p>
              Use at least 12 characters for a new password. Export the
              encrypted backup and keep its password separately: clearing
              browser storage can remove this wallet. Passwords cannot be
              recovered.
            </p>
            <details>
              <summary>Review exact signed document</summary>
              <pre class="signing-source">{envelope.source}</pre>
              <p>Contract fingerprint: {digest(envelope)}</p>
            </details>
            <button
              disabled={
                busy ||
                !valid ||
                !selectedWallet ||
                !envelope.parties.includes(selectedWallet) ||
                parties !== envelope.parties.join('\n')
              }
              onClick={() => void sign()}
            >
              Sign with native wallet
            </button>
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
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
