import { test, expect } from '@playwright/test';
import { fromShareUrl, canRegister } from '../../src/lib/envelope';
import { registrationPayload } from '../../src/lib/kayros';

test('native two-party signing, full sharing, QR, reload, and gated Kayros registration', async ({
  page,
}) => {
  const password = 'test-only wallet password';
  let submissions: unknown[] = [];
  await page.route(
    'https://kayros.provable.dev/api/lightnet/hash',
    async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          success: true,
          hash: 'test-record-hash',
          timeuuid: 'test-record-id',
        },
      });
    },
  );
  await page.goto('/');
  const author = page
    .frameLocator('iframe')
    .getByRole('textbox', { name: 'Author', exact: true });
  await author.fill('Alice and Bob');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'value="Alice and Bob"',
  );
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'No Menu', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Contract actions' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await page
    .getByLabel('Wallet password', {exact: true})
    .fill(password);
  await page
    .getByRole('button', { name: 'Create native wallet', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'My public key' }),
  ).toHaveValue(/^ed25519:/);
  const firstKey = await page
    .getByRole('textbox', { name: 'My public key' })
    .inputValue();
  await page
    .getByLabel('Wallet password', {exact: true})
    .fill(password);
  await page
    .getByRole('button', { name: 'Create native wallet', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'My public key' }),
  ).not.toHaveValue(firstKey);
  const secondKey = await page
    .getByRole('textbox', { name: 'My public key' })
    .inputValue();
  await page
    .getByRole('textbox', { name: 'Required party public keys' })
    .fill(`${firstKey}\n${secondKey}`);
  await page.getByRole('button', { name: 'Set parties', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Native wallet' })
    .selectOption(firstKey);
  await page
    .getByLabel('Wallet password', {exact: true})
    .fill(password);
  await page
    .getByRole('button', { name: 'Sign with native wallet', exact: true })
    .click();
  await expect(
    page.getByText('1/2 parties signed this version.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('menuitem', { name: 'by QR', exact: true }).click();
  await expect(
    page.getByRole('img', {
      name: 'QR code for the complete contract snapshot',
    }),
  ).toBeVisible();
  const sharedUrl = await page
    .getByRole('textbox', { name: 'Contract link' })
    .inputValue();
  const shared = await fromShareUrl(new URL(sharedUrl).hash);
  expect(shared.source).toContain('value="Alice and Bob"');
  expect(shared.signatures).toHaveLength(1);
  expect(JSON.stringify(shared)).not.toContain(password);
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await page.goto(sharedUrl);
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('textbox', { name: 'Author', exact: true }),
  ).toHaveValue('Alice and Bob');
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(
    page.getByText('1/2 parties signed this version.'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Native wallet' })
    .selectOption(secondKey);
  await page
    .getByLabel('Wallet password', {exact: true})
    .fill(password);
  await page
    .getByRole('button', { name: 'Sign with native wallet', exact: true })
    .click();
  await expect(
    page.getByText('2/2 parties signed this version.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('menuitem', { name: 'by Share', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Contract link' }),
  ).not.toHaveValue('');
  const full = await fromShareUrl(
    new URL(
      await page.getByRole('textbox', { name: 'Contract link' }).inputValue(),
    ).hash,
  );
  expect(canRegister(full)).toBe(true);
  await page.getByRole('button', { name: 'Close contract action' }).click();
  // Wait for the signed metadata to reach IndexedDB before reload.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const request = indexedDB.open('tractate', 1);
        return new Promise<number>((resolve) => {
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
  expect(submissions).toEqual([registrationPayload(full, 'tractate_v1')]);
  await page.getByRole('button', { name: 'Close contract action' }).click();
  await page
    .frameLocator('iframe')
    .getByRole('textbox', { name: 'Author', exact: true })
    .fill('Changed after signing');
  await expect(
    page.getByRole('button', { name: 'Register', exact: true }),
  ).toBeDisabled();
});
