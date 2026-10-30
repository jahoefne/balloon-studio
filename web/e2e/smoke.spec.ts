import { expect, test } from '@playwright/test';

// Opens every tab and works one control of each. Fails on any uncaught error or console error.

const TABS: readonly { title: string; exportId: string; control: string }[] = [
  { title: 'Balloon', exportId: 'exportBalloon', control: 'Widest diameter' },
  { title: 'Basket', exportId: 'exportBasket', control: 'Basket height' },
  { title: 'Ring', exportId: 'exportRing', control: 'Band width' },
  { title: 'Cloud', exportId: 'exportCloud', control: 'Back depth' },
  { title: 'Sun', exportId: 'exportSun', control: 'Back depth' },
  { title: 'Figures', exportId: 'exportFigure', control: 'Height' },
  { title: 'Cable clip', exportId: 'exportCableClip', control: 'Plate thickness' },
];

test('every tab opens and answers a control', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  // A fresh context has empty storage. No reload here: WebKit reports the workers' cancelled module loads as errors.
  await page.goto('./');

  for (const { title, exportId, control } of TABS) {
    await page.getByRole('radio', { name: title, exact: true }).click();
    await expect(page.getByTestId(exportId)).toBeVisible();

    const field = page.getByRole('textbox', { name: control, exact: true });
    const before = await field.inputValue();
    const slider = page.getByRole('slider', { name: `${control} slider`, exact: true });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(field).not.toHaveValue(before);
    await page.keyboard.press('ArrowLeft');
    await expect(field).toHaveValue(before);
    await expect(page.getByTestId('stage').first()).toBeVisible();
  }

  expect(problems).toEqual([]);
});
