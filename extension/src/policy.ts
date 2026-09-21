export function allowedSite(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.origin === 'https://kuip.github.io' &&
        url.pathname.startsWith('/tractate/')) ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname) &&
        url.port === '4321')
    );
  } catch {
    return false;
  }
}
export function walletRequest(message: any) {
  if (
    !message ||
    message.channel !== 'tractate:wallet:request' ||
    typeof message.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(message.id) ||
    !['connect', 'sign'].includes(message.method)
  )
    throw new Error('Invalid wallet request.');
  if (JSON.stringify(message).length > 600000)
    throw new Error('Wallet request is too large.');
  if (
    message.method === 'sign' &&
    (!message.contract ||
      message.contract.version !== 2 ||
      'source' in message.contract)
  )
    throw new Error('Signing requires a reference-only contract package.');
  return {
    id: message.id as string,
    method: message.method as 'connect' | 'sign',
    contract: message.method === 'sign' ? message.contract : undefined,
  };
}
