import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cardFixture } from '../card-fixtures';
import { templates, mockTemplates } from '../template-fixtures';
import {
  hydrateEnvelope,
  signingBytes,
} from '../../packages/contract-kit/src/envelope';
import { verifySigningProof } from '../../packages/contract-kit/src/proof';
import { toBase64 } from '../../packages/contract-kit/src/certificates';
mockTemplates();

test('extension card flow reviews the contract, uses the native protocol, and downloads a verifiable proof', async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(path.join(tmpdir(), 'tractate-card-test-'));
  const extension = path.resolve('extension/dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    await context.route(
      'https://raw.githubusercontent.com/kuip/tractate/**',
      (route) =>
        route.fulfill({
          body: templates[route.request().url()],
          contentType: 'text/plain',
        }),
    );
    // Serve the local build at the production HTTPS origin; no production mutation.
    await context.route('https://kuip.github.io/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await context.request.get(
        'http://127.0.0.1:4321' +
          (url.pathname.replace(/^\/tractate/, '') || '/') +
          url.search,
      );
      await route.fulfill({ response });
    });
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker'));
    const card = await cardFixture();
    let cancelled = false;
    async function mockNative(popup: Page) {
      await popup.exposeFunction('testNativeCard', async (message: any) => {
        expect(message.arguments.origin).toBe('https://kuip.github.io');
        if (cancelled)
          return {
            error: {
              code: 'ERR_WEBEID_USER_CANCELLED',
              message: 'Card signing cancelled.',
            },
          };
        if (message.command === 'get-signing-certificate')
          return {
            certificate: card.certificate,
            supportedSignatureAlgorithms: [card.algorithm],
          };
        expect(message.command).toBe('sign');
        expect(message.arguments.certificate).toBe(card.certificate);
        const pending = await worker.evaluate(
          async () => (await chrome.storage.session.get('pending')).pending,
        );
        const envelope = await hydrateEnvelope(pending.contract);
        const hash = toBase64(
          new Uint8Array(
            await crypto.subtle.digest('SHA-384', signingBytes(envelope)),
          ),
        );
        expect(message.arguments.hash).toBe(hash);
        expect(message.arguments.hashFunction).toBe('SHA-384');
        const signed = await card.sign(envelope);
        return {
          signature: Buffer.from(signed.signature, 'hex').toString('base64'),
          signatureAlgorithm: card.algorithm,
        };
      });
      await popup.evaluate(() => {
        chrome.runtime.connectNative = (host: string) => {
          if (host !== 'dev.tractate.webeid') throw new Error('Wrong host');
          let listener: (message: unknown) => void;
          return {
            onMessage: {
              addListener(fn: typeof listener) {
                listener = fn;
                queueMicrotask(() => fn({ version: '2.0.0' }));
              },
            },
            onDisconnect: { addListener() {} },
            disconnect() {},
            async postMessage(message: unknown) {
              listener(await (window as any).testNativeCard(message));
            },
          };
        };
      });
    }
    const page = await context.newPage();
    await page.goto(
      'https://kuip.github.io/tractate/?contract=demos/signing-and-proof.mdx',
    );
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'No Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    let opened = context.waitForEvent('page');
    await page
      .getByRole('button', { name: 'Connect Chrome wallet', exact: true })
      .click();
    let popup = await opened;
    await popup.waitForLoadState();
    await mockNative(popup);
    await popup.getByRole('button', { name: 'Read eID signing card' }).click();
    await expect(
      popup.getByRole('textbox', { name: 'Public key', exact: true }),
    ).toHaveValue(card.publicKey);
    await expect(
      popup.getByText(/Certificate subject \(unverified\)/),
    ).toContainText('TEST ONLY');
    await popup
      .getByRole('button', { name: 'Share public key', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'My public key' }),
    ).toHaveValue(card.publicKey);
    await page.getByRole('button', { name: 'Add my key to parties' }).click();
    opened = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Review in Chrome wallet' }).click();
    popup = await opened;
    await popup.waitForLoadState();
    await mockNative(popup);
    await popup.getByRole('button', { name: 'Read eID signing card' }).click();
    await expect(
      popup.getByRole('region', { name: 'Signing review' }),
    ).toContainText('Deadline');
    await expect(
      popup.getByRole('button', { name: 'Approve signature' }),
    ).toBeDisabled();
    await popup.getByRole('checkbox').check();
    await popup.getByRole('button', { name: 'Approve signature' }).click();
    await expect(
      page.getByText('1/1 parties signed this version.'),
    ).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download signing proof' }).click();
    const proof = JSON.parse(
      await readFile((await (await downloading).path())!, 'utf8'),
    );
    const result = await verifySigningProof(proof);
    expect(result.complete).toBe(true);
    expect(result.identityVerified).toBe(false);
    expect(result.signed).toEqual([card.publicKey]);
    await page.getByRole('button', { name: 'Close contract action' }).click();
    await page
      .frameLocator('iframe')
      .getByRole('tab', { name: 'Signatures', exact: true })
      .click();
    await expect(
      page.frameLocator('iframe').getByLabel('Signature proof'),
    ).toContainText('All signatures verified.');
    await page.getByRole('button', { name: 'Sign', exact: true }).click();

    opened = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Review in Chrome wallet' }).click();
    popup = await opened;
    await popup.waitForLoadState();
    await mockNative(popup);
    cancelled = true;
    await popup.getByRole('button', { name: 'Read eID signing card' }).click();
    await expect(popup.getByRole('alert')).toContainText('cancelled');
    await popup.getByRole('button', { name: 'Reject request' }).click();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
