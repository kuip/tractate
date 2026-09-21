import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { templates } from '../template-fixtures';
test('real Chrome extension isolates keys, requires approval, reviews changes, and rejects cancellation', async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(path.join(tmpdir(), 'tractate-wallet-test-'));
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
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${id}/wallet.html`);
    await manager
      .getByLabel('Wallet password', { exact: true })
      .fill('test-only wallet password');
    await manager
      .getByRole('button', { name: 'Create wallet', exact: true })
      .click();
    await expect(
      manager.getByRole('textbox', { name: 'Public key', exact: true }),
    ).toHaveValue(/^ed25519:/);
    const publicKey = await manager
      .getByRole('textbox', { name: 'Public key', exact: true })
      .inputValue();
    const page = await context.newPage();
    await page.goto(
      'http://127.0.0.1:4321/?contract=demos/signing-and-proof.mdx',
    );
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'No Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    let opened = context.waitForEvent('page');
    await page
      .getByRole('button', { name: 'Connect Chrome wallet', exact: true })
      .click();
    let popup = await opened;
    await expect(
      popup.getByText('Requested by', { exact: false }),
    ).toContainText('http://127.0.0.1:4321/');
    await popup
      .getByRole('button', { name: 'Share public key', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'My public key' }),
    ).toHaveValue(publicKey);
    await page
      .getByRole('textbox', { name: 'Required party public keys' })
      .fill(publicKey);
    await page
      .getByRole('button', { name: 'Set parties', exact: true })
      .click();
    opened = context.waitForEvent('page');
    await page
      .getByRole('button', { name: 'Review in Chrome wallet', exact: true })
      .click();
    popup = await opened;
    await expect(
      popup.getByRole('region', { name: 'Signing review' }),
    ).toContainText('Deadline');
    await expect(
      popup.getByRole('button', { name: 'Approve signature', exact: true }),
    ).toBeDisabled();
    await popup
      .getByLabel('Wallet password', { exact: true })
      .fill('test-only wallet password');
    await popup.getByRole('checkbox').check();
    await popup
      .getByRole('button', { name: 'Approve signature', exact: true })
      .click();
    await expect(
      page.getByText('1/1 parties signed this version.'),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem('tractate:native-wallets:v1'),
      ),
    ).toBeNull();
    await expect(
      page.getByLabel('Wallet password', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Close contract action' }).click();
    await page
      .frameLocator('iframe')
      .getByRole('textbox', { name: 'Author', exact: true })
      .fill('Changed value');
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    opened = context.waitForEvent('page');
    await page
      .getByRole('button', { name: 'Review in Chrome wallet', exact: true })
      .click();
    popup = await opened;
    await expect(
      popup.getByRole('region', { name: 'Signing review' }),
    ).toContainText('→ "Changed value"');
    await popup
      .getByRole('button', { name: 'Reject request', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('rejected');
    await expect(
      page.getByText('0/1 parties signed this version.'),
    ).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
