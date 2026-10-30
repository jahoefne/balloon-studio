import { expect, test, type Page } from '@playwright/test';

// `E2E_CORE=real npx playwright test fonts`: the bundled fonts in a real browser, on the real core (WP-R7).

const FAMILIES = ['Nunito', 'Arimo', 'Gelasio', 'Comic Neue', 'DejaVu Sans Mono'];

test.skip(process.env.E2E_CORE !== 'real', 'The stub core has no fonts.');

const openWithPattern = async (page: Page, style: string) => {
  await page.addInitScript((s) => localStorage.setItem('BalloonStudio.pattern.v1', JSON.stringify({ style: s })), style);
  await page.goto('./');
  await expect(page.getByTestId('exportBalloon')).toBeEnabled();
};

test('the Font picker sets every option in its bundled face', async ({ page, browserName }) => {
  const fontFiles: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/fonts/') && response.request().resourceType() === 'font') fontFiles.push(response.url().split('/').pop()!);
  });
  await openWithPattern(page, 'Text');
  const select = page.getByTestId('balloonTextFont');
  await expect(select).toBeVisible();

  // The closed picker shows the selection in its face.
  await expect.poll(() => page.evaluate(() => document.fonts.check('700 13px Nunito'))).toBe(true);
  expect(await select.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Nunito');
  const optionFamilies = await select.locator('option').evaluateAll((options) => options.map((option) => getComputedStyle(option).fontFamily));
  FAMILIES.forEach((family, index) => expect(optionFamilies[index]).toContain(family));

  // Only Chromium's customizable select renders the open list with the page's fonts.
  if (browserName === 'chromium') {
    await select.click();
    await expect
      .poll(() => page.evaluate((families) => families.filter((family) => !document.fonts.check(`700 13px "${family}"`)), FAMILIES))
      .toEqual([]);
    const widths = await select.locator('option').evaluateAll((options) => options.map((option) => option.getBoundingClientRect().width));
    expect(widths.every((width) => width > 0)).toBe(true);
    await page.keyboard.press('Escape');
    expect([...new Set(fontFiles)].sort()).toEqual(['Arimo-Bold.ttf', 'ComicNeue-Bold.ttf', 'DejaVuSansMono-Bold.ttf', 'Gelasio-Bold.ttf', 'Nunito-Bold.ttf']);
  }
});

test('no font file is fetched for the page itself until the Text pattern is open', async ({ page }) => {
  const asFontFace: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/fonts/') && request.resourceType() === 'font') asFontFace.push(request.url());
  });
  await openWithPattern(page, 'Solid');
  await expect(page.getByTestId('patternStyle')).toBeVisible();
  expect(asFontFace).toEqual([]);
});

test('characters no font has get the hint from the real core', async ({ page }) => {
  await openWithPattern(page, 'Text');
  const hint = page.getByTestId('missingGlyphs');
  await page.getByTestId('balloonText').fill('Hi 東京');
  await expect(hint).toHaveText('Not in any bundled font: 東 京. These characters are left out.');
  await page.getByTestId('balloonText').fill('Hi');
  await expect(hint).toBeEmpty();
});

test('a failed font load fails the Text pattern with its cause and nothing else', async ({ page }) => {
  await page.route('**/fonts/*.ttf', (route) => route.fulfill({ status: 404, body: '' }));
  await openWithPattern(page, 'Solid');
  await expect(page.getByRole('heading', { name: 'Preview' }).or(page.getByTestId('stage').first())).toBeVisible();
  await page.getByTestId('patternStyle').selectOption({ label: 'Hearts' });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByTestId('patternStyle').selectOption({ label: 'Text' });
  const alert = page.getByRole('alertdialog');
  await expect(alert).toContainText(/The fonts of the Text pattern could not be loaded \(.*-Bold\.ttf: HTTP 404\)\. Reload the page to try again\./);
});
