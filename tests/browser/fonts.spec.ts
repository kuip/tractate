import { test, expect } from '@playwright/test';

test('editor and output do not mount content until both font families and every used weight load', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = FontFaceSet.prototype.load;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate = { requested: [] as string[], release };
    (window as any).fontGate = gate;
    FontFaceSet.prototype.load = async function (font, text) {
      gate.requested.push(font);
      const faces = await original.call(this, font, text);
      await held;
      return faces;
    };
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => (window as any).fontGate.requested.length))
    .toBe(5);
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveCount(
    0,
  );
  await expect(page.locator('iframe')).toHaveCount(0);
  const requested = await page.evaluate(
    () => (window as any).fontGate.requested,
  );
  expect(requested).toEqual([
    '400 16px "Roboto Condensed"',
    '500 16px "Roboto Condensed"',
    '600 16px "Roboto Condensed"',
    '700 16px "Roboto Condensed"',
    '400 16px "Roboto Mono"',
  ]);
  await page.evaluate(() => (window as any).fontGate.release());
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toBeVisible();
  await expect
    .poll(() =>
      page.frames().some((frame) => frame.url().endsWith('/preview.html')),
    )
    .toBe(true);
  const output = page
    .frames()
    .find((frame) => frame.url().endsWith('/preview.html'))!;
  await expect
    .poll(() =>
      output.evaluate(() => (window as any).fontGate.requested.length),
    )
    .toBe(5);
  await expect(
    output.getByRole('heading', { name: 'Contribution agreement' }),
  ).toHaveCount(0);
  await output.evaluate(() => (window as any).fontGate.release());
  await expect(
    output.getByRole('heading', { name: 'Contribution agreement' }),
  ).toBeVisible();
  expect(
    await output.evaluate(
      () =>
        document.fonts.check('400 16px "Roboto Mono"') &&
        document.fonts.check('700 16px "Roboto Condensed"'),
    ),
  ).toBe(true);
});

test('font failure leaves editor unmounted and offers a reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    FontFaceSet.prototype.load = async () => {
      throw new Error('Test font failure');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Unable to load editor fonts',
  );
  await expect(
    page.getByRole('button', { name: 'Reload', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveCount(
    0,
  );
});
