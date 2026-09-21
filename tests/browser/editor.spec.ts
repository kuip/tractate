import { test, expect, type Page } from '@playwright/test';

async function view(page: Page, name: string) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function exportDraft(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Export MDX', exact: false })
    .click();
}

test('edit, switch views, restore draft, recover errors, export, and reopen offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const output = page.frameLocator('iframe');
  await expect(
    output.getByRole('heading', { name: 'Contribution agreement' }),
  ).toBeVisible();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.fill(
    '# My crypto contract\n\n<Callout title="Terms">Clear terms.</Callout>',
  );
  await expect(
    output.getByRole('heading', { name: 'My crypto contract' }),
  ).toBeVisible();
  await view(page, 'Output');
  await expect(source).toBeHidden();
  await view(page, 'Source');
  await expect(page.locator('iframe')).toBeHidden();
  await view(page, 'Both');
  await expect(source).toContainText('My crypto contract');
  await source.fill('{window.parent.document.body.innerHTML = "unsafe"}');
  await expect(page.getByRole('alert')).toContainText('JavaScript expressions');
  await expect(
    output.getByRole('heading', { name: 'My crypto contract' }),
  ).toBeVisible();
  await source.fill('# Recovered contract');
  await expect(
    output.getByRole('heading', { name: 'Recovered contract' }),
  ).toBeVisible();
  await expect(page.getByText('saved')).toBeVisible();
  const download = page.waitForEvent('download');
  await exportDraft(page);
  expect((await download).suggestedFilename()).toMatch(/\.mdx$/);
  await page.reload();
  await expect(
    output.getByRole('heading', { name: 'Recovered contract' }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(
    output.getByRole('heading', { name: 'Recovered contract' }),
  ).toBeVisible();
  await source.fill('# Offline edit');
  await expect(
    output.getByRole('heading', { name: 'Offline edit' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile, dark theme, recursive menus, and import', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Contribution agreement' }),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contracts', exact: true }).click();
  await page.getByRole('menuitem', { name: 'agreements', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contribution agreement' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'imported.mdx',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported agreement'),
  });
  await page.getByRole('button', { name: 'Replace draft' }).click();
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Imported agreement' }),
  ).toBeVisible();
  for (const mode of ['Source', 'Output', 'Both']) await view(page, mode);
  await page.screenshot({
    path: 'test-results/mobile-dark.png',
    fullPage: true,
  });
});

test('output inputs update source, survive recompilation, reload, and export', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('tractate:view', 'source'),
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Source pane' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Output pane' })).toBeVisible();
  const output = page.frameLocator('iframe');
  const author = output.getByRole('textbox', { name: 'Author', exact: true });
  await expect(author).toBeVisible();
  await author.fill('Alice');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'value="Alice"',
  );
  await expect(page.getByText('output OK')).toBeVisible();
  await expect(author).toBeFocused();
  await author.pressSequentially(' Smith');
  await output
    .getByRole('textbox', { name: 'Recipient', exact: true })
    .fill('Bob');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'value="Alice Smith"',
  );
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'value="Bob"',
  );
  await expect(page.getByText('saved')).toBeVisible();
  await view(page, 'Output');
  await expect(author).toHaveValue('Alice Smith');
  await page.reload();
  await expect(author).toHaveValue('Alice Smith');
  await expect(
    output.getByRole('textbox', { name: 'Recipient', exact: true }),
  ).toHaveValue('Bob');
  const download = page.waitForEvent('download');
  await exportDraft(page);
  const stream = await (await download).createReadStream();
  let exported = '';
  for await (const chunk of stream!) exported += chunk.toString();
  expect(exported).toContain('value="Alice Smith"');
  expect(exported).toContain('value="Bob"');
});

test('output remains visible on a small screen without scrolling the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('textbox', { name: 'Author', exact: true }),
  ).toBeVisible();
  const bounds = await page.locator('iframe').boundingBox();
  expect(bounds!.y).toBeGreaterThan(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await expect(page.getByText('YOUR WORDS. YOUR CONTRACT.')).toHaveCount(0);
  await expect(
    page.getByText('A place for agreements to take shape.'),
  ).toHaveCount(0);
});

test('contract-defined menus and tabs keep fields across switches and recompiles', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contracts', exact: true }).click();
  await page.getByRole('menuitem', { name: 'demos', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Menus and tabs demo' }).click();
  await page.getByRole('button', { name: 'Replace draft' }).click();
  const output = page.frameLocator('iframe');
  await expect(output.getByRole('tab', { name: 'Parties' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const author = output.getByRole('textbox', { name: 'Author', exact: true });
  await expect(author).toHaveValue('');
  await expect(author).toHaveAttribute('placeholder', 'Author identity');
  await output.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(
    output.getByRole('menuitem', { name: 'MDX documentation' }),
  ).toHaveAttribute('href', 'https://mdxjs.com/docs/');
  await output
    .getByRole('menuitem', { name: 'MDX documentation' })
    .press('Escape');
  await output.getByRole('tab', { name: 'Terms' }).click();
  await output
    .getByRole('textbox', { name: 'Purpose' })
    .fill('A demo contribution');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'value="A demo contribution"',
  );
  await expect(page.getByText('output OK', { exact: true })).toBeVisible();
  await expect(output.getByRole('tab', { name: 'Terms' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await output.getByRole('tab', { name: 'Terms' }).press('ArrowRight');
  await expect(output.getByRole('tab', { name: 'Review' })).toBeFocused();
  await output.getByRole('tab', { name: 'Terms' }).click();
  await expect(output.getByRole('textbox', { name: 'Purpose' })).toHaveValue(
    'A demo contribution',
  );
  await expect(
    page.locator('.toolbar, .pane-heading, .pane-footer'),
  ).toHaveCount(0);
  await expect(page.locator('.input-status')).toContainText('UTF8');
});

test('direct contract link opens demo output without overwriting the main draft', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('# My main draft');
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
  await page.goto('/?contract=demos/menus-and-tabs.mdx');
  const output = page.frameLocator('iframe');
  await expect(output.getByRole('tab', { name: 'Parties' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Source pane' })).toBeHidden();
  await expect(page.getByText('output OK', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    '# My main draft',
  );
});

test('shared cascading menus stay inside the viewport and restore focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto('/?contract=demos/menus-and-tabs.mdx');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contracts', exact: true }).click();
  await page.getByRole('menuitem', { name: 'demos', exact: true }).click();
  for (const panel of await page.locator('.shared-menu-panel').all()) {
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);
  }
  await page
    .getByRole('menuitem', { name: 'Menus and tabs demo' })
    .press('Escape');
  await expect(
    page.getByRole('menuitem', { name: 'demos', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('menuitem', { name: 'demos', exact: true })
    .press('Escape');
  await page
    .getByRole('menuitem', { name: 'Contracts', exact: true })
    .press('Escape');
  await expect(
    page.getByRole('button', { name: 'File', exact: true }),
  ).toBeFocused();
  const output = page.frameLocator('iframe');
  await output.getByRole('button', { name: 'Resources', exact: true }).click();
  await output
    .getByRole('menuitem', { name: 'More resources', exact: true })
    .click();
  await expect(
    output.getByRole('menuitem', { name: 'Markdown guide' }),
  ).toBeVisible();
  const parentBounds = await output
    .locator('.shared-menu-panel')
    .nth(0)
    .boundingBox();
  const childBounds = await output
    .locator('.shared-menu-panel')
    .nth(1)
    .boundingBox();
  expect(childBounds!.x - parentBounds!.x).toBeCloseTo(20, 0);
  expect(childBounds!.y).toBeCloseTo(parentBounds!.y, 0);
  await expect(output.locator('.shared-menu-title')).toHaveText(
    'More resources',
  );

  for (const panel of await output.locator('.shared-menu-panel').all()) {
    const layout = await panel.evaluate((el) => ({
      bounds: el.getBoundingClientRect().toJSON(),
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(layout.bounds.x).toBeGreaterThanOrEqual(0);
    expect(layout.bounds.y).toBeGreaterThanOrEqual(0);
    expect(layout.bounds.right).toBeLessThanOrEqual(layout.width);
    expect(layout.bounds.bottom).toBeLessThanOrEqual(layout.height);
  }
  await output
    .getByRole('menuitem', { name: 'Markdown guide' })
    .press('ArrowLeft');
  await expect(
    output.getByRole('menuitem', { name: 'More resources', exact: true }),
  ).toBeFocused();
});

test('ordered views, separate statuses, no-menu logo toggle and contract margins', async ({
  page,
}) => {
  await page.goto('/?contract=demos/menus-and-tabs.mdx');
  const output = page.frameLocator('iframe');
  await expect(output.getByRole('tab', { name: 'Parties' })).toBeVisible();
  await expect(page.locator('.input-status')).toBeHidden();
  await expect(page.locator('.output-status')).toHaveText('output OK');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Source',
    'Both',
    'Output',
    'No Menu',
  ]);
  await page.getByRole('menuitem', { name: 'No Menu', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Application menu' }),
  ).toBeHidden();
  await expect(page.locator('.brand')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Output pane' })).toBeVisible();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Application menu' }),
  ).toBeVisible();
  await view(page, 'Both');
  await expect(page.locator('.input-status')).toBeVisible();
  await expect(page.locator('.output-status')).toBeVisible();
  const margins = await output.locator('.contract').evaluate((el) => {
    const css = getComputedStyle(el);
    return [css.marginTop, css.marginRight, css.marginBottom, css.marginLeft];
  });
  expect(margins).toEqual(['10px', '10px', '10px', '10px']);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Source pane' })).toBeHidden();
});
