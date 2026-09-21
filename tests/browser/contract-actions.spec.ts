import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { templates, mockTemplates } from '../template-fixtures';
import {
  fromShareUrl,
  canRegister,
  nativeParty,
  signPackage,
} from '../../src/lib/envelope';
import { verifySigningProof } from '../../packages/contract-kit/src/proof';
import { registrationPayload } from '../../src/lib/kayros';
mockTemplates();
test('extension bridge signatures survive sharing and reload; proof and registration verify', async ({
  page,
}) => {
  const alice = new Uint8Array(32).fill(17),
    bob = new Uint8Array(32).fill(34);
  let selected = alice;
  await page.route(
    'https://raw.githubusercontent.com/kuip/tractate/**',
    (route) =>
      route.fulfill({
        body: templates[route.request().url()],
        contentType: 'text/plain',
      }),
  );
  await page.exposeFunction('testWallet', async (request: any) =>
    request.method === 'connect'
      ? nativeParty(selected)
      : signPackage(request.contract, selected),
  );
  await page.addInitScript(() => {
    window.addEventListener('message', async (event) => {
      if (
        event.source !== window ||
        event.data?.channel !== 'tractate:wallet:request'
      )
        return;
      const reply = { channel: 'tractate:wallet:response', id: event.data.id };
      window.postMessage({ ...reply, ack: true }, location.origin);
      try {
        const result = await (window as any).testWallet(event.data);
        window.postMessage({ ...reply, result }, location.origin);
      } catch (error) {
        window.postMessage({ ...reply, error: String(error) }, location.origin);
      }
    });
  });
  const submissions: unknown[] = [];
  await page.route('https://kayros.provable.dev/api/lightnet/hash', (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        success: true,
        hash: 'test-record-hash',
        timeuuid: 'test-record-id',
      },
    });
  });
  await page.goto('/');
  await page
    .frameLocator('iframe')
    .getByRole('textbox', { name: 'Author', exact: true })
    .fill('Alice and Bob');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'No Menu', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.getByLabel('Wallet password', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('#signing-requirement')).toContainText(
    'Connect Chrome wallet first',
  );
  await expect(
    page.getByRole('button', { name: 'Download signing proof', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('#proof-requirement')).toContainText(
    'Set the required parties',
  );
  await page
    .getByRole('button', { name: 'Connect Chrome wallet', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'My public key' }),
  ).toHaveValue(nativeParty(alice));
  await page
    .getByRole('button', { name: 'Add my key to parties', exact: true })
    .click();
  await expect(
    page.getByText('0/1 parties signed this version.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review in Chrome wallet', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('textbox', { name: 'Required party public keys' })
    .fill(`${nativeParty(alice)}\n${nativeParty(bob)}`);
  await expect(page.locator('#signing-requirement')).toContainText(
    'Click Set parties',
  );
  await page.getByRole('button', { name: 'Set parties', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Required party public keys' })
    .fill(`  ${nativeParty(bob)}\n${nativeParty(alice)}\n`);

  await page
    .getByRole('button', { name: 'Review in Chrome wallet', exact: true })
    .click();
  await expect(
    page.getByText('1/2 parties signed this version.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('menuitem', { name: 'by QR', exact: true }).click();
  await expect(
    page.getByRole('img', {
      name: 'QR code for the complete contract snapshot',
    }),
  ).toBeVisible();
  const url = await page
    .getByRole('textbox', { name: 'Contract link' })
    .inputValue();
  const shared = await fromShareUrl(new URL(url).hash);
  expect(shared.source).toContain('value="Alice and Bob"');
  expect(shared.signatures).toHaveLength(1);
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download contract package', exact: true })
    .click();
  const wire = JSON.parse(
    await readFile((await (await downloaded).path())!, 'utf8'),
  );
  expect(wire).not.toHaveProperty('source');
  expect(wire.values['0']).toBe('Alice and Bob');
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await page.goto(url);
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('textbox', { name: 'Author', exact: true }),
  ).toHaveValue('Alice and Bob');
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  selected = bob;
  await page
    .getByRole('button', { name: 'Connect Chrome wallet', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'My public key' }),
  ).toHaveValue(nativeParty(bob));
  await page
    .getByRole('button', { name: 'Review in Chrome wallet', exact: true })
    .click();
  await expect(
    page.getByText('2/2 parties signed this version.'),
  ).toBeVisible();
  const proofDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download signing proof', exact: true })
    .click();
  const proof = JSON.parse(
    await readFile((await (await proofDownload).path())!, 'utf8'),
  );
  const result = await verifySigningProof(proof);
  expect(canRegister(result.envelope)).toBe(true);
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          const request = indexedDB.open('tractate', 1);
          request.onsuccess = () => {
            const db = request.result;
            const read = db
              .transaction('drafts')
              .objectStore('drafts')
              .get(
                `shared:${new URLSearchParams(location.search).get('draft')}`,
              );
            read.onsuccess = () => {
              resolve(read.result?.contract?.signatures?.length || 0);
              db.close();
            };
          };
        });
      }),
    )
    .toBe(2);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeEnabled();
  expect(submissions).toHaveLength(0);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page
    .getByRole('button', { name: 'Submit to Kayros', exact: true })
    .click();
  await expect(page.getByText(/Kayros accepted the hash/)).toBeVisible();
  expect(submissions).toEqual([
    registrationPayload(result.envelope, 'tractate_v1'),
  ]);
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await page
    .frameLocator('iframe')
    .getByRole('textbox', { name: 'Author', exact: true })
    .fill('Changed after signing');
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeDisabled();
});

test('MDX capability imports display proof and open a review including inactive-tab fields', async ({
  page,
}) => {
  await page.route(
    'https://raw.githubusercontent.com/kuip/tractate/**',
    (route) =>
      route.fulfill({
        body: templates[route.request().url()],
        contentType: 'text/plain',
      }),
  );
  await page.goto('/?contract=demos/signing-and-proof.mdx');
  const output = page.frameLocator('iframe');
  await output.getByRole('tab', { name: 'Signatures', exact: true }).click();
  await expect(output.getByLabel('Signature proof')).toContainText(
    '0/0 parties signed',
  );
  await output
    .getByRole('button', { name: 'Review all fields and sign', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Signing review' }),
  ).toContainText('Deadline');
  await expect(
    page.getByRole('button', { name: 'Connect Chrome wallet', exact: true }),
  ).toBeVisible();
});

test('missing Chrome extension gives an actionable error', async ({ page }) => {
  await page.goto('/?contract=demos/signing-and-proof.mdx');
  await page
    .frameLocator('iframe')
    .getByRole('tab', { name: 'Signatures', exact: true })
    .click();
  await page
    .frameLocator('iframe')
    .getByRole('button', { name: 'Review all fields and sign', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Connect Chrome wallet', exact: true })
    .click();
  await expect(page.locator('#signing-requirement')).toContainText(
    'Approve the connection',
  );
  await expect(page.getByRole('alert')).toContainText('extension');
  await expect(
    page.getByRole('button', { name: 'Connect Chrome wallet', exact: true }),
  ).toBeEnabled();
});
