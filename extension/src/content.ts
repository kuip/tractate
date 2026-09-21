import { allowedSite, walletRequest } from './policy';
if (window.top === window && allowedSite(location.href)) {
  const reply = (data: object) =>
    window.postMessage(
      { channel: 'tractate:wallet:response', ...data },
      location.origin,
    );
  window.addEventListener('message', async (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== 'tractate:wallet:request'
    )
      return;
    try {
      const request = walletRequest(event.data);
      reply({ id: request.id, ack: true });
      const result = await chrome.runtime.sendMessage({
        ...request,
        channel: 'tractate:wallet:request',
      });
      if (result?.error) reply({ id: request.id, error: result.error });
    } catch (error) {
      reply({ id: event.data?.id, error: (error as Error).message });
    }
  });
  chrome.runtime.onMessage.addListener(
    (message: any, sender: any, respond: (value: unknown) => void) => {
      if (
        sender.id === chrome.runtime.id &&
        message?.type === 'tractate:open-sign'
      ) {
        window.dispatchEvent(new Event('tractate:open-sign'));
        respond({ opened: true });
        return;
      }
      if (
        sender.id === chrome.runtime.id &&
        message?.channel === 'tractate:wallet:response'
      )
        reply(message);
    },
  );
}
