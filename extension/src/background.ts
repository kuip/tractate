import { allowedSite, walletRequest } from './policy';
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
let queue = Promise.resolve();
async function finish(pending: any, result?: unknown, error?: string) {
  await chrome.storage.session.remove('pending');
  try {
    await chrome.tabs.sendMessage(
      pending.tabId,
      { channel: 'tractate:wallet:response', id: pending.id, result, error },
      { documentId: pending.documentId },
    );
  } catch {
    /* The requesting document may have navigated away. */
  }
}
async function handle(message: any, sender: any) {
  await storageReady;
  if (sender.id !== chrome.runtime.id)
    throw new Error('Untrusted extension sender.');
  const { pending } = await chrome.storage.session.get('pending');
  if (sender.url?.startsWith(chrome.runtime.getURL('wallet.html'))) {
    const url = new URL(sender.url);
    if (url.pathname !== '/wallet.html')
      throw new Error('Unknown extension page.');
    const token = url.searchParams.get('request');
    if (!pending || pending.token !== token || pending.expires < Date.now())
      throw new Error('This request expired or was already handled.');
    if (message.type === 'get-request') return { pending };
    if (message.type === 'finish') {
      await finish(pending, message.result, message.error);
      return { ok: true };
    }
    throw new Error('Unknown wallet operation.');
  }
  if (
    !sender.tab ||
    sender.frameId !== 0 ||
    !sender.documentId ||
    !allowedSite(sender.url || '') ||
    sender.origin !== new URL(sender.url).origin
  )
    throw new Error('This site cannot request wallet access.');
  const request = walletRequest(message);
  if (pending && pending.expires > Date.now())
    throw new Error('Review or reject the pending wallet request first.');
  if (pending) await finish(pending, undefined, 'Wallet request expired.');
  const next = {
    ...request,
    token: crypto.randomUUID(),
    tabId: sender.tab.id,
    documentId: sender.documentId,
    site: new URL(sender.url).origin + new URL(sender.url).pathname,
    expires: Date.now() + 300000,
  };
  await chrome.storage.session.set({ pending: next });
  try {
    const popup = await chrome.windows.create({
      url: chrome.runtime.getURL('wallet.html?request=' + next.token),
      type: 'popup',
      width: 680,
      height: 850,
    });
    await chrome.storage.session.set({
      pending: { ...next, windowId: popup.id },
    });
  } catch (error) {
    await finish(next, undefined, 'Could not open wallet review.');
    throw error;
  }
  return { accepted: true };
}
chrome.runtime.onMessage.addListener(
  (message: any, sender: any, respond: (value: unknown) => void) => {
    queue = queue.then(async () => {
      try {
        respond(await handle(message, sender));
      } catch (error) {
        respond({ error: (error as Error).message });
      }
    });
    return true;
  },
);
chrome.windows.onRemoved.addListener((id: number) => {
  queue = queue
    .then(async () => {
      const { pending } = await chrome.storage.session.get('pending');
      if (pending?.windowId === id)
        await finish(pending, undefined, 'Wallet request rejected.');
    })
    .catch(() => {});
});
