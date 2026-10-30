import { expect, type Locator, type Page } from '@playwright/test';

// The vocabulary of the parity rows (rows.ts). A row names what the Mac app shows, carries the
// literal that report.mjs looks up in the Swift source, and checks the running web app.

export type Kind = 'Control' | 'Readout' | 'Warning' | 'Preview' | 'Export' | 'Shortcut' | 'Persistence';
export type Check = (page: Page) => Promise<void>;

export interface Row {
  kind: Kind;
  name: string;
  /** Literal of the Swift source; report.mjs finds its line. `null`: the Mac has nothing to point at. */
  needle: string | null;
  /** Literal of the web source, when it differs from `needle`. */
  webNeedle?: string | undefined;
  /** The plan decided this difference. */
  decided?: string | undefined;
  /** A real gap. The check still has to hold for what exists. */
  open?: { owner: string; note: string } | undefined;
  check: Check;
}

/** Thrown when the row's subject does not exist yet because another work package owns it. */
export class Pending extends Error {
  constructor(
    readonly owner: string,
    note: string,
  ) {
    super(note);
  }
}

export interface Options {
  needle?: string | null;
  webNeedle?: string;
  decided?: string;
  open?: { owner: string; note: string };
  kind?: Kind;
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const firstFragment = (text: string) => text.slice(0, 36);
const pick = (o: Options) => ({
  ...(o.webNeedle !== undefined ? { webNeedle: o.webNeedle } : {}),
  ...(o.decided !== undefined ? { decided: o.decided } : {}),
  ...(o.open !== undefined ? { open: o.open } : {}),
});

const pageText = async (page: Page) => collapse(await page.locator('#root').innerText());

/** Text in the page, as a substring. For text with numbers pass `needle` with its literal part. */
export function T(text: string, o: Options = {}): Row {
  return {
    kind: o.kind ?? 'Readout',
    name: text.length > 90 ? `${text.slice(0, 87)}…` : text,
    needle: o.needle === undefined ? firstFragment(text) : o.needle,
    ...pick(o),
    check: async (page) => {
      await expect.poll(() => pageText(page), { message: text }).toContain(collapse(text));
    },
  };
}

/** Text that must not be in the page in this state. */
export function Not(text: string, why: string, o: Options = {}): Row {
  return {
    kind: o.kind ?? 'Readout',
    name: `${why}: no “${text.slice(0, 60)}”`,
    needle: o.needle === undefined ? firstFragment(text) : o.needle,
    ...pick(o),
    check: async (page) => {
      expect(await pageText(page)).not.toContain(collapse(text));
    },
  };
}

/** A warning: orange on the Mac, `--warning` here. */
export function W(text: string, o: Options = {}): Row {
  const base = T(text, { ...o, kind: 'Warning' });
  return {
    ...base,
    check: async (page) => {
      await base.check(page);
      const color = await page.evaluate((needle) => {
        const walker = document.createTreeWalker(document.getElementById('root')!, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent?.includes(needle)) return getComputedStyle(node.parentElement!).color;
        }
        return null;
      }, text.slice(0, 24));
      expect(color, `warning color of “${text}”`).toBe('rgb(168, 84, 0)');
    },
  };
}

export interface ParameterOptions extends Options {
  value?: string;
  help?: string;
}

/** ParameterControl: field, slider range and step, unit, help. `hi === null`: the upper bound is checked as > lo. */
export function P(title: string, lo: number, hi: number | null, step: number, unit: string, o: ParameterOptions = {}): Row {
  return {
    kind: 'Control',
    name: `${title} · ${lo}…${hi ?? 'derived'} step ${step}${unit ? ` ${unit}` : ''}${o.help ? ' · help' : ''}`,
    needle: o.needle === undefined ? title : o.needle,
    ...pick(o),
    check: async (page) => {
      const field = page.getByRole('textbox', { name: title, exact: true });
      await expect(field).toBeVisible();
      const slider = page.getByRole('slider', { name: `${title} slider`, exact: true });
      expect(Number(await slider.getAttribute('min')), `${title} lower`).toBeCloseTo(lo, 6);
      const max = Number(await slider.getAttribute('max'));
      if (hi === null) expect(max, `${title} upper`).toBeGreaterThan(lo);
      else expect(max, `${title} upper`).toBeCloseTo(hi, 6);
      expect(Number(await slider.getAttribute('step')), `${title} step`).toBeCloseTo(step, 6);
      const box = page.locator('.ui-parameter').filter({ has: field });
      const unitText = box.locator('.ui-parameter__unit');
      if (unit) await expect(unitText).toHaveText(unit);
      else await expect(unitText).toHaveCount(0);
      await expect(box.locator('.ui-parameter__ticks')).toHaveCount(1);
      if (o.value !== undefined) await expect(field).toHaveValue(o.value);
      if (o.help !== undefined) {
        await expect(box).toHaveAttribute('title', o.help);
        await expect(field).toHaveAccessibleDescription(o.help);
      }
    },
  };
}

export interface ToggleOptions extends Options {
  testId?: string;
  help?: string;
  checked?: boolean;
  role?: 'checkbox' | 'switch';
}

export function C(name: string, o: ToggleOptions = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `${o.role === 'switch' ? 'Switch' : 'Checkbox'} “${name}”${o.testId ? ` #${o.testId}` : ''}${o.help ? ' · help' : ''}`,
    needle: o.needle === undefined ? name : o.needle,
    ...pick(o),
    check: async (page) => {
      const box = page.getByRole(o.role ?? 'checkbox', { name, exact: true });
      await expect(box).toBeVisible();
      if (o.testId !== undefined) await expect(page.getByTestId(o.testId)).toHaveCount(1);
      if (o.checked !== undefined) expect(await box.isChecked(), name).toBe(o.checked);
      if (o.help !== undefined) await expect(box).toHaveAccessibleDescription(o.help);
    },
  };
}

export interface ButtonOptions extends Options {
  testId?: string;
  help?: string;
  disabled?: boolean;
  exact?: boolean;
}

export function B(name: string, o: ButtonOptions = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `Button “${name}”${o.testId ? ` #${o.testId}` : ''}${o.help ? ' · help' : ''}`,
    needle: o.needle === undefined ? name : o.needle,
    ...pick(o),
    check: async (page) => {
      const button = o.testId !== undefined ? page.getByTestId(o.testId) : page.getByRole('button', { name, exact: o.exact ?? true });
      await expect(button).toBeVisible();
      if (o.testId !== undefined) await expect(button).toContainText(name);
      if (o.help !== undefined) await expect(button).toHaveAttribute('title', o.help);
      if (o.disabled !== undefined) expect(await button.isDisabled(), name).toBe(o.disabled);
    },
  };
}

export interface PickerOptions extends Options {
  testId?: string;
}

/** A segmented picker: radio group in this order, `selected` on. */
export function G(label: string, options: readonly string[], selected: string, o: PickerOptions = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `Picker “${label}”: ${options.join(' · ')}${o.testId ? ` #${o.testId}` : ''}`,
    needle: o.needle === undefined ? label : o.needle,
    ...pick(o),
    check: async (page) => {
      const group = page.getByRole('radiogroup', { name: label, exact: true });
      await expect(group).toBeVisible();
      await expect(group.getByRole('radio')).toHaveText(options.map((option) => option));
      await expect(group.getByRole('radio', { name: selected, exact: true })).toBeChecked();
      if (o.testId !== undefined) await expect(page.getByTestId(o.testId)).toHaveCount(1);
    },
  };
}

/** A pop-up picker: `<select>` with these options in this order. */
export function S(label: string, options: readonly string[], selected: string, o: PickerOptions = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `Picker “${label}”: ${options.join(' · ')}${o.testId ? ` #${o.testId}` : ''}`,
    needle: o.needle === undefined ? label : o.needle,
    ...pick(o),
    check: async (page) => {
      const select = page.getByRole('combobox', { name: label, exact: true });
      await expect(select).toBeVisible();
      const seen = await select.locator('option:not([hidden])').allTextContents();
      expect(seen.map(collapse)).toEqual([...options]);
      expect(collapse(await select.locator('option:checked').innerText())).toBe(selected);
      if (o.testId !== undefined) await expect(page.getByTestId(o.testId)).toHaveCount(1);
    },
  };
}

export function M(title: string, value: string | RegExp, unit = '', o: Options = {}): Row {
  return {
    kind: 'Readout',
    name: `Metric ${title}${typeof value === 'string' ? ` = ${value}${unit ? ` ${unit}` : ''}` : ''}`,
    needle: o.needle === undefined ? title : o.needle,
    ...pick(o),
    check: async (page) => {
      const term = page.locator('.ui-metric').filter({ has: page.getByRole('term').getByText(title, { exact: true }) });
      await expect(term).toHaveCount(1);
      await expect(term.locator('.ui-metric__number')).toHaveText(value);
      if (unit) await expect(term.locator('.ui-metric__unit')).toHaveText(unit);
      else await expect(term.locator('.ui-metric__unit')).toHaveCount(0);
    },
  };
}

/** `accessibilityIdentifier` on an element that the other rows do not name. */
export function Id(testId: string, o: Options = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `#${testId}`,
    needle: o.needle === undefined ? testId : o.needle,
    ...pick(o),
    check: async (page) => {
      await expect(page.getByTestId(testId).first()).toBeVisible();
    },
  };
}

/** `accessibilityLabel`: an element by role and name. */
export function A(role: 'button' | 'img', name: string, o: Options = {}): Row {
  return {
    kind: o.kind ?? 'Control',
    name: `Accessibility label “${name}”`,
    needle: o.needle === undefined ? name : o.needle,
    ...pick(o),
    check: async (page) => {
      await expect(page.getByRole(role, { name, exact: true })).toBeVisible();
    },
  };
}

export function Do(kind: Kind, name: string, needle: string | null, check: Check, o: Options = {}): Row {
  return { kind, name, needle, ...pick(o), check };
}

// ---- helpers for scripted checks ----

export const STORE = '/balloon-studio/src/stores/index.ts';

/** Calls a store action in the page. In dev, this module instance is the app's. */
export async function storeCall(page: Page, store: string, method: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    async ([url, name, action, values]) => {
      const stores = await import(/* @vite-ignore */ url as string);
      stores[name as string].getState()[action as string](...(values as unknown[]));
    },
    [STORE, store, method, args] as const,
  );
}

export async function storeRead<T>(page: Page, store: string, field: string): Promise<T> {
  return page.evaluate(
    async ([url, name, key]) => {
      const stores = await import(/* @vite-ignore */ url as string);
      return stores[name as string].getState()[key as string];
    },
    [STORE, store, field] as const,
  ) as Promise<T>;
}

/** The core behind `#core/parameters`, with the store's parameters. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function coreName(page: Page, coreMode: string, store: string, expression: (core: any, parameters: any) => string): Promise<string> {
  const source = expression.toString();
  return page.evaluate(
    async ([stores, core, name, fn]) => {
      const { core: api } = await import(/* @vite-ignore */ `/balloon-studio/src/core/${core}/parameters.ts`);
      const all = await import(/* @vite-ignore */ stores as string);
      const parameters = all[name as string].getState().parameters;
      // eslint-disable-next-line no-eval
      return (0, eval)(`(${fn})`)(api, parameters);
    },
    [STORE, coreMode, store, source] as const,
  ) as Promise<string>;
}

export const stage = (page: Page): Locator => page.getByTestId('stage').first();

export async function waitIdle(page: Page): Promise<void> {
  // The preview status of the visible editor, not "Updating…" in the purge summary.
  await expect(page.locator('#root')).toContainText('Live preview', { timeout: 90_000 });
}

export async function settle(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
  await waitIdle(page);
  await page.waitForTimeout(150);
}

/** The stage's pixels. */
export const shot = (page: Page) => stage(page).screenshot({ animations: 'disabled' });

/** Row check: `act` must change what the stage draws. */
export const stageChanges =
  (act: Check, restore?: Check): Check =>
  async (page) => {
    await settle(page);
    const before = await shot(page);
    await act(page);
    await settle(page);
    const after = await shot(page);
    expect(before.equals(after), 'the stage should change').toBe(false);
    if (restore) {
      await restore(page);
      await settle(page);
    }
  };

/** Row check: a camera reset undoes an orbit drag. */
export const resetAfterOrbit =
  (buttonName: string): Check =>
  async (page) => {
    await settle(page);
    const box = (await stage(page).boundingBox())!;
    const before = await shot(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const dragged = await shot(page);
    expect(before.equals(dragged), 'dragging should orbit').toBe(false);
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await page.waitForTimeout(700);
    expect((await shot(page)).equals(dragged), 'reset should move the camera back').toBe(false);
  };

export const clickRole =
  (role: 'button' | 'checkbox' | 'radio', name: string): Check =>
  async (page) => {
    await page.getByRole(role, { name, exact: true }).click();
  };

export async function setField(page: Page, title: string, value: string): Promise<void> {
  const field = page.getByRole('textbox', { name: title, exact: true });
  await field.fill(value);
  await field.press('Enter');
}

const modifier = (page: Page) => page.evaluate(() => (/mac|iphone|ipad/i.test(navigator.platform) ? 'Meta' : 'Control'));

/** Mod+E runs the export start: the footer shows the export state, or U9's dialog opens. */
export const exportShortcut =
  (buttonId: string): Check =>
  async (page) => {
    const key = await modifier(page);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const button = page.getByTestId(buttonId);
    await page.keyboard.press(`${key}+e`);
    await expect
      .poll(async () => (await page.locator('dialog[open]').count()) > 0 || (await button.isDisabled()), { timeout: 3_000, intervals: [30, 50, 100] })
      .toBe(true);
    const dialog = page.locator('dialog[open]');
    if ((await dialog.count()) > 0) await page.keyboard.press('Escape');
    await expect(button).toBeEnabled({ timeout: 10_000 });
  };

/** Mod+O opens the file chooser. */
export const openShortcut: Check = async (page) => {
  const key = await modifier(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.keyboard.press(`${key}+o`);
  await chooser;
};

/** Alt+N resets the part: the field goes back to its default. */
export const resetShortcut =
  (title: string, changed: string, initial: string): Check =>
  async (page) => {
    await setField(page, title, changed);
    await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(changed);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(initial);
  };

/** The value is written at once under `key` with exactly the Mac's JSON keys and survives a reload. */
export const persists =
  (key: string, tab: string, title: string, changed: string, field: string, jsonKeys: readonly string[]): Check =>
  async (page) => {
    await setField(page, title, changed);
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(raw, key).not.toBeNull();
    const json = JSON.parse(raw!) as Record<string, unknown>;
    expect(String(json[field]), `${key}.${field}`).toBe(changed);
    expect(Object.keys(json).sort()).toEqual([...jsonKeys].sort());
    await page.reload();
    await page.getByRole('radio', { name: tab, exact: true }).click();
    await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(changed);
  };

/** A file from `defaults read` loads as it is: a stored settings JSON from the Mac shows its value. */
export const loadsMacJson =
  (key: string, json: unknown, tab: string, title: string, shown: string): Check =>
  async (page) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [key, json] as const);
    await page.reload();
    await page.getByRole('radio', { name: tab, exact: true }).click();
    await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(shown);
  };

/** U9 opens its dialog here; until then the row is pending. */
export const panelStrings =
  (buttonId: string, strings: readonly string[], suggested: string): Check =>
  async (page) => {
    await page.getByTestId(buttonId).click();
    const dialog = page.locator('dialog[open]');
    try {
      await dialog.waitFor({ timeout: 1_500 });
    } catch {
      throw new Pending('WP-U9', 'Save dialog not there yet; the strings live in `exportTable.ts`.');
    }
    const text = collapse(await dialog.innerText());
    for (const string of strings) expect(text).toContain(collapse(string));
    await expect(page.getByTestId('exportFilename')).toHaveValue(suggested);
    await page.keyboard.press('Escape');
  };
