import type { Attestation } from './envelope.js';
export type WalletMethod = 'connect' | 'sign';
export function requestWallet(method: 'connect'): Promise<string>;
export function requestWallet(
  method: 'sign',
  contract: unknown,
): Promise<Attestation>;
export function requestWallet(
  method: WalletMethod,
  contract?: unknown,
): Promise<any> {
  if (typeof window === 'undefined' || window.top !== window)
    return Promise.reject(
      new Error('Wallet requests must come from the main application.'),
    );
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', receive);
      clearTimeout(timeout);
      clearTimeout(discovery);
    };
    const discovery = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Install and enable the Tractate Chrome wallet extension, then reload this page.',
        ),
      );
    }, 2000);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Wallet request expired. Open Sign again to retry.'));
    }, 300000);
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== 'tractate:wallet:response' ||
        event.data.id !== id
      )
        return;
      if (event.data.ack === true) {
        clearTimeout(discovery);
        return;
      }
      cleanup();
      if (event.data.error) reject(new Error(String(event.data.error)));
      else resolve(event.data.result);
    };
    window.addEventListener('message', receive);
    window.postMessage(
      { channel: 'tractate:wallet:request', id, method, contract },
      location.origin,
    );
  });
}
