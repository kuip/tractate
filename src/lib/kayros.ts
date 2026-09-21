import { signedPackageHash } from '../../packages/contract-kit/src/proof';
import { canRegister, prepareEnvelope, type Envelope } from './envelope';
export const kayrosEndpoint = 'https://kayros.provable.dev/api/lightnet/hash';
export async function registrationPayload(
  envelope: Envelope,
  dataType: string,
) {
  if (!(await canRegister(envelope)))
    throw new Error(
      'All required parties must sign this exact version before registration.',
    );
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(dataType))
    throw new Error(
      'Enter a Kayros data type of 1–32 ASCII letters, digits, underscores, or hyphens.',
    );
  return { data_type: dataType, data_item: await signedPackageHash(envelope) };
}
export async function registerContract(
  envelope: Envelope,
  dataType: string,
  userKey: string,
) {
  const body = await registrationPayload(
    await prepareEnvelope(envelope, true),
    dataType,
  );
  const response = await fetch(kayrosEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userKey ? { 'X-User-Key': userKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (
    !response.ok ||
    result.success !== true ||
    typeof result.hash !== 'string' ||
    typeof result.timeuuid !== 'string'
  )
    throw new Error(
      result.error || `Kayros registration failed (${response.status}).`,
    );
  return {
    hash: result.hash as string,
    timeuuid: result.timeuuid as string,
    dataType,
    dataItem: body.data_item,
  };
}
