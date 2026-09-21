import { useEffect, useState } from 'preact/hooks';
import { verifyPackage } from './proof.js';
// Declarative capabilities only. Contracts cannot supply a signing payload.
export function ContractSign({
  label = 'Review and sign',
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        parent.postMessage({ type: 'tractate:action', action: 'sign' }, '*')
      }
    >
      {label}
    </button>
  );
}
export function ContractProof() {
  const [status, setStatus] = useState('Checking signatures…');
  useEffect(() => {
    let revision = 0;
    const receive = (event: MessageEvent) => {
      if (event.source !== parent || event.data?.type !== 'tractate:proof')
        return;
      const current = ++revision;
      setStatus('Checking signatures…');
      if (!event.data.contract) {
        setStatus('Signature proof unavailable for this document.');
        return;
      }
      verifyPackage(event.data.contract)
        .then((result) => {
          if (current === revision)
            setStatus(
              `${result.signed.length}/${result.envelope.parties.length} parties signed this version. ${result.complete ? 'All signatures verified.' : 'Awaiting signatures.'}`,
            );
        })
        .catch(() => {
          if (current === revision)
            setStatus('Signature proof could not be verified.');
        });
    };
    window.addEventListener('message', receive);
    parent.postMessage({ type: 'tractate:proof-request' }, '*');
    return () => {
      revision++;
      window.removeEventListener('message', receive);
    };
  }, []);
  return <output aria-label="Signature proof">{status}</output>;
}
