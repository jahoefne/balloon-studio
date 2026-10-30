import { expect, type Page } from '@playwright/test';
import {
  A,
  B,
  C,
  clickRole,
  coreName,
  Do,
  exportShortcut,
  G,
  loadsMacJson,
  M,
  Not,
  openShortcut,
  P,
  panelStrings,
  Pending,
  persists,
  resetAfterOrbit,
  resetShortcut,
  S,
  settle,
  stage,
  stageChanges,
  storeCall,
  storeRead,
  T,
  W,
  type Check,
  type Row,
} from './dsl';

// One scene = one state of a tab, reached from the given localStorage seed and `setup`. Rows run
// in order. Everything the rows expect is copied from mac/Sources/BalloonStudio/*.swift.

export interface Scene {
  tab: string;
  /** Group heading in the checklist. */
  part: string;
  title: string;
  seed?: Record<string, unknown>;
  setup?: Check;
  /** The stub cannot reach this state. */
  only?: 'real';
  rows: Row[];
}

const coreMode = process.env.E2E_CORE === 'real' ? 'real' : 'stub';

// ---- things every tab has ----

const FINDER = 'Plan §6: the web has no Finder; the line names the file, “saved” (File System Access) or “downloaded” (blob).';
const ALT_N = 'Plan §6: ⌘N cannot be caught in a browser, so Reset is Alt+N (⌥N) plus the visible “Reset part” button.';

/** The saved line, driven through the store. */
const savedLine = (store: string, macNeedle: string, webNeedle: string, line: (mode: string) => string): Row =>
  Do('Export', `Saved line: “${line('saved')}” / “${line('downloaded')}”`, macNeedle, async (page) => {
    for (const mode of ['saved', 'downloaded']) {
      await storeCall(page, store, 'setExported', { filename: 'file.stl', mode });
      await expect(page.locator('#root')).toContainText(line(mode));
    }
    await storeCall(page, store, 'setExported', null);
  }, { decided: FINDER, webNeedle });

/** The busy state of the footer, driven through the store. */
const busyLabel = (store: string, buttonId: string, label: string, spinner: boolean, needles: { swift?: string; web?: string } = {}): Row =>
  Do('Export', `Busy label “${label}”${spinner ? ' with spinner (ProgressView)' : ''}`, needles.swift ?? label, async (page) => {
    await storeCall(page, store, 'setExporting', true);
    const button = page.getByTestId(buttonId);
    await expect(button).toContainText(label);
    await expect(button).toBeDisabled();
    if (spinner) await expect(button.locator('[data-symbol="progress.view"]')).toHaveCount(1);
    await storeCall(page, store, 'setExporting', false);
  }, needles.web !== undefined ? { webNeedle: needles.web } : {});

const exportAlert = (store: string, title: string, needles: { swift?: string; web?: string } = {}): Row =>
  Do('Warning', `Alert “${title}” with the error text, OK dismisses`, needles.swift ?? title, async (page) => {
    await storeCall(page, store, 'setError', 'The model could not be exported: test');
    const dialog = page.getByRole('alertdialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('The model could not be exported: test');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }, needles.web !== undefined ? { webNeedle: needles.web } : {});

const fileName = (name: string, needle: string, store: string, expected: string, expression: (core: any, p: any) => string): Row => // eslint-disable-line @typescript-eslint/no-explicit-any
  Do('Export', `${name}: ${expected}`, needle, async (page) => {
    expect(await coreName(page, coreMode, store, expression)).toBe(expected);
  }, { webNeedle: 'filename' });

const editorHint = (): Row =>
  Do('Preview', 'Hint “Drag to orbit · Scroll to zoom”', 'Drag to orbit', async (page) => {
    await expect(page.locator('#root')).toContainText(/Drag to orbit\s+·\s+Scroll to zoom/);
  });

const stageRow = (label: RegExp): Row =>
  Do('Preview', 'Stage: WebGL canvas with the object name in its label', null, async (page) => {
    await expect(stage(page)).toHaveAttribute('aria-label', label);
    await expect(stage(page).locator('canvas')).toHaveCount(1);
  });

const statusRow = (): Row =>
  Do('Readout', 'Status “Updating…” while building, “Live preview” when done, in a live region', 'Updating…', async (page) => {
    await expect(page.locator('#root [aria-live], #root [role="status"]').filter({ hasText: /Live preview|Updating…/ }).first()).toBeVisible();
    await expect(page.locator('#root')).toContainText('Live preview');
  });

// ---- JSON keys as the Mac writes them (references/manifest.json `normalized`) ----

const BALLOON_KEYS = ['cordClearance', 'diameter', 'hangingClearance', 'hangingCrownThickness', 'hangingFillet', 'hangingLoop', 'hangingThickness', 'hangingWall', 'height', 'hollow', 'neckDiameter', 'neckHeight', 'panelDepth', 'panels', 'shoulder', 'stringHoles', 'wallThickness'];
const PATTERN_KEYS = ['base', 'bands', 'capHeight', 'detail', 'flightBody', 'flightCap', 'flightCompositionVersion', 'reliefDepth', 'repeats', 'rows', 'size', 'style', 'text', 'textFont', 'textHeight', 'textRepeats'];
const PURGE_KEYS = ['baseToDetail', 'density', 'detailToBase', 'layerHeight', 'multiplier'];
const BASKET_KEYS = ['cordClearance', 'depth', 'height', 'style', 'texture', 'wallThickness', 'width'];
const RING_KEYS = ['bandWidth', 'channelDepth', 'cordClearance', 'diameter', 'height', 'jointFit', 'ledClearance', 'reflectedLED', 'segmented', 'stripThickness', 'stripWidth'];
const LAMP_KEYS = ['cableDiameter', 'cableSide', 'clipFit', 'depth', 'diffuserThickness', 'kind', 'ledRowSpacing', 'mirrored', 'nailDiameter', 'nailHead', 'nailHeadDiameter', 'nailInsert', 'nailShaft', 'strainRelief', 'stripCutLength', 'stripThickness', 'stripWidth', 'style', 'sunStyle', 'surface', 'surfaceDepth', 'width'];
const FIGURE_KEYS = ['chainHole', 'dome', 'doubleSided', 'edge', 'height', 'holeDiameter', 'holeMargin', 'style', 'surface'];
const CLIP_KEYS = ['cableDiameter', 'flat', 'length', 'mount', 'nailDiameter', 'nailGap', 'nailHeadDiameter', 'nailHeadHeight', 'overlap', 'plate', 'wall'];

const FILAMENTS = ['Saffron', 'Cream', 'Rose', 'Sage', 'Blue', 'Charcoal', 'Midnight blue'];

const K = {
  balloon: 'BalloonStudio.parameters.v1',
  pattern: 'BalloonStudio.pattern.v1',
  purge: 'BalloonStudio.purge.v1',
  basket: 'BalloonStudio.basket.v1',
  ring: 'BalloonStudio.ring.v1',
  cloud: 'BalloonStudio.cloud.v1',
  sun: 'BalloonStudio.sun.v1',
  figure: 'BalloonStudio.figure.v1',
  clip: 'BalloonStudio.cableClip.v1',
} as const;

/** Opens a balloon the app's own generator built: a plain STL (reconstruction) or one with the settings header. */
async function openGeneratedBalloon(page: Page, name: string, kind: 'plain' | 'studio'): Promise<void> {
  const base64 = await page.evaluate(async (flavor) => {
    const load = (path: string) => import(/* @vite-ignore */ `/balloon-studio/src/core/${path}`);
    const [{ generate }, { exportSTL }, { binarySTL }, stores] = await Promise.all([load('balloon/balloonGenerator.ts'), load('balloon/balloonStl.ts'), load('io/binaryStl.ts'), import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string)]);
    const p = stores.useBalloonStore.getState().parameters;
    const mesh = generate(p);
    const bytes: Uint8Array = flavor === 'plain' ? binarySTL(mesh) : exportSTL(mesh, p);
    let text = '';
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(text);
  }, kind);
  await page.getByTestId('openFileInput').setInputFiles({ name, mimeType: 'model/stl', buffer: Buffer.from(base64, 'base64') });
  await page.locator('dialog[open]').waitFor({ timeout: 60_000 });
}

// ---- Shell ----

const shell: Scene[] = [
  {
    tab: 'Balloon',
    part: 'App shell',
    title: 'Header',
    rows: [
      T('Balloon Studio', { needle: 'Text("Balloon Studio")', webNeedle: 'app-header__name' }),
      T('A little shape. A lot of possibility.'),
      G('Part', ['Balloon', 'Basket', 'Ring', 'Cloud', 'Sun', 'Figures', 'Cable clip'], 'Balloon', { needle: 'case balloon="Balloon"', webNeedle: 'label="Part"' }),
      B('Open…', { testId: 'openFile', help: 'Choose a balloon STL, cloud-settings.json, or sun-settings.json from an exported lamp kit.', webNeedle: "'Open…'" }),
      T('Made for your P2S'),
      B('Reset part', { testId: 'resetPart', needle: 'Reset Current Part', webNeedle: 'Reset part', decided: ALT_N }),
      Do('Control', 'While a file loads the button reads “Opening…” and is disabled', 'Opening…', async (page) => {
        await page.evaluate(async () => {
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          stores.useImportStore.setState({ loading: true });
        });
        await expect(page.getByTestId('openFile')).toContainText('Opening…');
        await expect(page.getByTestId('openFile')).toBeDisabled();
        await page.evaluate(async () => {
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          stores.useImportStore.setState({ loading: false });
        });
      }, { webNeedle: "'Opening…'" }),
      Do('Control', 'Menu item “About Balloon Studio” → the mark opens the About panel', 'About Balloon Studio', async (page) => {
        await page.getByRole('button', { name: 'About Balloon Studio', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Balloon Studio', exact: true });
        await expect(dialog).toContainText('Version');
        await expect(dialog).toContainText('Parametric balloons, baskets, mobile rings, hanging figures, cloud and sun lamps and cable clips for 3D printing.');
        await expect(dialog).toContainText('Built for the Bambu Lab P2S.');
        await expect(dialog).toContainText('All dimensions are in millimetres.');
        await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      }, { decided: 'Plan §6 / WP-U5: the web has no menu bar; the About panel opens from the mark.', webNeedle: 'About Balloon Studio' }),
      Do('Control', 'Commit on tab change: a typed value is applied before the tab switches', 'commitBalloonEditing', async (page) => {
        const field = page.getByRole('textbox', { name: 'Widest diameter', exact: true });
        await field.fill('190');
        await page.getByRole('radio', { name: 'Basket', exact: true }).click();
        await page.getByRole('radio', { name: 'Balloon', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Widest diameter', exact: true })).toHaveValue('190');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { webNeedle: 'commitEditing' }),
      Do('Control', 'Window minimum 980×730: a smaller window scrolls instead of squeezing', 'minWidth:980,minHeight:730', async (page) => {
        const size = await page.locator('.app').evaluate((app) => { const s = getComputedStyle(app); return [s.minWidth, s.minHeight]; });
        expect(size).toEqual(['980px', '730px']);
      }, { webNeedle: 'min-width: 980px' }),
      Do('Readout', 'Number field shows “.” whatever the locale; accepts “,” and “.”', 'decimalSeparator', async (page) => {
        const field = page.getByRole('textbox', { name: 'Wall thickness', exact: true }).or(page.getByRole('textbox', { name: 'Panel depth', exact: true })).first();
        await field.fill('1,5');
        await field.press('Enter');
        await expect(field).toHaveValue('1.5');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { decided: 'Plan §6: fixed “.” display; input takes both.', webNeedle: 'parseDecimal' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'App shell',
    title: 'Open',
    rows: [
      Do('Warning', 'Alert “Couldn’t open file”: “Choose a balloon STL or a cloud or sun settings JSON file.”', 'Choose a balloon STL or a cloud or sun', async (page) => {
        await page.getByTestId('openFileInput').setInputFiles({ name: 'x.obj', mimeType: 'text/plain', buffer: Buffer.from('x') });
        const dialog = page.getByRole('alertdialog', { name: 'Couldn’t open file', exact: true });
        await expect(dialog).toContainText('Choose a balloon STL or a cloud or sun settings JSON file.');
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
      }),
      Do('Warning', 'Broken lamp settings JSON: the alert shows the decoder’s text', 'contain valid cloud or sun lamp settings', async (page) => {
        await page.getByTestId('openFileInput').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
        const dialog = page.getByRole('alertdialog', { name: 'Couldn’t open file', exact: true });
        await expect(dialog).toContainText('This file doesn’t contain valid cloud or sun lamp settings. Choose cloud-settings.json or sun-settings.json from an exported lamp kit.');
        await page.keyboard.press('Escape');
      }, { webNeedle: 'lampSettings' }),
      Do('Control', 'Drag over the window shows the panel’s title and message', 'Open Balloon or Lamp Settings', async (page) => {
        await page.evaluate(() => {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(new File(['x'], 'x.stl'));
          window.dispatchEvent(new DragEvent('dragenter', { dataTransfer, bubbles: true, cancelable: true }));
        });
        const overlay = page.getByTestId('dropZone');
        await expect(overlay).toContainText('Open Balloon or Lamp Settings');
        await expect(overlay).toContainText('Choose a balloon STL, cloud-settings.json, or sun-settings.json from an exported lamp kit.');
        await page.evaluate(() => {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(new File(['x'], 'x.stl'));
          window.dispatchEvent(new DragEvent('dragleave', { dataTransfer, bubbles: true, cancelable: true }));
        });
        await expect(overlay).toHaveCount(0);
      }, { decided: 'Plan §6: file input plus a drop overlay with the Mac panel’s message instead of NSOpenPanel.' }),
      Do('Control', 'Lamp settings JSON switches to its tab', 'loadLampSettings', async (page) => {
        const json = JSON.stringify({ kind: 'sun', width: 240, depth: 22, diffuserThickness: 1.2, sunStyle: 'cones' });
        await page.getByTestId('openFileInput').setInputFiles({ name: 'sun-settings.json', mimeType: 'application/json', buffer: Buffer.from(json) });
        await expect(page.getByRole('radio', { name: 'Sun', exact: true })).toBeChecked();
        await expect(page.getByRole('textbox', { name: 'Diameter including rays', exact: true })).toHaveValue('240');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
        await page.getByRole('radio', { name: 'Balloon', exact: true }).click();
      }, { webNeedle: 'loadLampSettings' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'App shell',
    title: 'Import review (a reconstructed STL)',
    setup: async (page) => openGeneratedBalloon(page, 'plain.stl', 'plain'),
    rows: [
      T('Review reconstructed balloon', { needle: 'Review reconstructed balloon' }),
      T('plain.stl', { needle: 'review.url.lastPathComponent', webNeedle: 'open-review__name' }),
      T('Opened STL'),
      T('Editable balloon', { needle: '"Editable balloon"', webNeedle: 'title="Editable balloon"' }),
      Do('Preview', 'Two stages, each 300 high, with sizes “x × y × z mm”', '%.1f × %.1f × %.1f mm', async (page) => {
        const dialog = page.locator('dialog[open]');
        await expect(dialog.getByTestId('stage')).toHaveCount(2);
        await expect(dialog.locator('.open-review__size').first()).toHaveText(/^\d+\.\d × \d+\.\d × \d+\.\d mm$/);
        expect(Math.round((await dialog.locator('.open-review__stage').first().boundingBox())!.height)).toBe(300);
      }, { webNeedle: 'open-review__size' }),
      Do('Control', 'Checkbox “Wireframe”', 'Toggle("Wireframe",isOn:$wireframe)', async (page) => {
        await expect(page.locator('dialog[open]').getByRole('checkbox', { name: 'Wireframe', exact: true })).toBeVisible();
      }, { webNeedle: 'setWireframe' }),
      Do('Control', 'Button “Reset views”', 'Reset views', async (page) => {
        await expect(page.locator('dialog[open]').getByRole('button', { name: 'Reset views', exact: true })).toBeVisible();
      }),
      T('Estimated settings · review before editing'),
      T('Continue to adjust the balloon’s shape, hollow walls, string holes, hanging loop, and patterns. This replaces the current balloon settings. The source file stays unchanged until you explicitly export over it.'),
      Do('Control', 'Button “Cancel”', '"Cancel"', async (page) => {
        await expect(page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
      }, { webNeedle: '>Cancel<' }),
      Do('Control', 'Esc cancels (.cancelAction)', '.cancelAction', async (page) => {
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Your envelope', exact: true })).toBeVisible();
      }, { webNeedle: 'onCancel' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'App shell',
    title: 'Import review (an STL with its settings)',
    only: 'real',
    setup: async (page) => openGeneratedBalloon(page, 'restored.stl', 'studio'),
    rows: [
      T('Open editable balloon', { needle: 'Open editable balloon' }),
      T('Recovered settings', { needle: '"Recovered settings"', webNeedle: "'Recovered settings'" }),
      Do('Control', 'Enter uses the balloon (.defaultAction): settings replaced, title “Editable balloon”', 'Use Editable Balloon', async (page) => {
        await expect(page.getByTestId('useEditableBalloon')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Editable balloon', exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Widest diameter', exact: true })).toHaveValue('180');
      }),
    ],
  },
];

// ---- Balloon ----

const BALLOON_METRICS = [M('DIAMETER', '180', 'mm'), M('TOTAL HEIGHT', '220.0', 'mm')];

const balloon: Scene[] = [
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'Defaults (Classic, solid)',
    rows: [
      T('START WITH A SHAPE'),
      Do('Control', 'Presets Classic · Round · Tall; the current shape is lit', 'preset("Classic",.classic)', async (page) => {
        const lit = (name: string) => page.getByRole('button', { name, exact: true });
        await expect(lit('Classic')).toHaveAttribute('aria-pressed', 'true');
        await expect(lit('Round')).toHaveAttribute('aria-pressed', 'false');
        await expect(lit('Tall')).toHaveAttribute('aria-pressed', 'false');
      }, { webNeedle: 'title="Classic"' }),
      Do('Control', 'Preset Round: 190 × 190, 16 panels, depth 4, neck 34/6, shoulder 57', 'static let round', async (page) => {
        await page.getByRole('button', { name: 'Round', exact: true }).click();
        for (const [title, value] of [['Envelope height', '190'], ['Widest diameter', '190'], ['Vertical panels', '16'], ['Panel depth', '4'], ['Neck diameter', '34'], ['Neck height', '6'], ['Shoulder height', '57']] as const) {
          await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(value);
        }
        await expect(page.getByRole('button', { name: 'Round', exact: true })).toHaveAttribute('aria-pressed', 'true');
      }, { webNeedle: 'title="Round"' }),
      Do('Control', 'Preset Tall: 245 × 160, 24 panels, depth 5, neck 28/8, shoulder 68', 'static let tall', async (page) => {
        await page.getByRole('button', { name: 'Tall', exact: true }).click();
        for (const [title, value] of [['Envelope height', '245'], ['Widest diameter', '160'], ['Vertical panels', '24'], ['Panel depth', '5'], ['Neck diameter', '28'], ['Neck height', '8'], ['Shoulder height', '68']] as const) {
          await expect(page.getByRole('textbox', { name: title, exact: true })).toHaveValue(value);
        }
        await page.getByRole('button', { name: 'Classic', exact: true }).click();
      }, { webNeedle: 'title="Tall"' }),
      C('Hollow for LEDs', { role: 'switch', testId: 'hollowMode', checked: false }),
      T('DIMENSIONS'),
      P('Envelope height', 80, 250, 1, 'mm', { value: '220' }),
      P('Widest diameter', 60, 240, 1, 'mm', { value: '180' }),
      T('PATTERN & COLOR'),
      S('Pattern', ['Solid', 'Horizontal stripes', 'Hearts', 'Polka dots', 'Diamonds', 'Text', 'Night Flight', 'Summit Cable Car'], 'Solid', { testId: 'patternStyle', needle: 'Picker("Pattern"', webNeedle: 'label="Pattern"' }),
      T('ENVELOPE'),
      P('Vertical panels', 8, 32, 4, '', { value: '20', help: '8 to 32 panels, in groups of four, for a symmetric envelope.' }),
      P('Panel depth', 0, 8, 0.5, '%', { value: '4', help: 'Depth of the grooves as a percentage of the radius. Zero makes a smooth envelope.' }),
      P('Shoulder height', 50, 75, 1, '%', { value: '65', help: 'Where the balloon reaches its widest point, measured from the bottom.' }),
      T('FLAT BASE', { needle: '"FLAT BASE"', webNeedle: "'FLAT BASE'" }),
      P('Neck diameter', 12, 80, 1, 'mm', { value: '32' }),
      P('Neck height', 3, 20, 1, 'mm', { value: '6' }),
      T('ATTACHMENTS'),
      C('Basket string holes', { testId: 'basketAttachments', checked: false }),
      C('Ceiling hanging loop', { testId: 'ceilingAttachment', checked: false }),
      T('Closed envelope, no basket. Choose wall thickness and infill in your slicer.'),
      B('Export STL…', { testId: 'exportBalloon', needle: 'Export \\(model.exportFormat)…', webNeedle: 'Export ${format}…', kind: 'Export' }),
      T('⌘E', { kind: 'Export', needle: '"⌘E"', webNeedle: 'modKeyLabel()' }),
      T('STL · millimetres · checked before export', { kind: 'Export', needle: 'millimetres · checked before export', webNeedle: 'millimetres · checked before export' }),
      T('Your envelope'),
      statusRow(),
      stageRow(/balloon/),
      T('Fits P2S', { needle: '"Fits P2S"', webNeedle: '>Fits P2S<' }),
      T('256³ mm'),
      editorHint(),
      Do('Preview', 'Reset camera (help and label): undoes an orbit', 'Reset camera', resetAfterOrbit('Reset camera')),
      Not('View opening', 'solid without holes has no neck button', { kind: 'Preview' }),
      Not('View hanger', 'no hanger, no hanger button', { kind: 'Preview' }),
      Do('Preview', 'Four preview colors with help and label', 'colorNames=["Saffron","Sage","Porcelain","Rose"]', async (page) => {
        for (const name of ['Saffron', 'Sage', 'Porcelain', 'Rose']) {
          await expect(page.getByRole('button', { name: `${name} preview color`, exact: true })).toHaveAttribute('title', `${name} · preview color only`);
        }
      }, { webNeedle: "COLOR_NAMES" }),
      Do('Preview', 'A swatch recolors the stage', 'colorIndex=i', stageChanges(clickRole('button', 'Sage preview color'), clickRole('button', 'Saffron preview color')), { webNeedle: 'colorIndex: i' }),
      C('Build plate', { kind: 'Preview', checked: true }),
      Do('Preview', 'Build plate toggles the plate', 'Toggle("Build plate",isOn:$showPlate)', stageChanges(clickRole('checkbox', 'Build plate'), clickRole('checkbox', 'Build plate')), { webNeedle: 'showPlate }' }),
      C('Wireframe', { kind: 'Preview', checked: false }),
      Do('Preview', 'Wireframe toggles the wireframe', 'Toggle("Wireframe",isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'wireframe }' }),
      Not('Cutaway', 'solid has no cutaway', { kind: 'Preview' }),
      ...BALLOON_METRICS,
      M('PANELS', '20'),
      T('Ready to make it real'),
      T('Try 0.2 mm layers, 3 walls, 10% infill and an 8 mm brim. Print with the flat neck down.'),
      Do('Warning', 'Overhang above 45°: “Check supports in your slicer” with the ceiling of the angle, orange icon', 'Check supports in your slicer', async (page) => {
        await page.evaluate(async () => {
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const state = stores.useBalloonStore.getState();
          stores.useBalloonStore.setState({ bundle: { ...state.bundle, mesh: { ...state.bundle.mesh, maxOverhang: 51.2 } } });
        });
        const advice = page.getByTestId('balloonAdvice');
        await expect(advice).toContainText('Check supports in your slicer');
        await expect(advice).toContainText('Outward overhang reaches 52° from vertical. Inspect the sliced layers before printing.');
        await expect(advice).toHaveClass(/ui-advice--warning/);
        await expect(advice.locator('[data-symbol="exclamationmark.triangle"]')).toHaveCount(1);
      }),
      savedLine('useBalloonStore', 'File saved · Show in Finder', 'File {exported.mode}', (mode) => `File ${mode} · file.stl`),
      busyLabel('useBalloonStore', 'exportBalloon', 'Preparing STL…', true, { swift: 'Preparing \\(model.exportFormat)…', web: 'Preparing ${format}…' }),
      exportAlert('useBalloonStore', 'Export failed'),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'Hollow',
    setup: async (page) => page.getByTestId('hollowMode').check({ force: true }),
    rows: [
      P('Wall thickness', 0.8, 2.4, 0.1, 'mm', { value: '1.2', help: 'Nominal shell thickness. A small allowance protects the wall around curves and grooves.' }),
      T('Opening Ø29.6 mm', { needle: 'Opening Ø', webNeedle: 'Opening Ø' }),
      T('Open underneath for LEDs. Increase the neck diameter for a larger opening.'),
      T('NECK', { needle: '"NECK"', webNeedle: "'NECK'" }),
      T('A real shell with a closed crown and open neck. Thin, translucent filament lets the LEDs glow through.'),
      B('View opening', { kind: 'Preview', needle: '"View opening"', webNeedle: "'View opening'" }),
      Do('Preview', 'View opening ↔ Whole balloon, framing the neck', 'Whole balloon', stageChanges(clickRole('button', 'View opening'), clickRole('button', 'Whole balloon')), { webNeedle: "'Whole balloon'" }),
      C('Cutaway', { kind: 'Preview', checked: false, help: 'Preview the cavity. The exported file always contains the complete shell.', needle: 'Preview the cavity', webNeedle: 'Preview the cavity' }),
      Do('Preview', 'Cutaway cuts the shell open', 'Toggle("Cutaway",isOn:$cutaway)', stageChanges(clickRole('checkbox', 'Cutaway'), clickRole('checkbox', 'Cutaway')), { webNeedle: 'cutaway' }),
      M('LED OPENING', '29.6', 'mm'),
      T('Shell printing · 0% infill'),
      T('Use standard mode, not vase mode. Print neck down with a brim. The hollow crown may need supports; inspect your sliced layers.'),
      Do('Export', 'Save panel message, hollow', 'Hollow shell with an open neck for LEDs', panelStrings('exportBalloon', ['Hollow shell with an open neck for LEDs. Millimetres; use 0% infill and standard printing mode.'], 'Balloon-180x220mm-20panels-hollow-1.2mm.stl'), { webNeedle: 'exportTable' }),
      Do('Control', 'Hollow is in the file name', 'hollow-', async (page) => {
        expect(await coreName(page, coreMode, 'useBalloonStore', (core, p) => core.balloon.filename(p))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm.stl');
      }, { kind: 'Export', webNeedle: 'filename' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'String holes',
    setup: async (page) => page.getByTestId('basketAttachments').check(),
    rows: [
      P('Basket cord clearance', 2, 5, 0.5, 'mm', { value: '3' }),
      T('Two straight, crossing through-holes connect opposite sides of the neck. The bottom stays closed and flat.'),
      T('NECK', { needle: '"NECK"', webNeedle: "'NECK'" }),
      P('Neck diameter', 20, 80, 1, 'mm'),
      P('Neck height', 12, 20, 1, 'mm'),
      B('View neck', { kind: 'Preview', needle: '"View neck"', webNeedle: "'View neck'" }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'Hanging loop on a hollow balloon with string holes',
    setup: async (page) => {
      await page.getByTestId('hollowMode').check({ force: true });
      await page.getByTestId('basketAttachments').check();
      await page.getByTestId('ceilingAttachment').check();
    },
    rows: [
      T('Four holes in a reinforced neck, at least 12 mm tall. The LED opening stays clear.'),
      P('Hanging cord clearance', 2, 5, 0.5, 'mm', { value: '4' }),
      P('Eyelet thickness', 8, 16, 0.5, 'mm', { value: '12', help: 'Thickness from front to back along the cord hole. More material strengthens the eyelet.' }),
      P('Material around hole', 4, 8, 0.5, 'mm', { value: '6', help: 'Material beside and above the cord hole. Increasing this makes the eyelet wider and taller.' }),
      P('Base flare radius', 2.5, 5, 0.5, 'mm', { value: '4', help: 'Rounds and widens the join into the balloon. A larger flare also raises the hole to keep it clear.' }),
      P('Crown thickness', 3.4, 8, 0.2, 'mm', { value: '5', help: 'Nominal thickness under the hanger, blended into the hollow shell. A thicker crown lets less light through.' }),
      Do('Readout', 'Hanger caption with hanger height and total print height', 'Rounded eyelet on a reinforced crown', async (page) => {
        await expect(page.locator('#root')).toContainText(/Rounded eyelet on a reinforced crown\. Hanger height: \d+\.\d mm\. Total print height: \d+\.\d mm\. Envelope height is limited automatically to fit the P2S\./);
      }),
      T('Print the eyelet and its crown base solid with a local 100% infill modifier. Strength depends on the printed layers; test the finished attachment before hanging.'),
      B('View hanger', { kind: 'Preview', needle: '"View hanger"', webNeedle: "'View hanger'" }),
      Do('Preview', 'View hanger ↔ Whole balloon, framing the crown', 'inspectTop.toggle()', stageChanges(clickRole('button', 'View hanger'), clickRole('button', 'Whole balloon')), { webNeedle: 'inspectTop: !view.inspectTop' }),
      Do('Export', 'File name with hollow, tethers and hanger', '-tethers', async (page) => {
        expect(await coreName(page, coreMode, 'useBalloonStore', (core, p) => core.balloon.filename(p))).toMatch(/^Balloon-180x\d+mm-20panels-hollow-1\.2mm-tethers-hanger\.stl$/);
      }, { webNeedle: 'filename' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon · Pattern',
    title: 'Horizontal stripes',
    seed: { [K.pattern]: { style: 'Horizontal stripes' } },
    rows: [
      P('Total bands', 2, 24, 1, ''),
      T('Alternating colors from bottom to top. Fewer bands mean fewer changes.'),
      S('Base · filament 1', FILAMENTS, 'Saffron', { needle: 'Base · filament 1' }),
      S('Pattern · filament 2', FILAMENTS, 'Cream', { needle: 'Pattern · filament 2' }),
      Do('Control', 'Color choice shows a 14 px swatch', 'frame(width:14,height:14)', async (page) => {
        const swatch = page.locator('.ui-swatch').first();
        await expect(swatch).toHaveCSS('width', '14px');
      }, { webNeedle: 'ui-swatch' }),
      Do('Warning', 'Same colors: “Matching colors use one filament: no pattern color changes.”', 'Matching colors use one filament', async (page) => {
        await page.getByRole('combobox', { name: 'Pattern · filament 2', exact: true }).selectOption({ label: 'Saffron' });
        await expect(page.locator('#root')).toContainText('Matching colors use one filament: no pattern color changes.');
        await page.getByRole('combobox', { name: 'Pattern · filament 2', exact: true }).selectOption({ label: 'Cream' });
      }),
      T('3MF preserves filament painting. In Bambu Studio, map the two colors to your AMS filaments and select your P2S profile. Set the object’s default filament to your base color too.'),
      Do('Control', 'Disclosure “P2S waste assumptions”, closed by default', 'P2S waste assumptions', async (page) => {
        await expect(page.getByText('P2S waste assumptions', { exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Flush multiplier', exact: true })).toHaveCount(0);
        await page.getByText('P2S waste assumptions', { exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Flush multiplier', exact: true })).toBeVisible();
      }),
      S('Layer height', ['0.08 mm', '0.12 mm', '0.16 mm', '0.20 mm', '0.24 mm', '0.28 mm', '0.32 mm'], '0.20 mm', { needle: 'Picker("Layer height"', webNeedle: 'label="Layer height"' }),
      P('Base → pattern', 0, 1500, 10, 'mm³', { value: '400' }),
      P('Pattern → base', 0, 1500, 10, 'mm³', { value: '400' }),
      P('Flush multiplier', 0, 2, 0.1, '×', { value: '1' }),
      P('Density (g/cm³)', 0.5, 2, 0.01, '', { value: '1.24' }),
      T('400 mm³ per change is an editable example, not a measured P2S default. Copy both directional volumes and the multiplier from Bambu Studio. Use compatible filaments and match the layer height when slicing.'),
      Do('Control', 'Link “About Bambu flushing volumes”', 'About Bambu flushing volumes', async (page) => {
        await expect(page.getByRole('link', { name: 'About Bambu flushing volumes', exact: true })).toHaveAttribute('href', 'https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change');
      }),
      Do('Readout', 'Purge summary: title, grams, changes and layers', 'P2S · estimated filament poop', async (page) => {
        const summary = page.getByTestId('purgeSummary');
        await expect(summary).toContainText('P2S · estimated filament poop');
        await expect(summary.locator('.balloon-purge__grams')).toHaveText(/^≈ \d+\.\d(–\d+\.\d)? g$/);
        await expect(summary).toContainText(/\d+(–\d+)? color changes? · \d+ layers using both colors/);
      }),
      T('Change-related chute waste only. Range reflects color ordering; excludes startup purge, prime tower and supports. Flushing into infill can reduce it. Preview estimate; confirm in Bambu Studio after slicing.'),
      Not('Saffron preview color', 'a pattern has no preview swatches', { kind: 'Preview', needle: 'model.uses3MF ? []', webNeedle: '!uses3MF' }),
      B('Export 3MF…', { testId: 'exportBalloon', kind: 'Export', needle: 'Export \\(model.exportFormat)…', webNeedle: 'Export ${format}…' }),
      T('3MF · millimetres · checked before export', { kind: 'Export', needle: 'millimetres · checked before export', webNeedle: 'millimetres · checked before export' }),
      busyLabel('useBalloonStore', 'exportBalloon', 'Preparing 3MF…', true, { swift: 'Preparing \\(model.exportFormat)…', web: 'Preparing ${format}…' }),
      Do('Export', 'Save panel strings, 3MF', 'Two filament colors with Bambu Studio paint assignments', panelStrings('exportBalloon', ['Export Balloon 3MF', 'Export 3MF', 'Two filament colors with Bambu Studio paint assignments. Select your P2S profile and map colors after opening.'], 'Balloon-180x220mm-20panels-pattern.3mf'), { webNeedle: 'exportTable' }),
      Do('Export', '3MF name: …-pattern.3mf', '"-pattern"', async (page) => {
        const name = await page.evaluate(async (mode) => {
          const { core } = await import(/* @vite-ignore */ `/balloon-studio/src/core/${mode}/parameters.ts`);
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const s = stores.useBalloonStore.getState();
          return core.balloon.exportFilename({ parameters: s.parameters, pattern: s.pattern, purge: s.purge });
        }, coreMode);
        expect(name).toBe('Balloon-180x220mm-20panels-pattern.3mf');
      }, { webNeedle: 'exportFilename' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon · Pattern',
    title: 'Hearts (the motif patterns)',
    seed: { [K.pattern]: { style: 'Hearts' } },
    rows: [
      P('Shapes per row', 1, 24, 1, '', { value: '8' }),
      P('Rows', 1, 6, 1, '', { value: '2' }),
      P('Shape size', 3, null, 1, 'mm'),
      T('16 shapes. Size is limited to keep them apart. More rows or taller shapes usually add waste; more shapes on the same layers need not.', { needle: 'shapes. Size is limited', webNeedle: 'shapes. Size is limited' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon · Pattern',
    title: 'Text',
    seed: { [K.pattern]: { style: 'Text', text: '' } },
    rows: [
      T('Your text'),
      Do('Control', 'Text field “Name or message”, label “Balloon text”, up to 64 characters', 'Name or message', async (page) => {
        const field = page.getByTestId('balloonText');
        await expect(field).toHaveAttribute('placeholder', 'Name or message');
        await expect(field).toHaveAccessibleName('Balloon text');
      }),
      S('Font', ['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced'], 'Rounded', { testId: 'balloonTextFont', needle: 'Picker("Font"', webNeedle: 'label="Font"', decided: 'Plan §7: bundled OFL fonts replace the Apple fonts behind the same names.' }),
      P('Repeats around balloon', 1, 24, 1, ''),
      P('Text height', 3, null, 1, 'mm'),
      Do('Readout', 'Copies caption', 'evenly spaced in one row', async (page) => {
        await expect(page.locator('#root')).toContainText(/\d+ cop(y|ies), evenly spaced in one row\. Long messages shrink to fit\. Use fewer repeats for larger letters\. Up to 64 characters\./);
      }),
      W2('Enter a name or message to add lettering.'),
      Do('Readout', 'Hint on glyphs the bundled fonts lack', null, async (page) => {
        expect(await page.getByTestId('balloonText').count()).toBe(1);
      }, { open: { owner: 'WP-R7', note: '`BalloonPreview.missingGlyphs` has no UI hint yet; the plan gives R7 the text, it goes into `PatternEditor.tsx`.' }, webNeedle: 'balloon-text-field' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon · Pattern',
    title: 'Night Flight',
    seed: { [K.pattern]: { style: 'Night Flight' } },
    rows: [
      T('Little aviators at night'),
      T('Two detailed vintage planes on opposite sides, with looping flight paths, soft cloud banks, a clean crescent moon and stars. Raised artwork shares the body color; the cap adds one planned filament change.'),
      P('Relief depth', 1.2, 4, 0.1, 'mm'),
      P('Cap height', 10, 28, 1, '%'),
      T('Sculpted shapes bridge the panel grooves to keep their outlines clear. Depth is measured above the panel crests. The cap includes the hanger. Check relief edges and supports in the slicer.'),
      S('Body & relief · filament 1', FILAMENTS, 'Cream', { needle: 'Body & relief · filament 1' }),
      S('Cap · filament 2', FILAMENTS, 'Midnight blue', { needle: 'Cap · filament 2' }),
      M('DIAMETER', /^\d+\.\d$/, 'mm'),
      Do('Export', '3MF name: …-night-flight.3mf', '"-night-flight"', async (page) => {
        const name = await page.evaluate(async (mode) => {
          const { core } = await import(/* @vite-ignore */ `/balloon-studio/src/core/${mode}/parameters.ts`);
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const s = stores.useBalloonStore.getState();
          return core.balloon.exportFilename({ parameters: s.parameters, pattern: s.pattern, purge: s.purge });
        }, coreMode);
        expect(name).toBe('Balloon-180x220mm-20panels-night-flight.3mf');
      }, { webNeedle: 'exportFilename' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon · Pattern',
    title: 'Summit Cable Car',
    seed: { [K.pattern]: { style: 'Summit Cable Car' } },
    rows: [
      T('A night ride between two peaks'),
      T('Two summits on opposite sides, each with a timber station and its bullwheels on the peak. The cable swings between them, and on each rise a vintage Swiss cabin climbs with a family and their dog at the windows. Faceted mountains with snow caps and a hiking trail, firs and a chalet in the valley, a crescent moon, clouds and stars. Raised artwork shares the body color; the cap adds one planned filament change.'),
      Do('Export', '3MF name: …-summit-cable-car.3mf', '"-summit-cable-car"', async (page) => {
        const name = await page.evaluate(async (mode) => {
          const { core } = await import(/* @vite-ignore */ `/balloon-studio/src/core/${mode}/parameters.ts`);
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const s = stores.useBalloonStore.getState();
          return core.balloon.exportFilename({ parameters: s.parameters, pattern: s.pattern, purge: s.purge });
        }, coreMode);
        expect(name).toBe('Balloon-180x220mm-20panels-summit-cable-car.3mf');
      }, { webNeedle: 'exportFilename' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'Export, shortcuts, persistence',
    rows: [
      fileName('Suggested name, solid', 'var filename: String', 'useBalloonStore', 'Balloon-180x220mm-20panels.stl', (core, p) => core.balloon.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export Balloon \\(format)', panelStrings('exportBalloon', ['Export Balloon STL', 'Export STL', 'A closed, printable envelope in millimetres. Set walls and infill in your slicer.'], 'Balloon-180x220mm-20panels.stl'), { webNeedle: 'exportTable' }),
      Do('Shortcut', '⌘E / Ctrl+E exports', 'keyboardShortcut("e")', exportShortcut('exportBalloon'), { webNeedle: 'onExport' }),
      Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
      Do('Shortcut', 'Reset: Alt+N → Classic', 'keyboardShortcut("n")', resetShortcut('Widest diameter', '200', '180'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.balloon}: written at once, Mac JSON keys, survives a reload`, K.balloon, persists(K.balloon, 'Balloon', 'Widest diameter', '205', 'diameter', BALLOON_KEYS), { webNeedle: 'parameters.v1' }),
      Do('Persistence', 'Stored Mac JSON loads: legacy `{"height":215,…}`', 'decodeIfPresent', loadsMacJson(K.balloon, { height: 215, diameter: 170, panels: 16, panelDepth: 4, shoulder: 60, neckDiameter: 30, neckHeight: 6 }, 'Balloon', 'Envelope height', '215'), { webNeedle: 'decode' }),
    ],
  },
  {
    tab: 'Balloon',
    part: 'Balloon',
    title: 'Pattern and purge persistence',
    seed: { [K.pattern]: { style: 'Horizontal stripes' } },
    rows: [
      Do('Persistence', `${K.pattern}: written at once, Mac JSON keys, survives a reload`, K.pattern, persists(K.pattern, 'Balloon', 'Total bands', '8', 'bands', PATTERN_KEYS), { webNeedle: 'pattern.v1' }),
      Do('Persistence', `${K.purge}: written at once, Mac JSON keys, survives a reload`, K.purge, async (page) => {
        await page.getByText('P2S waste assumptions', { exact: true }).click();
        const field = page.getByRole('textbox', { name: 'Flush multiplier', exact: true });
        await field.fill('1.5');
        await field.press('Enter');
        const json = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), K.purge))!) as Record<string, unknown>;
        expect(json.multiplier).toBe(1.5);
        expect(Object.keys(json).sort()).toEqual([...PURGE_KEYS].sort());
        await page.reload();
        await page.getByText('P2S waste assumptions', { exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Flush multiplier', exact: true })).toHaveValue('1.5');
      }, { webNeedle: 'purge.v1' }),
    ],
  },
];

function W2(text: string): Row {
  // Plain secondary text on the Mac, listed with the warnings because it explains missing output.
  return T(text, { kind: 'Warning' });
}

// ---- Basket ----

const basket: Scene[] = [
  {
    tab: 'Basket',
    part: 'Basket',
    title: 'Defaults (Wicker)',
    rows: [
      T('CHOOSE A BASKET'),
      ...([['Wicker', 'Rounded rectangle · woven texture'], ['Ribbed', 'Round basket · vertical fluting'], ['Voyager', 'Faceted sides · broad bands']] as const).map(([title, subtitle]) =>
        Do('Control', `Style card ${title}: “${subtitle}”, label “${title} basket”`, subtitle, async (page) => {
          const card = page.getByRole('button', { name: `${title} basket`, exact: true });
          await expect(card).toContainText(title);
          await expect(card).toContainText(subtitle);
          await expect(card).toHaveAccessibleDescription(subtitle);
        })),
      Do('Control', 'Selected card lit with a checkmark', 'Image(systemName:"checkmark")', async (page) => {
        const card = page.getByRole('button', { name: 'Wicker basket', exact: true });
        await expect(card).toHaveAttribute('aria-pressed', 'true');
        await expect(card.locator('[data-symbol="checkmark"]')).toHaveCount(1);
      }, { webNeedle: 'name="checkmark"' }),
      T('DIMENSIONS'),
      B('Match balloon', { help: 'Size this basket in proportion to the current balloon.' }),
      Do('Control', 'Match balloon: width d·0.35, depth d·0.27, height h·0.19, rounded', 'balloon.diameter*0.35', async (page) => {
        await page.getByRole('button', { name: 'Match balloon', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Width', exact: true })).toHaveValue('63');
        await expect(page.getByRole('textbox', { name: 'Depth', exact: true })).toHaveValue('49');
        await expect(page.getByRole('textbox', { name: 'Basket height', exact: true })).toHaveValue('42');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { webNeedle: 'match' }),
      P('Width', 40, 100, 1, 'mm', { value: '64', needle: '"Diameter":"Width"', webNeedle: "'Diameter' : 'Width'" }),
      P('Depth', 30, 90, 1, 'mm', { value: '48' }),
      P('Basket height', 24, 70, 1, 'mm', { value: '42' }),
      P('Basket wall', 1.6, 3.2, 0.2, 'mm', { value: '2.4' }),
      P('Surface detail', 0, 1, 0.1, '', { value: '0.7' }),
      T('STRING ATTACHMENTS'),
      P('Cord clearance', 2, 5, 0.5, 'mm', { value: '3' }),
      T('Four round holes with beveled edges, one on each side. Choose clearance larger than your string.'),
      B('Add matching balloon holes', { needle: '"Add matching balloon holes"', webNeedle: "'Add matching balloon holes'" }),
      T('Works with filled and hollow balloons. The neck may become taller or wider. Export the updated balloon separately.'),
      Do('Control', 'Cross-model button: adds the holes to the balloon, then reads “Balloon holes match”', 'Balloon holes match', async (page) => {
        await page.getByRole('button', { name: 'Add matching balloon holes', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Balloon holes match', exact: true })).toBeVisible();
        expect((await storeRead<{ stringHoles: boolean }>(page, 'useBalloonStore', 'parameters')).stringHoles).toBe(true);
      }, { webNeedle: "'Balloon holes match'" }),
      B('Export Basket STL…', { testId: 'exportBasket', kind: 'Export' }),
      T('Separate STL · four string holes · millimetres', { kind: 'Export' }),
      T('Wicker basket', { needle: '\\(model.parameters.style.title) basket', webNeedle: 'basket</h2>' }),
      statusRow(),
      stageRow(/./),
      T('4 cord holes · open top', { kind: 'Preview' }),
      editorHint(),
      Do('Preview', 'Reset basket camera (help): undoes an orbit', 'Reset basket camera', resetAfterOrbit('Reset basket camera')),
      Do('Preview', 'Three preview colours, help “Preview colour only”', 'Preview colour only', async (page) => {
        for (const i of [1, 2, 3]) await expect(page.getByRole('button', { name: `Preview colour ${i}`, exact: true })).toHaveAttribute('title', 'Preview colour only');
      }),
      Do('Preview', 'A swatch recolors the stage', 'colorIndex=i', stageChanges(clickRole('button', 'Preview colour 2'), clickRole('button', 'Preview colour 1')), { webNeedle: 'setColorIndex(index)' }),
      Do('Preview', 'Cutaway (off by default) cuts the basket', 'Toggle("Cutaway",isOn:$cutaway)', stageChanges(clickRole('checkbox', 'Cutaway'), clickRole('checkbox', 'Cutaway')), { webNeedle: 'setCutaway' }),
      Do('Preview', 'Build plate (on by default)', 'Toggle("Build plate",isOn:$showPlate)', stageChanges(clickRole('checkbox', 'Build plate'), clickRole('checkbox', 'Build plate')), { webNeedle: 'setShowPlate' }),
      Do('Preview', 'Wireframe (off by default)', 'Toggle("Wireframe",isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'setWireframe' }),
      M('FOOTPRINT', '64 × 48', 'mm'),
      M('HEIGHT', '42', 'mm'),
      M('CORD CLEARANCE', '3', 'mm'),
      T('Print separately, then string together'),
      T('Print flat base down. Tie four equal-length strings through the basket holes and the matching balloon neck holes.'),
      savedLine('useBasketStore', 'Basket saved · Show in Finder', 'savedPrefix="Basket"', (mode) => `Basket ${mode} · file.stl`),
      busyLabel('useBasketStore', 'exportBasket', 'Preparing basket…', true),
      exportAlert('useBasketStore', 'Basket export failed'),
      fileName('Suggested name', 'Basket-\\(style.rawValue)', 'useBasketStore', 'Basket-wicker-64x48x42mm.stl', (core, p) => core.basket.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export Basket STL', panelStrings('exportBasket', ['Export Basket STL', 'Export Basket', 'A separate open-top basket with four cord holes. Millimetres; print flat base down.'], 'Basket-wicker-64x48x42mm.stl'), { webNeedle: 'exportTable' }),
      Do('Shortcut', '⌘E / Ctrl+E exports', 'keyboardShortcut("e")', exportShortcut('exportBasket'), { webNeedle: 'onExport' }),
      Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
      Do('Shortcut', 'Reset: Alt+N → defaults', 'case .basket:basket.apply(BasketParameters())', resetShortcut('Basket height', '50', '42'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.basket}: written at once, Mac JSON keys, survives a reload`, K.basket, persists(K.basket, 'Basket', 'Basket height', '55', 'height', BASKET_KEYS), { webNeedle: 'basket.v1' }),
    ],
  },
  {
    tab: 'Basket',
    part: 'Basket',
    title: 'Ribbed',
    seed: { [K.basket]: { style: 'ribbed', width: 64, depth: 48, height: 42, wallThickness: 2.4, texture: 0.7, cordClearance: 3 } },
    rows: [
      P('Diameter', 40, 100, 1, 'mm', { needle: '"Diameter":"Width"', webNeedle: "'Diameter' : 'Width'" }),
      Do('Control', 'Ribbed hides Depth', 'model.parameters.style != .ribbed', async (page) => {
        await expect(page.getByRole('textbox', { name: 'Depth', exact: true })).toHaveCount(0);
      }, { webNeedle: "parameters.style !== 'ribbed'" }),
      T('Ribbed basket', { needle: '\\(model.parameters.style.title) basket', webNeedle: 'basket</h2>' }),
      M('FOOTPRINT', '64 × 64', 'mm'),
    ],
  },
  { tab: 'Basket', part: 'Basket', title: 'Voyager', seed: { [K.basket]: { style: 'voyager', width: 64, depth: 48, height: 42, wallThickness: 2.4, texture: 0.7, cordClearance: 3 } }, rows: [T('Voyager basket', { needle: '\\(model.parameters.style.title) basket', webNeedle: 'basket</h2>' }), fileName('Suggested name', 'Basket-\\(style.rawValue)', 'useBasketStore', 'Basket-voyager-64x48x42mm.stl', (core, p) => core.basket.filename(p))] },
];

// ---- Ring ----

const RING_VIEWS = ['Assembled ring', 'A · Cord guide · print 3', 'B · Plain section · print 3', 'C · Joint plate · print 6', 'D · Alignment pin · print 12'];
const RING_FLAT = { diameter: 240, bandWidth: 18, height: 6, cordClearance: 3, ledClearance: 0.4, channelDepth: 1.5, segmented: false, jointFit: 0.3, reflectedLED: false, stripWidth: 3.5, stripThickness: 3 };
const RING_LARGE = { diameter: 450, bandWidth: 40, height: 12, cordClearance: 6, ledClearance: 0.5, channelDepth: 1.5, segmented: true, jointFit: 0.3, reflectedLED: true, stripWidth: 8, stripThickness: 3 };
const metricValue = (page: Page, title: string) => page.locator('.ui-metric').filter({ has: page.getByRole('term').getByText(title, { exact: true }) }).locator('.ui-metric__number');

const ring: Scene[] = [
  {
    tab: 'Ring',
    part: 'Ring',
    title: 'Defaults (solid, reflected uplight, 450 mm)',
    rows: [
      T('A MOBILE FOR THREE'),
      G('Construction', ['One piece', 'Six sections'], 'One piece', { testId: 'ringConstruction', needle: 'Picker("Construction"', webNeedle: 'label="Construction"' }),
      T('One ring. Three balloons.'),
      T('One continuous ring with three ceiling holes, three balloon holes and a raised reflector for an upright LED strip.'),
      T('RING DIMENSIONS'),
      P('Ring diameter', 140, 600, 1, 'mm', { value: '450' }),
      P('Band width', 35, 60, 1, 'mm', { value: '40' }),
      P('Base thickness', 8, 16, 0.5, 'mm', { value: '12', needle: '"Base thickness"', webNeedle: "'Base thickness'" }),
      T('With the raised light trough: 22.5 mm tall.', { needle: 'With the raised light trough', webNeedle: 'With the raised light trough' }),
      T('Full-size model · exceeds the P2S bed. Set the diameter to 240 mm for a test print while keeping the LED mount full size.'),
      B('Use 240 mm for a test print'),
      B('Printing & lighting guide', { testId: 'ringAssemblyGuide', webNeedle: 'Printing &amp; lighting guide' }),
      T('LED mounting'),
      S('Light mount', ['Reflected uplight', 'Flat top channel'], 'Reflected uplight', { testId: 'ringLightMount', needle: 'Picker("Light mount"', webNeedle: 'label="Light mount"' }),
      P('LED strip width', 3.5, 12, 0.5, 'mm', { value: '8' }),
      P('LED fit allowance', 0.2, 1, 0.1, 'mm', { value: '0.5' }),
      P('Strip thickness incl. LEDs', 1, 6, 0.5, 'mm', { value: '3' }),
      T('UPWARD LIGHT · CROSS SECTION'),
      T('Ring centre'),
      T('Outer wall · LED'),
      A('img', 'Radial cross section: the strip stands vertically against the outer wall on a ledge. It faces a 45 degree white reflector with an inner shielding lip. Light escapes through the open top; the solid floor blocks direct sight from below. The arrow is schematic, not an optical simulation.', { kind: 'Readout', needle: 'Radial cross section' }),
      Do('Readout', 'LED reflector diagram, 155 high', 'LEDReflectorDiagram(parameters:model.parameters).frame(height:155)', async (page) => {
        expect(Math.round((await page.locator('.ring-reflector').boundingBox())!.height)).toBe(155);
      }, { webNeedle: 'LEDReflectorDiagram parameters' }),
      T('One continuous strip, upright on the outer wall. Green marks the mounting face. The ledge supports its lower edge; the white 45° slope scatters light upward.'),
      T('The floor and inner lip screen the LEDs from below. White PLA may still glow through: check a printed prototype for opacity and LED heat. Thickness includes LEDs, coating and mounting tape.', { needle: 'The floor and inner lip screen' }),
      T('STRING ATTACHMENTS'),
      P('Ring cord clearance', 4, 8, 0.5, 'mm', { value: '6' }),
      T('Six bevelled through-holes, alternating around the ring: three for ceiling suspension and three for the balloons. Each group is spaced 120° apart, with a 60° offset between groups.'),
      T('Separate balloon cords put their full weight through the ring. The planned 3 × 1 kg load has not been validated; test the printed ring and attachments before overhead use.'),
      B('Export Ring STL…', { testId: 'exportRing', kind: 'Export', needle: '"Export Ring STL…"', webNeedle: "'Export Ring STL…'" }),
      T('STL · millimetres · checked before export', { kind: 'Export', needle: '"STL · millimetres · checked before export"', webNeedle: "'STL · millimetres · checked before export'" }),
      T('Your solid ring'),
      statusRow(),
      stageRow(/mobile ring/),
      T('450 mm solid ring · exceeds P2S bed', { kind: 'Warning', needle: 'mm solid ring · exceeds P2S bed', webNeedle: 'mm solid ring · exceeds P2S bed' }),
      editorHint(),
      Do('Preview', 'Top view ↔ Angled view', 'topDown ? "Angled view":"Top view"', stageChanges(clickRole('button', 'Top view'), clickRole('button', 'Angled view')), { webNeedle: "'Angled view' : 'Top view'" }),
      Do('Preview', 'Reset ring camera (help): undoes an orbit', 'Reset ring camera', resetAfterOrbit('Reset ring camera')),
      T('Print flat · channel up', { kind: 'Preview', needle: '"Print flat · channel up"', webNeedle: "'Print flat · channel up'" }),
      Do('Preview', 'Build plate (on by default)', 'Toggle("Build plate",isOn:$showPlate)', stageChanges(clickRole('checkbox', 'Build plate'), clickRole('checkbox', 'Build plate')), { webNeedle: 'setShowPlate' }),
      Do('Preview', 'Wireframe (off by default)', 'Toggle("Wireframe",isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'setWireframe' }),
      M('RING DIAMETER', '450', 'mm', { needle: '"RING DIAMETER"', webNeedle: "'RING DIAMETER'" }),
      M('LED STRIP', '8', 'mm wide', { needle: '"LED STRIP"', webNeedle: "'LED STRIP'" }),
      M('STRIP PATH ≈', '1399', 'mm', { needle: '"STRIP PATH ≈"', webNeedle: "'STRIP PATH ≈'" }),
      T('3 ceiling holes + 3 balloon holes'),
      T('Alternate ceiling and balloon cords around the ring. Join the three ceiling cords above it; attach a balloon to each of the three holes in between.'),
      T('6 bevelled attachment holes · 8 mm LED strip · ring carries balloon weight', { needle: '6 bevelled attachment holes', webNeedle: '6 bevelled attachment holes' }),
      A('img', 'Six attachment holes alternate around the ring: three ceiling suspension cords meet above it, and three separate balloon cords hang from the holes in between.', { kind: 'Readout', needle: 'Six attachment holes alternate around the ring' }),
      Do('Control', 'Use 240 mm for a test print sets the diameter', 'p.diameter=240', async (page) => {
        await page.getByRole('button', { name: 'Use 240 mm for a test print', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Ring diameter', exact: true })).toHaveValue('240');
        await settle(page);
        await expect(page.locator('#root')).toContainText('Fits P2S · flat underside on the bed');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { webNeedle: "setField('diameter', 240)" }),
      Do('Control', 'Guide sheet: title, text, Done; Esc closes', 'Solid ring · printing & lighting', async (page) => {
        await page.getByTestId('ringAssemblyGuide').click();
        const sheet = page.getByRole('dialog', { name: 'Solid ring · printing & lighting', exact: true });
        for (const line of [
          '1 · Choose a print size',
          'Export saves one continuous STL, with a flat underside. The 450 mm design exceeds the 256 mm P2S bed. Set the diameter to 240 mm in the app for a smaller test ring; the LED mount and cord clearances retain their size. Do not scale the STL in the slicer, as that changes those clearances. Print trough-up at 100% scale. Start with 0.2 mm layers, 6 walls, 6 top/bottom layers and 40% infill as prototype settings, not a load rating.',
          '2 · Attach ceiling and balloon cords',
          'Use every other hole for ceiling suspension and the three holes in between for the balloons. Each group forms a triangle with holes 120° apart; the groups are offset by 60°. Join the three ceiling cords above the ring at suitable ceiling hardware. Tie a separate balloon cord to each remaining hole. The ring now carries the full balloon load, as well as its own weight and the LEDs. The printed ring and balloon attachments have not been load-tested for the planned 3 × 1 kg.',
          '3 · Add the light',
          'Mount the 8 mm strip upright on the green outer-wall face, LEDs facing the white 45° slope. The lower edge rests on the ledge; use mounting adhesive compatible with the strip and PLA. The strip curves in its natural bending direction. Follow its minimum bend radius and marked cut points, leave a small end gap and route the supply lead over the rim. The thickness setting includes LEDs, coating and mounting tape.',
          '4 · Check the printed prototype',
          "Illuminate the ring to check reflection, underside glow and temperature. White PLA scatters light but may transmit a glow, and is not a heat sink; follow the strip's cooling requirements. For the planned 3 × 1 kg balloons, test the actual printed ring, rigging and attachments at low height over a clear area, including sustained loading, deformation and cord wear. PLA can creep over time. Geometry checks do not establish a load rating.",
        ]) await expect(sheet).toContainText(line);
        const box = (await sheet.boundingBox())!;
        expect([Math.round(box.width), Math.round(box.height)]).toEqual([640, 620]);
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
      }),
      savedLine('useRingStore', 'Ring saved · Show in Finder', 'savedPrefix="Ring"', (mode) => `Ring ${mode} · file.stl`),
      busyLabel('useRingStore', 'exportRing', 'Preparing ring…', true),
      exportAlert('useRingStore', 'Ring export failed'),
      fileName('Suggested name, uplight', '-uplight-', 'useRingStore', 'Mobile-Ring-450mm-8mm-uplight-solid.stl', (core, p) => core.ring.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export Mobile Ring STL', panelStrings('exportRing', ['Export Mobile Ring STL', 'Export Ring', 'One continuous ring with three ceiling holes, three balloon holes and an upright LED mount. Print flat, trough facing up. This size exceeds the P2S bed; reduce diameter in the app for a test print.'], 'Mobile-Ring-450mm-8mm-uplight-solid.stl'), { webNeedle: 'exportTable' }),
      Do('Shortcut', '⌘E / Ctrl+E exports', 'keyboardShortcut("e")', exportShortcut('exportRing'), { webNeedle: 'onExport' }),
      Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
      Do('Shortcut', 'Reset: Alt+N → solid (one piece)', 'ring.apply(ring.parameters.segmented ? .large:.solid)', resetShortcut('Ring diameter', '300', '450'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.ring}: written at once, Mac JSON keys, survives a reload`, K.ring, persists(K.ring, 'Ring', 'Ring diameter', '320', 'diameter', RING_KEYS), { webNeedle: 'ring.v1' }),
    ],
  },
  {
    tab: 'Ring',
    part: 'Ring',
    title: 'Flat top channel, one piece, 240 mm',
    seed: { [K.ring]: RING_FLAT },
    rows: [
      T('Three balloon ties, evenly spaced around a flat ring. Three more holes suspend it from a single ceiling string.'),
      P('Ring thickness', 4, 10, 0.5, 'mm', { needle: '"Ring thickness"', webNeedle: "'Ring thickness'" }),
      P('Channel depth', 0.6, 3, 0.1, 'mm', { value: '1.5' }),
      T('Top channel: 3.9 mm wide · 4.5 mm underneath.', { needle: 'Top channel:', webNeedle: 'Top channel:' }),
      T('Use a strip designed to curve sideways. A standard strip needs straight sections joined by wires. Green marks the channel floor.'),
      P('Ring cord clearance', 2, 5, 0.5, 'mm', { value: '3' }),
      T('Six through-holes beside the LED channel. Band width grows automatically to keep material around the holes.'),
      B('Add matching balloon hanger'),
      Do('Control', 'Add matching balloon hanger sets the balloon’s loop and clearance', 'p.hangingLoop=true', async (page) => {
        await page.getByRole('button', { name: 'Add matching balloon hanger', exact: true }).click();
        const balloon = await storeRead<{ hangingLoop: boolean; hangingClearance: number }>(page, 'useBalloonStore', 'parameters');
        expect([balloon.hangingLoop, balloon.hangingClearance]).toEqual([true, 3]);
      }, { webNeedle: 'hangingLoop: true' }),
      T('Export the balloon separately. The printed eyelet has not been load-tested.'),
      T('Fits P2S · flat underside on the bed', { kind: 'Preview', needle: '"Fits P2S · flat underside on the bed"', webNeedle: "'Fits P2S · flat underside on the bed'" }),
      M('LED CHANNEL', '3.9', 'mm wide', { needle: '"LED CHANNEL"', webNeedle: "'LED CHANNEL'" }),
      Do('Readout', 'Balloon ties caption', 'Balloon ties are', async (page) => {
        await expect(page.locator('#root')).toContainText(/Balloon ties are \d+ mm apart; stagger larger balloons in height\./);
      }),
      Do('Control', 'Guide sheet, flat channel: step 3', 'The flat circular channel needs a strip designed to bend sideways', async (page) => {
        await page.getByTestId('ringAssemblyGuide').click();
        const sheet = page.getByRole('dialog', { name: 'Solid ring · printing & lighting', exact: true });
        await expect(sheet).toContainText("The flat circular channel needs a strip designed to bend sideways, or short connected sections. Follow the strip's cut points and bend limits, and route the lead over the rim.");
        await page.keyboard.press('Escape');
      }),
      fileName('Suggested name, flat', '-3-balloons.stl', 'useRingStore', 'Mobile-Ring-240mm-3-balloons.stl', (core, p) => core.ring.filename(p)),
      Do('Export', 'Save panel message, flat', 'One ring for three balloons, with six cord holes', panelStrings('exportRing', ['One ring for three balloons, with six cord holes and a top LED channel. Print flat, channel facing up.'], 'Mobile-Ring-240mm-3-balloons.stl'), { webNeedle: 'exportTable' }),
    ],
  },
  {
    tab: 'Ring',
    part: 'Ring',
    title: 'Six sections',
    seed: { [K.ring]: RING_LARGE },
    rows: [
      G('Construction', ['One piece', 'Six sections'], 'Six sections', { needle: '"Six sections"', webNeedle: "label: 'Six sections'" }),
      T('A bigger ring, printed in parts.'),
      T('Three cord-guide sections alternate with three plain sections. Glue the curved plates underneath and align with printed pins.'),
      P('Ring diameter', 300, 600, 1, 'mm', { value: '450' }),
      T('With the raised light trough: 22.5 mm tall, plus 4 mm at the joint plates.', { needle: 'plus 4 mm at the joint plates', webNeedle: 'plus 4 mm at the joint plates' }),
      T('The assembled ring is larger than the bed. Each section is rotated and centred for printing.'),
      T('PERMANENT JOINTS'),
      P('Joint fit allowance', 0.2, 0.6, 0.1, 'mm', { value: '0.3' }),
      T('Six 4 mm-thick plates bridge the seams, with about 30 mm overlap on each side. Twelve bevelled pins align the glue-up.'),
      B('Printing & assembly guide', { testId: 'ringAssemblyGuide', webNeedle: 'Printing &amp; assembly guide' }),
      T('check one printed section for opacity', { needle: 'one printed section', webNeedle: 'one printed section' }),
      T('CONTINUOUS CORD GUIDES'),
      T('Three large guides with bevelled edges. Run each main cord continuously from the ceiling hardware, through a guide, to its balloon. The small holes are for alignment pins.', { needle: 'Three large guides with bevelled edges' }),
      T('For the planned 3 × 1 kg balloons: this is an untested prototype, not a load-rated assembly. Use suitable rated cord/hardware and test the printed ring and balloon attachments. The ring still experiences sideways guide forces.'),
      B('Export Ring Kit…', { testId: 'exportRing', kind: 'Export', needle: '"Export Ring Kit…"', webNeedle: "'Export Ring Kit…'" }),
      T('ZIP · 4 STL designs + assembly notes', { kind: 'Export' }),
      S('Preview part', RING_VIEWS, 'Assembled ring', { testId: 'ringPreviewPart', kind: 'Preview', needle: 'Picker("Preview part"', webNeedle: 'label="Preview part"' }),
      T('450 mm assembly · printed as separate parts', { kind: 'Preview', needle: 'mm assembly · printed as separate parts', webNeedle: 'mm assembly · printed as separate parts' }),
      C('Exploded assembly', { kind: 'Preview', checked: false }),
      Do('Preview', 'Exploded assembly spreads the parts', 'Toggle("Exploded assembly",isOn:$exploded)', stageChanges(clickRole('checkbox', 'Exploded assembly'), clickRole('checkbox', 'Exploded assembly')), { webNeedle: 'setExploded' }),
      Not('Build plate', 'an assembly has no build plate', { kind: 'Preview', needle: '!(p.segmented && assembling)', webNeedle: '!(p.segmented && assembling)' }),
      T('Main cords continue through the ring'),
      T('Ceiling hardware → guide → balloon. Use a retainer below each guide to support the ring on the cord. The ring still carries sideways guide forces and has not been load-tested.'),
      T('Print 3 A + 3 B + 6 plates + 12 pins. Glue A–B–A–B–A–B; fit the LEDs after curing.'),
      A('img', 'Suspension schematic: three continuous cords from the ceiling through ring guides to the balloons. Retainers below the guides support the ring.', { kind: 'Readout', needle: 'Suspension schematic' }),
      Do('Preview', 'Part A: footprint, height, quantity 3, build plate back, print hint', 'A · Cord guide · print 3', async (page) => {
        await page.getByTestId('ringPreviewPart').selectOption({ label: 'A · Cord guide · print 3' });
        await settle(page);
        await expect(metricValue(page, 'PART FOOTPRINT')).toHaveText(/^\d+ × \d+$/);
        await expect(metricValue(page, 'PART HEIGHT')).toHaveText(/^\d+(\.\d)?$/);
        await expect(metricValue(page, 'PRINT QUANTITY')).toHaveText('3');
        await expect(page.locator('#root')).toContainText('copies');
        await expect(page.locator('#root')).toContainText('Fits P2S · flat underside on the bed');
        await expect(page.getByRole('checkbox', { name: 'Build plate', exact: true })).toBeVisible();
        await expect(page.locator('#root')).toContainText('Print flat · channel up');
      }, { webNeedle: "label: 'A · Cord guide · print 3'" }),
      Do('Preview', 'Part C: quantity 6, “Print flat · underside joint plate”', 'Print flat · underside joint plate', async (page) => {
        await page.getByTestId('ringPreviewPart').selectOption({ label: 'C · Joint plate · print 6' });
        await settle(page);
        await expect(metricValue(page, 'PRINT QUANTITY')).toHaveText('6');
        await expect(page.locator('#root')).toContainText('Print flat · underside joint plate');
      }),
      Do('Preview', 'Part D: quantity 12, “Print upright · bevelled ends”, “Fits P2S · upright on the small flat end”', 'Print upright · bevelled ends', async (page) => {
        await page.getByTestId('ringPreviewPart').selectOption({ label: 'D · Alignment pin · print 12' });
        await settle(page);
        await expect(metricValue(page, 'PRINT QUANTITY')).toHaveText('12');
        await expect(page.locator('#root')).toContainText('Print upright · bevelled ends');
        await expect(page.locator('#root')).toContainText('Fits P2S · upright on the small flat end');
        await page.getByTestId('ringPreviewPart').selectOption({ label: 'Assembled ring' });
      }),
      Do('Control', 'Guide sheet, assembly text', 'Six-section ring · assembly', async (page) => {
        await page.getByTestId('ringAssemblyGuide').click();
        const sheet = page.getByRole('dialog', { name: 'Six-section ring · assembly', exact: true });
        for (const line of [
          '1 · Print and dry-fit',
          'Print 3 cord-guide sections A, 3 plain sections B, 6 underside plates C and 12 pins D. Print a plate and pin first to check the joint fit. All exports are already oriented flat on the bed; print pins upright. Start with 0.2 mm layers, 6 walls and 40% infill for A/B, solid plates and pins. These are prototype settings, not a load rating.',
          '2 · Glue a complete circle',
          'Alternate A–B–A–B–A–B with the channels up. Put a curved plate underneath each seam and align with two pins. Use a PLA-compatible adhesive on the broad plate surfaces, seam faces and pins, following its preparation and full-cure instructions. Keep the three large guides and channel free of glue. Pins align the parts; they do not lock the joint.',
          '3 · Route continuous main cords',
          'Run three separate, continuous cords from rated ceiling hardware, through the large guides in A, to the balloons. Use retainers below the guides to carry the ring on the cords. Do not end a main cord at the ring and start a separate balloon cord underneath. Keep upper legs reasonably steep and balanced; the ring still sees sideways forces.',
          '4 · Test before hanging',
          'The planned balloons weigh about 1 kg each, plus ring and LEDs. The kit and existing balloon eyelets have not been load-tested. Check the fully cured, printed and rigged assembly at low height over a clear area, including sustained loading, cord wear and deformation. Use proven attachments and suitably rated cord/hardware. PLA can creep over time.',
          '5 · Add the light',
          "Install the 8 mm strip upright against the green mounting face on the outer wall, after all joints cure. Its lower edge sits on the ledge and its LEDs face the white slope. Use mounting adhesive compatible with the strip and PLA, and smooth every seam first. Keep one continuous run across the six sections; trim only at a marked cut point, leave a small end gap and route the lead over the outer rim. Print and light one section first: PLA scatters light and may transmit a glow. Check the strip's bend radius, cooling requirements and temperature; PLA is not a heat sink. The thickness setting must include LEDs, coating and mounting tape.",
          'The ZIP includes detailed assembly notes, exact dimensions and print quantities.',
        ]) await expect(sheet).toContainText(line);
        await sheet.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(sheet).toHaveCount(0);
      }),
      Do('Control', 'Guide sheet, kit on a flat channel: step 5', 'mm strip after the joints cure', async (page) => {
        await page.getByTestId('ringLightMount').selectOption({ label: 'Flat top channel' });
        await page.getByTestId('ringAssemblyGuide').click();
        const sheet = page.getByRole('dialog', { name: 'Six-section ring · assembly', exact: true });
        await expect(sheet).toContainText(/Install the [\d.]+ mm strip after the joints cure\. The flat circular channel requires a strip that bends sideways or short connected sections\. Follow the cut points and bend limits\. Check heat-sink requirements and operating temperature against PLA and adhesive\. Route the lead over the rim\./);
        await page.keyboard.press('Escape');
        await page.getByTestId('ringLightMount').selectOption({ label: 'Reflected uplight' });
      }, { webNeedle: 'mm strip after the joints cure' }),
      fileName('Suggested name, kit', '-uplight-', 'useRingStore', 'Mobile-Ring-450mm-8mm-uplight-kit.zip', (core, p) => core.ring.filename(p)),
      Do('Export', 'Save panel strings, kit', 'Export Ring Kit', panelStrings('exportRing', ['Export Ring Kit', 'Export Kit', 'ZIP containing four STL designs, print quantities and assembly instructions. Every part fits the P2S; the assembled ring does not.'], 'Mobile-Ring-450mm-8mm-uplight-kit.zip'), { webNeedle: 'exportTable' }),
      Do('Control', 'Light mount “Flat top channel” on a kit keeps the file name without uplight', '-6-section-kit.zip', async (page) => {
        await page.getByTestId('ringLightMount').selectOption({ label: 'Flat top channel' });
        expect(await coreName(page, coreMode, 'useRingStore', (core, p) => core.ring.filename(p))).toBe('Mobile-Ring-450mm-6-section-kit.zip');
      }, { webNeedle: 'filename' }),
    ],
  },
  {
    tab: 'Ring',
    part: 'Ring',
    title: 'Reflected uplight forces its LED values',
    seed: { [K.ring]: RING_FLAT },
    rows: [
      Do('Control', '“Reflected uplight”: strip 8, allowance 0.5, band ≥ 40', 'p.stripWidth=8;p.ledClearance=0.5;p.bandWidth=max(40,p.bandWidth)', async (page) => {
        await page.getByTestId('ringLightMount').selectOption({ label: 'Reflected uplight' });
        await expect(page.getByRole('textbox', { name: 'LED strip width', exact: true })).toHaveValue('8');
        await expect(page.getByRole('textbox', { name: 'LED fit allowance', exact: true })).toHaveValue('0.5');
        await expect(page.getByRole('textbox', { name: 'Band width', exact: true })).toHaveValue('40');
      }, { webNeedle: 'lighting' }),
    ],
  },
];

// ---- Cloud and Sun ----

const VIEWS = ['Assembled', 'Exploded', 'Back · inside', 'Back · wall side', 'Front · print view', 'Cable seal · print view', 'Cable clamp · print view', 'Slot insert · print view'];
const SIDES = ['Left', 'Right', 'Top', 'Bottom'];

const lampCommon = (noun: 'cloud' | 'sun', title: 'Cloud' | 'Sun', store: string): Row[] => [
  P('Back depth', 16, 40, 1, 'mm', { value: '22' }),
  T('Front surface', { needle: 'Text("Front surface")', webNeedle: 'cloud-field-title">Front surface' }),
  G('Front surface', ['Flat', '3D surface'], 'Flat', { testId: `${noun}Surface`, needle: 'Picker("Front surface"', webNeedle: 'label="Front surface"' }),
  T('Straight LED sections'),
  P('Strip width', 3.5, 12, 0.5, 'mm', { value: '8' }),
  P('Strip thickness incl. LEDs', 1, 6, 0.5, 'mm', { value: '3' }),
  P('Distance between cut marks', 5, 100, 0.1, 'mm', { value: '16' }),
  P('LED row spacing', 12, 40, 0.5, 'mm', { value: '14' }),
  T('Aclorol USB COB: 8 mm wide, listed 16 mm cuts. Check the marks on your strip before cutting.'),
  Do('Readout', 'LED plan: sections and strip length', 'straight sections ·', async (page) => {
    await expect(page.locator('#root')).toContainText(/\d+ straight sections · \d+(\.\d)? mm of strip\. Flat adhesive mounting with room for wire links\./);
  }, { webNeedle: 'straight sections ·' }),
  B('View LED placement', { testId: `${noun}LEDLayout` }),
  T('Minimum LED-to-front gap: 16 mm. Start with a 22 mm back; test row spacing behind your printed front.', { needle: 'Minimum LED-to-front gap', webNeedle: 'Minimum LED-to-front gap' }),
  Do('Readout', 'Aclorol estimate in watts', 'Aclorol estimate:', async (page) => {
    await expect(page.locator('#root')).toContainText(/Aclorol estimate: \d+(\.\d)? W at full power\. Dim to suit the lamp and check heat; larger layouts need suitable wiring and cooling\./);
  }, { webNeedle: 'Aclorol estimate:' }),
  T('FOUR CONCEALED CLIPS'),
  P('Clip fit allowance', 0.2, 0.5, 0.05, 'mm', { value: '0.2' }),
  T('1.6 mm spring tabs with tapered 2 mm roots click into an internal groove. A 12 mm overlap conceals the slots. Dry-fit before adding the LEDs.'),
  T('WALL MOUNT & CABLE', { needle: 'WALL MOUNT & CABLE', webNeedle: 'WALL MOUNT & CABLE' }),
  P('Nail head clearance', 5, 10, 0.5, 'mm', { value: '8' }),
  P('Nail shaft clearance', 2, 5, 0.5, 'mm', { value: '3.5' }),
  C('Slot insert for a small nail head', { testId: `${noun}NailInsert`, checked: false }),
  P('Cable diameter', 2, 6, 0.5, 'mm', { value: '3' }),
  T('Cable exit', { needle: 'Text("Cable exit")', webNeedle: 'cloud-field-title">Cable exit' }),
  G('Cable exit', SIDES, 'Right', { testId: `${noun}CableSide`, needle: 'Picker("Cable exit"', webNeedle: 'label="Cable exit"' }),
  C('Second cable outlet', { testId: `${noun}SecondCableOutlet`, checked: false, needle: 'cable outlet', webNeedle: 'cable outlet' }),
  T('Flexible cable seal'),
  T('Each outlet has a seal printed in black TPU. It grips the cable and fills the window in the wall. Measure the cable: every outlet uses the diameter set here.'),
  B('View cable seal', { testId: `${noun}CableSeal` }),
  C('Screwed strain relief', { testId: `${noun}StrainRelief`, checked: true }),
  T('Each clamp has two posts behind its seal, an anvil under the cable and a bar across it, held by two M3 × 10 screws. Ribs grip the jacket. The posts stop the bar, so the cable is squeezed by a set amount.'),
  B('View cable clamp', { testId: `${noun}CableClamp` }),
  B('Printing & assembly guide', { testId: `${noun}AssemblyGuide` }),
  B(`Export ${title} Kit…`, { testId: `export${title}`, kind: 'Export', needle: 'Export \\(title) Kit…', webNeedle: 'Kit…' }),
  Do('Export', 'Footer “ZIP · n STLs + LED plan + assembly notes”', 'STLs + LED plan + assembly notes', async (page) => {
    await expect(page.locator('#root')).toContainText(/ZIP · \d+ STLs \+ LED plan \+ assembly notes/);
  }, { webNeedle: 'STLs + LED plan + assembly notes' }),
  S(`${title} view`, VIEWS, 'Exploded', { testId: `${noun}PreviewPart`, kind: 'Preview', needle: 'Picker("\\(title) view"', webNeedle: 'view`}' }),
  statusRow(),
  stageRow(new RegExp(`${noun} lamp`)),
  Do('Preview', 'Default view: Exploded, caption “n printed parts · four hidden clips · m screws”', 'printed parts · four hidden clips', async (page) => {
    await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText(/^\d+ printed parts · four hidden clips( · \d+ screws)?$/);
  }, { webNeedle: 'printed parts · four hidden clips' }),
  editorHint(),
  Do('Preview', 'Face view ↔ Angled view', 'topDown ? "Angled view":"Face view"', stageChanges(async (page) => page.getByTestId(`${noun}FaceView`).click(), async (page) => page.getByTestId(`${noun}FaceView`).click()), { webNeedle: "'Angled view' : 'Face view'" }),
  Do('Preview', `Reset ${noun} camera (help): undoes an orbit`, 'Reset \\(noun) camera', resetAfterOrbit(`Reset ${noun} camera`), { webNeedle: 'Reset ${noun} camera' }),
  Not('Build plate', 'an assembly view has no build plate', { kind: 'Preview', needle: 'if !assembly {Toggle("Build plate"', webNeedle: '!assembly' }),
  C('Wireframe', { kind: 'Preview', checked: false, testId: `${noun}Wireframe`, needle: 'Toggle("Wireframe",isOn:$wireframe)', webNeedle: 'onWireframe' }),
  Do('Preview', 'Wireframe toggles the wireframe', 'Toggle("Wireframe",isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'onWireframe' }),
  T('All pieces fit P2S + 8 mm brim', { kind: 'Preview', needle: 'All pieces fit P2S + 8 mm brim', webNeedle: 'All pieces fit P2S + 8 mm brim' }),
  M('ASSEMBLED DEPTH', /^\d+(\.\d)?$/, 'mm'),
  T('The nail sits in a blind pocket with a 3 mm solid cap. Each cable leaves through the outer wall, through a flexible seal that fills the opening. Check the printed assembly in a dark room before mounting.'),
  T('Prototype · clip fit, mounting strength, opacity and LED heat need a physical check.'),
  Do('Preview', 'View LED placement goes to Back · inside, face on', 'selection = .back;topDown=true', async (page) => {
    await page.getByTestId(`${noun}LEDLayout`).click();
    await expect(page.getByTestId(`${noun}PreviewPart`).locator('option:checked')).toHaveText('Back · inside');
    await expect(page.getByTestId(`${noun}FaceView`)).toContainText('Angled view');
    await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText(/^Green: LED guides · orange: seals( · blue: clamps)?$/);
    await expect(page.getByRole('checkbox', { name: 'Build plate', exact: true })).toBeVisible();
  }, { webNeedle: 'onShowLEDPlacement' }),
  Do('Preview', 'Build plate in the print views, off by default', 'showPlate=false', stageChanges(clickRole('checkbox', 'Build plate'), clickRole('checkbox', 'Build plate')), { webNeedle: 'setShowPlate' }),
  ...([
    ['Assembled', /diffuser · opaque backing$/, 'diffuser · opaque backing'],
    ['Back · wall side', /^Blind keyhole · closed floor · cable: Right$/, 'Blind keyhole · closed floor · cable:'],
    ['Front · print view', /^Diffuser · flat face on the bed$/, 'Diffuser · flat face on the bed'],
    ['Cable seal · print view', /^Black TPU · flat end down, nozzle up · no supports$/, 'Black TPU · flat end down, nozzle up · no supports'],
    ['Cable clamp · print view', /^(Bar on its side, anvil flat · \d+ screws M3 × 10|No strain relief in this lamp · showing the seals)$/, 'Bar on its side, anvil flat'],
    ['Slot insert · print view', /^No slot insert in this kit · showing the wall side$/, 'No slot insert in this kit · showing the wall side'],
  ] as const).map(([view, caption, needle]) =>
    Do('Preview', `View “${view}” and its caption`, needle, async (page) => {
      await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: view });
      await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText(caption);
    }, { webNeedle: needle })),
  Do('Preview', 'Assembled and Back views start face on', 'value == .assembled || value == .rear || value == .back', async (page) => {
    await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: 'Assembled' });
    await expect(page.getByTestId(`${noun}FaceView`)).toContainText('Angled view');
    await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: 'Exploded' });
    await expect(page.getByTestId(`${noun}FaceView`)).toContainText('Face view');
  }, { webNeedle: "value === 'assembled'" }),
  Do('Control', 'Guide sheet: the kit’s ASSEMBLY.md, 700×650', 'lamp · printing & assembly', async (page) => {
    await page.getByTestId(`${noun}AssemblyGuide`).click();
    const sheet = page.getByRole('dialog', { name: `${title} lamp · printing & assembly`, exact: true });
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([700, 650]);
    expect((await sheet.locator('.cloud-guide').innerText()).length).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }, { webNeedle: 'lamp · printing & assembly' }),
  savedLine(store, '\\(title) saved · Show in Finder', '${title} ${state.exported.mode}', (mode) => `${title} ${mode} · file.stl`),
  busyLabel(store, `export${title}`, 'Exporting…', false),
  exportAlert(store, `${title} export failed`, { swift: '\\(title) export failed', web: '${title} export failed' }),
  Do('Shortcut', '⌘E / Ctrl+E exports', 'keyboardShortcut("e")', exportShortcut(`export${title}`), { webNeedle: 'onExport' }),
  Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
];

const lampOptions = (noun: 'cloud' | 'sun', key: string, width: number): Scene[] => {
  const title = noun === 'cloud' ? 'Cloud' : 'Sun';
  const base = { kind: noun };
  return [
    {
      tab: title,
      part: title,
      title: '3D surface',
      seed: { [key]: { ...base, width, surface: 'sculpted' } },
      rows: [
        P('Surface depth', 2, Math.min(30, width * 0.12), 0.5, 'mm', { value: '18' }),
        noun === 'cloud'
          ? T('Separate puffs, rounded from the outline up. Hollow inside for light. About 15 mm and more gives distinct puffs.')
          : T('Twelve plump rays that flow into the dome, rising from the outline. Hollow inside for light.', { needle: ', rising from the outline. Hollow inside for light.', webNeedle: ', rising from the outline. Hollow inside for light.' }),
        T('Print curved face up, clips down. Add supports beneath the diffuser and a brim; keep clip slots clear. See the printing guide.'),
        Do('Preview', 'Front view caption on a 3D surface', 'Curved face up · clips down · supports required', async (page) => {
          await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: 'Front · print view' });
          await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText('Curved face up · clips down · supports required');
        }, { webNeedle: 'Curved face up · clips down · supports required' }),
        Do('Preview', 'Assembled caption “Sculpted diffuser · opaque backing”', '"Sculpted"', async (page) => {
          await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: 'Assembled' });
          await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText('Sculpted diffuser · opaque backing');
        }, { webNeedle: "'Sculpted'" }),
      ],
    },
    {
      tab: title,
      part: title,
      title: 'Wider than the bed',
      seed: { [key]: { ...base, width: 300 } },
      rows: [
        W('This width exceeds the P2S bed with an 8 mm brim.'),
        B('Use 240 mm for the P2S'),
        W(`Exceeds P2S bed · reduce ${noun} width`, { needle: 'Exceeds P2S bed · reduce', webNeedle: 'Exceeds P2S bed · reduce' }),
        Do('Control', 'Use 240 mm for the P2S sets the width', 'p.width=240', async (page) => {
          await page.getByRole('button', { name: 'Use 240 mm for the P2S', exact: true }).click();
          await expect(page.getByRole('textbox', { name: noun === 'sun' ? 'Diameter including rays' : 'Cloud width', exact: true })).toHaveValue('240');
          await expect(page.getByRole('button', { name: 'Use 240 mm for the P2S', exact: true })).toHaveCount(0);
        }, { webNeedle: "setField('width', 240)" }),
      ],
    },
    {
      tab: title,
      part: title,
      title: 'Slot insert',
      seed: { [key]: { ...base, width, nailInsert: true } },
      rows: [
        P('Measured nail shaft', 1, 4, 0.1, 'mm', { value: '1.8' }),
        P('Measured nail head', 2, 8, 0.1, 'mm', { value: '3.3' }),
        Do('Readout', 'Insert text with slot width and head distance', 'For a head that slips through the slot', async (page) => {
          await expect(page.locator('#root')).toContainText(/For a head that slips through the slot, also in a back you have already printed\. The insert goes in through the square entry and slides up behind the lip\. It narrows the slot to [\d.]+ mm, and the head bears on its plate\. Set the head's underside [\d.]+–[\d.]+ mm off the wall\./);
        }, { webNeedle: 'For a head that slips through the slot' }),
        B('View slot insert', { testId: `${noun}ViewNailInsert` }),
        Do('Preview', 'View slot insert: its caption', 'Flat face on the bed, fingers up · print solid', async (page) => {
          await page.getByTestId(`${noun}ViewNailInsert`).click();
          await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText('Flat face on the bed, fingers up · print solid');
        }, { webNeedle: 'Flat face on the bed, fingers up · print solid' }),
        Do('Warning', 'Insert impossible: the problem text + “The kit comes without it.”', 'The kit comes without it.', async (page) => {
          const field = page.getByRole('textbox', { name: 'Measured nail head', exact: true });
          await field.fill('8');
          await field.press('Enter');
          await page.getByRole('textbox', { name: 'Measured nail shaft', exact: true }).fill('4');
          await page.getByRole('textbox', { name: 'Measured nail shaft', exact: true }).press('Enter');
          await settle(page);
          await expect(page.getByRole('alert').filter({ hasText: 'The kit comes without it.' })).toBeVisible();
        }, { webNeedle: 'The kit comes without it.' }),
      ],
    },
    {
      tab: title,
      part: title,
      title: 'Cable outlets',
      rows: [
        Do('Control', 'Second outlet on: picker of the free sides, then a third', 'Second","Third","Fourth', async (page) => {
          await page.getByTestId(`${noun}SecondCableOutlet`).check();
          await expect(page.getByTestId(`${noun}SecondCableSide`).getByRole('radio')).toHaveText(['Left', 'Top', 'Bottom']);
          await expect(page.getByTestId(`${noun}ThirdCableOutlet`)).toBeVisible();
          await expect(page.locator('#root')).toContainText(/Cable exits: .* and .*\. Left and right are as you face the lamp\. The back sits flat on the wall\./);
        }, { webNeedle: "['Second', 'Third', 'Fourth']" }),
        Do('Control', 'Third on: picker of the two left; fourth names the last side, without a picker', 'cable outlet · \\(free[0].title)', async (page) => {
          await page.getByTestId(`${noun}ThirdCableOutlet`).check();
          await expect(page.getByTestId(`${noun}ThirdCableSide`).getByRole('radio')).toHaveCount(2);
          await expect(page.getByText(/^Fourth cable outlet · (Left|Right|Top|Bottom)$/)).toBeVisible();
          await page.getByTestId(`${noun}FourthCableOutlet`).check();
          await expect(page.getByTestId(`${noun}FourthCableSide`)).toHaveCount(0);
          await expect(page.getByTestId(`${noun}FourthCableOutlet`)).toBeChecked();
        }, { webNeedle: 'cable outlet · ${CABLE_SIDE_TITLE' }),
        Do('Control', 'Second outlet off removes the ones after it', 'Turning an outlet on adds it; turning it off removes it', async (page) => {
          await page.getByTestId(`${noun}SecondCableOutlet`).uncheck();
          await expect(page.getByTestId(`${noun}ThirdCableOutlet`)).toHaveCount(0);
        }, { webNeedle: 'setCableOutlet' }),
        Do('Export', 'File name names several exits, sorted', '-cable-\\(cableSides.map', async (page) => {
          await page.getByTestId(`${noun}SecondCableOutlet`).check();
          const name = await coreName(page, coreMode, noun === 'cloud' ? 'useCloudStore' : 'useSunStore', (core, p) => core.cloud.filename(p));
          expect(name).toMatch(/-cable-left-right-kit\.zip$/);
          await page.getByTestId(`${noun}SecondCableOutlet`).uncheck();
        }, { webNeedle: 'filename' }),
        Do('Export', 'File name names one other exit', '"-cable-\\(cableSide.rawValue)"', async (page) => {
          await page.getByTestId(`${noun}CableSide`).getByRole('radio', { name: 'Top', exact: true }).click();
          const name = await coreName(page, coreMode, noun === 'cloud' ? 'useCloudStore' : 'useSunStore', (core, p) => core.cloud.filename(p));
          expect(name).toMatch(/-cable-top-kit\.zip$/);
          await page.getByTestId(`${noun}CableSide`).getByRole('radio', { name: 'Right', exact: true }).click();
        }, { webNeedle: 'filename' }),
      ],
    },
    {
      tab: title,
      part: title,
      title: 'Warnings from the finished kit',
      seed: { [key]: { ...base, width, secondCableSide: 'left' } },
      rows: [
        Do('Warning', 'No section fits: “No complete section fits. Enlarge the … or use a strip with closer cut marks.”', 'No complete section fits. Enlarge the', async (page) => {
          await page.evaluate(async (store) => {
            const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
            const state = stores[store].getState();
            stores[store].setState({ bundle: { ...state.bundle, ledPlan: { ...state.bundle.ledPlan, sections: [] } } });
          }, noun === 'cloud' ? 'useCloudStore' : 'useSunStore');
          await expect(page.getByRole('alert').filter({ hasText: `No complete section fits. Enlarge the ${noun} or use a strip with closer cut marks.` })).toBeVisible();
        }, { webNeedle: 'No complete section fits. Enlarge the' }),
        Do('Warning', 'Several outlets, one without room: “No room for a clamp at Left. This outlet keeps its seal; secure its lead outside the lamp.”', 'No room for a clamp at', async (page) => {
          await page.evaluate(async (store) => {
            const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
            const state = stores[store].getState();
            stores[store].setState({ bundle: { ...state.bundle, clampCount: 1, cableCount: 2, cablesWithoutClamp: ['left'] } });
          }, noun === 'cloud' ? 'useCloudStore' : 'useSunStore');
          await expect(page.getByRole('alert').filter({ hasText: 'No room for a clamp at Left. This outlet keeps its seal; secure its lead outside the lamp.' })).toBeVisible();
        }, { webNeedle: 'No room for a clamp at' }),
        Do('Warning', 'Two outlets without room: “These outlets keep their seals; secure their leads outside the lamp.”', 'These outlets keep their seals; secure their leads', async (page) => {
          await page.evaluate(async (store) => {
            const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
            const state = stores[store].getState();
            stores[store].setState({ bundle: { ...state.bundle, clampCount: 0, cableCount: 2, cablesWithoutClamp: ['right', 'left'] } });
          }, noun === 'cloud' ? 'useCloudStore' : 'useSunStore');
          await expect(page.getByRole('alert').filter({ hasText: 'No room for a clamp at Right and Left. These outlets keep their seals; secure their leads outside the lamp.' })).toBeVisible();
        }, { webNeedle: 'These outlets keep their seals; secure their leads' }),
      ],
    },
    {
      tab: title,
      part: title,
      title: 'Strain relief off',
      seed: { [key]: { ...base, width, strainRelief: false } },
      rows: [
        Not('Each clamp has two posts behind its seal', 'no strain relief, no clamp text'),
        Do('Preview', 'Clamp view without strain relief', 'No strain relief in this lamp · showing the seals', async (page) => {
          await page.getByTestId(`${noun}PreviewPart`).selectOption({ label: 'Cable clamp · print view' });
          await expect(page.getByTestId(`${noun}PreviewCaption`)).toHaveText('No strain relief in this lamp · showing the seals');
        }, { webNeedle: 'No strain relief in this lamp · showing the seals' }),
      ],
    },
  ];
};

const cloud: Scene[] = [
  {
    tab: 'Cloud',
    part: 'Cloud',
    title: 'Defaults (Classic, 230 mm)',
    rows: [
      T('A CLOUD BEHIND YOUR BALLOONS'),
      T('A little light on the wall.'),
      T('An opaque LED tray and a white PLA diffuser, joined by four hidden clips. The balloons hang independently.'),
      T('SHAPES FOR YOUR SKY'),
      ...([['classic', 'Classic', 'Soft & familiar'], ['drift', 'Drift', 'Low & flowing'], ['billow', 'Billow', 'Tall & pillowy'], ['twin', 'Twin', 'Two gentle peaks'], ['breeze', 'Breeze', 'Trailing in the wind'], ['cotton', 'Cotton', 'A crown of little puffs']] as const).map(([raw, title, subtitle]) =>
        Do('Control', `Shape card ${title}: “${subtitle}”, #cloudStyle-${raw}, label “${title} cloud, ${subtitle}”`, subtitle, async (page) => {
          const card = page.getByTestId(`cloudStyle-${raw}`);
          await expect(card).toHaveAccessibleName(`${title} cloud, ${subtitle}`);
          await expect(card).toContainText(title);
          await expect(card).toContainText(subtitle);
          await expect(card.locator('svg path').first()).toHaveAttribute('d', /^M/);
        })),
      Do('Control', 'Selected card lit, filled checkmark', 'Image(systemName:"checkmark.circle.fill").foregroundStyle(accent)', async (page) => {
        const card = page.getByTestId('cloudStyle-classic');
        await expect(card).toHaveAttribute('aria-pressed', 'true');
        await expect(card.locator('[data-symbol="checkmark.circle.fill"]')).toHaveCount(1);
      }, { webNeedle: 'name="checkmark.circle.fill"' }),
      C('Mirror silhouette', { testId: 'cloudMirror', checked: false }),
      T('Mix shapes and widths, then mirror a few for a natural sky. Each kit includes its matching front and back.'),
      T('CLOUD & DIFFUSER', { needle: '\\(title.uppercased()) & DIFFUSER', webNeedle: '& DIFFUSER' }),
      P('Cloud width', 100, 500, 1, 'mm', { value: '230' }),
      T('Down to 100 mm wide and 16 mm deep. Small clouds become taller to keep room for the nail pocket and the LED rows.'),
      P('White front thickness', 0.8, 2, 0.2, 'mm', { value: '1.2' }),
      T('Start at 1.2 mm for white PLA. A shallow back may show LED hotspots; test your filament and strip.'),
      ...lampCommon('cloud', 'Cloud', 'useCloudStore'),
      T('Left and right are as you face the lamp: the cable leaves at the widest point. The recessed keyhole has a solid cap, and the back sits flat on the wall.', { needle: 'the cable leaves at the widest point', webNeedle: 'the cable leaves at the widest point' }),
      Do('Preview', 'Name beside the picker: “Classic”', 'var displayName: String { kind == .sun', async (page) => {
        await expect(page.locator('.cloud-preview__name')).toHaveText('Classic');
      }, { webNeedle: 'derived.displayName' }),
      M('CLOUD SIZE', /^230 × \d+(\.\d)?$/, 'mm', { needle: '\\(title.uppercased()) SIZE', webNeedle: 'SIZE`' }),
      M('WHITE FACE', '1.2', 'mm', { needle: '"WHITE FACE"', webNeedle: "'WHITE FACE'" }),
      T('Light through the cloud. Openings hidden behind it.'),
      Do('Control', 'Another shape: selection, file name and camera follow', 'Cloud-Lamp\\(variant)', async (page) => {
        await page.getByTestId('cloudStyle-drift').click();
        await expect(page.getByTestId('cloudStyle-drift')).toHaveAttribute('aria-pressed', 'true');
        expect(await coreName(page, coreMode, 'useCloudStore', (core, p) => core.cloud.filename(p))).toBe('Cloud-Lamp-drift-230mm-kit.zip');
        await page.getByTestId('cloudMirror').check();
        expect(await coreName(page, coreMode, 'useCloudStore', (core, p) => core.cloud.filename(p))).toBe('Cloud-Lamp-drift-mirrored-230mm-kit.zip');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { webNeedle: 'filename' }),
      fileName('Suggested name', 'Cloud-Lamp\\(variant)', 'useCloudStore', 'Cloud-Lamp-230mm-kit.zip', (core, p) => core.cloud.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export \\(kind.title) Lamp Kit', async (page) => {
        await page.getByTestId('exportCloud').click();
        const dialog = page.locator('dialog[open]');
        if (await dialog.count() === 0) {
          // The editor's stand-in until U9 shows name and message under the button.
          await expect(page.getByTestId('cloudExportMessage')).toContainText(/^Cloud-Lamp-230mm-kit\.zip · \d+ print-ready STLs, a full-size LED placement plan, cut list and assembly notes\.$/);
          throw new Pending('WP-U9', 'Name and message checked in the footer stand-in; the dialog with title and prompt comes with U9.');
        }
        await page.keyboard.press('Escape');
      }, { webNeedle: 'exportRequest' }),
      Do('Shortcut', 'Reset: Alt+N → defaults', 'case .cloud:cloud.apply(CloudParameters())', resetShortcut('Back depth', '30', '22'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.cloud}: written at once, Mac JSON keys, survives a reload`, 'var settingsKey', persists(K.cloud, 'Cloud', 'Back depth', '28', 'depth', LAMP_KEYS), { webNeedle: 'cloud.v1' }),
      Do('Persistence', 'Stored Mac JSON loads: legacy `{"width":100,"depth":16,…}`', 'kind.settingsKey', loadsMacJson(K.cloud, { width: 100, depth: 16, diffuserThickness: 0.8, stripThickness: 4 }, 'Cloud', 'Cloud width', '100'), { webNeedle: 'cloud.v1' }),
    ],
  },
  ...lampOptions('cloud', K.cloud, 230),
  {
    tab: 'Cloud',
    part: 'Cloud',
    title: 'Too small for a clamp',
    seed: { [K.cloud]: { kind: 'cloud', width: 100, depth: 16 } },
    rows: [
      Do('Warning', 'No room for the clamp: reason and what would fit', 'No room for the clamp behind this outlet', async (page) => {
        await expect(page.getByRole('alert').filter({ hasText: 'No room for the clamp behind this outlet: the nail pocket or the wall is too close. The kit comes without it.' })).toBeVisible();
      }, { webNeedle: 'No room for the clamp behind this outlet' }),
      Do('Warning', 'The note names what would fit: “It fits with a width of … mm or more” and/or “the cable exit at the …”', ' It fits with ', async (page) => {
        await expect(page.getByRole('alert').filter({ hasText: /It fits with (a width of [\d.]+ mm or more|the cable exit at the [a-z, ]+)(, or the cable exit at the [a-z, ]+)?\./ })).toBeVisible();
      }, { webNeedle: ' It fits with ' }),
    ],
  },
  {
    tab: 'Cloud',
    part: 'Cloud',
    title: 'Cable side notes',
    rows: [
      Do('Readout', 'Exit Top: “The cable leaves at the highest point of the cloud.”', 'The cable leaves at the highest point of the cloud.', async (page) => {
        await page.getByTestId('cloudCableSide').getByRole('radio', { name: 'Top', exact: true }).click();
        await expect(page.locator('#root')).toContainText('The cable leaves at the highest point of the cloud. The recessed keyhole has a solid cap, and the back sits flat on the wall.');
      }),
      Do('Readout', 'Exit Bottom: “The cable leaves straight down, in the middle of the flat base.”', 'The cable leaves straight down, in the middle of the flat base.', async (page) => {
        await page.getByTestId('cloudCableSide').getByRole('radio', { name: 'Bottom', exact: true }).click();
        await expect(page.locator('#root')).toContainText('The cable leaves straight down, in the middle of the flat base.');
      }),
    ],
  },
];

const sun: Scene[] = [
  {
    tab: 'Sun',
    part: 'Sun',
    title: 'Defaults (Soft star, 200 mm)',
    rows: [
      T('A LITTLE SUN FOR YOUR SKY'),
      T('A sunny spot on the wall.'),
      T('Choose your sun: an opaque LED tray and a glowing diffuser, joined by four hidden clips.'),
      T('FOUR WAYS TO SHINE'),
      ...([['soft-star', 'Soft star', 'Plump, ridged rays', 'Twelve plump rays that flow into the dome'], ['cones', 'Cones', 'Round, tapering rays', 'Twelve round, tapering rays around a dome']] as const).map(([raw, title, note, subtitle]) =>
        Do('Control', `Shape card ${title}: “${note}”, #sunStyle-${raw}, label “${title} sun, ${subtitle}”`, note, async (page) => {
          const card = page.getByTestId(`sunStyle-${raw}`);
          await expect(card).toHaveAccessibleName(`${title} sun, ${subtitle}`);
          await expect(card).toContainText(note);
          await expect(card).toHaveAccessibleDescription(note);
        })),
      ...(['pinwheel', 'bold-eight'] as const).map((raw) =>
        Do('Control', `Shape card #sunStyle-${raw} with its silhouette`, raw === 'pinwheel' ? 'cones, pinwheel, boldEight' : 'boldEight = "bold-eight"', async (page) => {
          await expect(page.getByTestId(`sunStyle-${raw}`).locator('svg path').first()).toHaveAttribute('d', /^M/);
        }, { webNeedle: raw })),
      T('Twelve plump rays that flow into the dome', { needle: 'Twelve plump rays that flow into the dome' }),
      T('Switch designs freely; your dimensions and fittings stay the same. Soft star and Cones share their outline and their back: they differ in the 3D surface. Every other kit has its own matching front and back.'),
      T('SUN & DIFFUSER', { needle: '\\(title.uppercased()) & DIFFUSER', webNeedle: '& DIFFUSER' }),
      P('Diameter including rays', 160, 500, 1, 'mm', { value: '200' }),
      T('160–500 mm across the rays. The circular shape stays round; the fittings keep their actual size.'),
      P('Diffuser thickness', 0.8, 2, 0.2, 'mm', { value: '1.2' }),
      T('Start with a 1.2 mm face in white or translucent yellow PLA. Preview color is illustrative; test the glow with your strip.'),
      ...lampCommon('sun', 'Sun', 'useSunStore'),
      T('Left and right are as you face the lamp: the cable leaves between two rays, just below the horizontal one. The recessed keyhole has a solid cap, and the back sits flat on the wall.', { needle: 'just below the horizontal one', webNeedle: 'just below the horizontal one' }),
      Do('Preview', 'Name beside the picker: “Sun · Soft star”', 'var displayName: String { kind == .sun', async (page) => {
        await expect(page.locator('.cloud-preview__name')).toHaveText('Sun · Soft star');
      }, { webNeedle: 'derived.displayName' }),
      M('SUN SIZE', /^200 × \d+(\.\d)?$/, 'mm', { needle: '\\(title.uppercased()) SIZE', webNeedle: 'SIZE`' }),
      M('DIFFUSER', '1.2', 'mm', { needle: '"DIFFUSER"', webNeedle: "'DIFFUSER'" }),
      T('A warm sun to sit beside your clouds.'),
      Do('Preview', 'Assembled caption “Warm diffuser · opaque backing”', '"Warm"', async (page) => {
        await page.getByTestId('sunPreviewPart').selectOption({ label: 'Assembled' });
        await expect(page.getByTestId('sunPreviewCaption')).toHaveText('Warm diffuser · opaque backing');
        await page.getByTestId('sunPreviewPart').selectOption({ label: 'Exploded' });
      }, { webNeedle: "'Warm'" }),
      Do('Control', 'Another design: the subtitle and the file name follow', 'Sun-Lamp-\\(sunStyle.rawValue)', async (page) => {
        await page.getByTestId('sunStyle-pinwheel').click();
        await expect(page.getByTestId('sunStyle-pinwheel')).toHaveAttribute('aria-pressed', 'true');
        expect(await coreName(page, coreMode, 'useSunStore', (core, p) => core.cloud.filename(p))).toBe('Sun-Lamp-pinwheel-200mm-kit.zip');
        await page.getByRole('button', { name: 'Reset part', exact: true }).click();
      }, { webNeedle: 'filename' }),
      fileName('Suggested name', 'Sun-Lamp-\\(sunStyle.rawValue)', 'useSunStore', 'Sun-Lamp-soft-star-200mm-kit.zip', (core, p) => core.cloud.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export \\(kind.title) Lamp Kit', async (page) => {
        await page.getByTestId('exportSun').click();
        if (await page.locator('dialog[open]').count() === 0) {
          await expect(page.getByTestId('sunExportMessage')).toContainText(/^Sun-Lamp-soft-star-200mm-kit\.zip · \d+ print-ready STLs/);
          throw new Pending('WP-U9', 'Name and message checked in the footer stand-in; the dialog with title and prompt comes with U9.');
        }
        await page.keyboard.press('Escape');
      }, { webNeedle: 'exportRequest' }),
      Do('Shortcut', 'Reset: Alt+N → sun defaults, width 200', 'case .sun:sun.apply(WallLampKind.sun.defaults)', resetShortcut('Back depth', '30', '22'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.sun}: written at once, Mac JSON keys, survives a reload`, 'var settingsKey', persists(K.sun, 'Sun', 'Back depth', '28', 'depth', LAMP_KEYS), { webNeedle: 'sun.v1' }),
    ],
  },
  ...lampOptions('sun', K.sun, 200),
  {
    tab: 'Sun',
    part: 'Sun',
    title: 'Cable side notes',
    rows: [
      Do('Readout', 'Exit Top', 'just right of the vertical one', async (page) => {
        await page.getByTestId('sunCableSide').getByRole('radio', { name: 'Top', exact: true }).click();
        await expect(page.locator('#root')).toContainText('The cable leaves upwards, between two rays, just right of the vertical one.');
      }, { webNeedle: 'just right of the vertical one' }),
      Do('Readout', 'Exit Bottom', 'just left of the vertical one', async (page) => {
        await page.getByTestId('sunCableSide').getByRole('radio', { name: 'Bottom', exact: true }).click();
        await expect(page.locator('#root')).toContainText('The cable leaves downwards, between two rays, just left of the vertical one.');
      }, { webNeedle: 'just left of the vertical one' }),
      Do('Readout', 'Exit Left', 'just above the horizontal one', async (page) => {
        await page.getByTestId('sunCableSide').getByRole('radio', { name: 'Left', exact: true }).click();
        await expect(page.locator('#root')).toContainText('the cable leaves between two rays, just above the horizontal one.');
      }, { webNeedle: 'just above the horizontal one' }),
    ],
  },
];

// ---- Figures ----

const FIGURE_CARDS = [
  ['balloon', 'Balloon', "The studio's envelope, with a basket on two ropes"],
  ['cloud', 'Cloud', 'The Classic cloud, small enough to hang'],
  ['star', 'Star', 'Five soft points'],
  ['moon', 'Moon', 'A crescent, leaning back'],
  ['sun', 'Sun', 'Eight broad rays'],
  ['heart', 'Heart', 'Full and round'],
  ['raindrop', 'Raindrop', 'Hang a few under a cloud'],
] as const;

const figure: Scene[] = [
  {
    tab: 'Figures',
    part: 'Figures',
    title: 'Defaults (Star, pillow, hanging view)',
    rows: [
      T('CHOOSE A FIGURE'),
      ...FIGURE_CARDS.map(([raw, title, subtitle]) =>
        Do('Control', `Card ${title}: “${subtitle}”, silhouette, label “${title} figure”`, subtitle, async (page) => {
          const card = page.getByRole('button', { name: `${title} figure`, exact: true });
          await expect(card).toContainText(title);
          await expect(card).toHaveAccessibleDescription(subtitle);
          await expect(card.locator('svg path').first()).toHaveAttribute('fill-rule', 'evenodd');
          await expect(page.getByTestId(`figureStyle-${raw}`)).toHaveCount(1);
        })),
      T('SIZE & BODY', { needle: 'SIZE & BODY', webNeedle: 'SIZE & BODY' }),
      P('Height', 40, 120, 1, 'mm', { value: '60' }),
      G('Figure surface', ['Pillow', 'Puffy', 'Flat'], 'Pillow', { needle: 'accessibilityLabel("Figure surface")', webNeedle: 'label="Figure surface"' }),
      T('A rounded edge, level in the middle'),
      P('Edge band', 0.8, 6, 0.2, 'mm', { value: '1.6', needle: '"Edge band"', webNeedle: "'Edge band'" }),
      P('Dome height', 0.8, 10, 0.2, 'mm', { value: '3.2' }),
      C('Domed on both sides', { checked: false }),
      T('The flat back prints without supports and sits well on the bed.'),
      T('HANGING'),
      P('Thread hole', 1.5, 4, 0.5, 'mm', { value: '2' }),
      P('Material around hole', 1.5, 6, 0.5, 'mm', { value: '2.5' }),
      C('Second hole at the bottom', { checked: false }),
      T('The hole sits as high as the figure allows, right above its centre of gravity, so it hangs straight.'),
      B('Export Figure STL…', { testId: 'exportFigure', kind: 'Export', needle: '"Export Figure STL…"', webNeedle: 'label="Export Figure STL…"' }),
      B('Export all seven as a set (ZIP)…', { testId: 'exportFigureSet', kind: 'Export', webNeedle: 'Export all seven as a set (ZIP)…' }),
      T('One STL per figure · thread hole included · millimetres', { kind: 'Export' }),
      T('Star figure', { needle: '\\(p.style.title) figure', webNeedle: 'figure</h2>' }),
      statusRow(),
      stageRow(/figure/),
      T('As it hangs · thread through the hole', { kind: 'Preview' }),
      editorHint(),
      Do('Preview', 'Default hanging, no Build plate; Print view brings it', 'if !hanging { Toggle("Build plate"', async (page) => {
        await expect(page.getByRole('checkbox', { name: 'Build plate', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Print view', exact: true }).click();
        await expect(page.getByRole('checkbox', { name: 'Build plate', exact: true })).toBeChecked();
        await expect(page.getByTestId('stageBadge')).toHaveText('Print view · flat back on the bed');
        await page.getByRole('button', { name: 'Hanging view', exact: true }).click();
      }, { webNeedle: '!hanging' }),
      Do('Preview', 'Print view ↔ Hanging view changes the stage', 'hanging.toggle()', stageChanges(clickRole('button', 'Print view'), clickRole('button', 'Hanging view')), { webNeedle: 'setHanging(!hanging)' }),
      Do('Preview', 'Reset figure camera (help): undoes an orbit', 'Reset figure camera', resetAfterOrbit('Reset figure camera')),
      Do('Preview', 'Five preview colours, help “Preview colour only”', 'Preview colour only', async (page) => {
        for (const i of [1, 2, 3, 4, 5]) await expect(page.getByRole('button', { name: `Preview colour ${i}`, exact: true })).toHaveAttribute('title', 'Preview colour only');
      }),
      Do('Preview', 'A swatch recolors the stage', 'colorIndex = i', stageChanges(clickRole('button', 'Preview colour 2'), clickRole('button', 'Preview colour 1')), { webNeedle: 'onSelect(i)' }),
      Do('Preview', 'Wireframe (off by default)', 'Toggle("Wireframe", isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'setWireframe' }),
      M('SIZE', /^\d+(\.\d)? × 60$/, 'mm'),
      M('THICKNESS', /^\d+(\.\d)?$/, 'mm'),
      M('THREAD HOLE', 'Ø 2', 'mm'),
      T('Print flat back down, then thread and hang'),
      T("No supports needed. Tie a loop through the hole and hang the figures from the mobile ring at different heights, out of the baby's reach."),
      savedLine('useFigureStore', '"Saved · Show in Finder"', "'Saved' : 'Downloaded'", (mode) => `${mode === 'saved' ? 'Saved' : 'Downloaded'} · file.stl`),
      busyLabel('useFigureStore', 'exportFigure', 'Preparing figure…', true),
      exportAlert('useFigureStore', 'Figure export failed'),
      fileName('Suggested name', 'Mobile-Figure-\\(style.rawValue)', 'useFigureStore', 'Mobile-Figure-star-60mm.stl', (core, p) => core.figure.filename(p)),
      fileName('Suggested name, set', 'Mobile-Figures-', 'useFigureStore', 'Mobile-Figures-60mm-set.zip', (core, p) => core.figure.setFilename(p)),
      Do('Export', 'Save panel strings, one figure', 'Export Figure STL', panelStrings('exportFigure', ['Export Figure STL', 'Export Figure', 'One figure for the mobile, with its thread hole. Millimetres; print flat back down.'], 'Mobile-Figure-star-60mm.stl'), { webNeedle: 'exportTable' }),
      Do('Export', 'Save panel strings, set', 'Export Figure Set', panelStrings('exportFigureSet', ['Export Figure Set', 'Export Set', 'All seven figures at these settings, with printing and hanging notes. Millimetres; print flat back down.'], 'Mobile-Figures-60mm-set.zip'), { webNeedle: 'exportTable' }),
      Do('Shortcut', '⌘E / Ctrl+E exports the single figure', 'keyboardShortcut("e")', exportShortcut('exportFigure'), { webNeedle: 'onExport' }),
      Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
      Do('Shortcut', 'Reset: Alt+N → defaults', 'case .figure:figure.apply(FigureParameters())', resetShortcut('Height', '80', '60'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.figure}: written at once, Mac JSON keys, survives a reload`, K.figure, persists(K.figure, 'Figures', 'Height', '75', 'height', FIGURE_KEYS), { webNeedle: 'figure.v1' }),
      Do('Persistence', 'Stored Mac JSON loads: partial `{"style":"moon","height":75}`', 'try? JSONDecoder().decode(FigureParameters.self', loadsMacJson(K.figure, { style: 'moon', height: 75 }, 'Figures', 'Height', '75'), { webNeedle: 'figure.v1' }),
    ],
  },
  {
    tab: 'Figures',
    part: 'Figures',
    title: 'Flat',
    seed: { [K.figure]: { style: 'star', height: 60, surface: 'flat' } },
    rows: [
      T('A plain slab'),
      P('Thickness', 0.8, 6, 0.2, 'mm', { needle: '"Thickness"', webNeedle: "'Thickness'" }),
      Do('Control', 'Flat hides Dome height and Domed on both sides', 'if p.domed {', async (page) => {
        await expect(page.getByRole('textbox', { name: 'Dome height', exact: true })).toHaveCount(0);
        await expect(page.getByRole('checkbox', { name: 'Domed on both sides', exact: true })).toHaveCount(0);
      }, { webNeedle: 'derived.domed &&' }),
      fileName('Suggested name, flat', 'surfaceSuffix', 'useFigureStore', 'Mobile-Figure-star-60mm-flat.stl', (core, p) => core.figure.filename(p)),
    ],
  },
  {
    tab: 'Figures',
    part: 'Figures',
    title: 'Puffy, both sides',
    seed: { [K.figure]: { style: 'moon', height: 60, surface: 'puffy', doubleSided: true, dome: 5 } },
    rows: [
      T('Domed all over, like a foil balloon'),
      T('Needs supports under the lower dome. Or print the flat-backed figure twice and glue the pair back to back.'),
      Do('Preview', 'Print view badge “Print view · supports under the lower dome”', 'Print view · supports under the lower dome', async (page) => {
        await page.getByRole('button', { name: 'Print view', exact: true }).click();
        await expect(page.getByTestId('stageBadge')).toHaveText('Print view · supports under the lower dome');
      }),
      fileName('Suggested name, two-sided', '"-two-sided"', 'useFigureStore', 'Mobile-Figure-moon-60mm-puffy-two-sided.stl', (core, p) => core.figure.filename(p)),
    ],
  },
  {
    tab: 'Figures',
    part: 'Figures',
    title: 'Second hole',
    seed: { [K.figure]: { style: 'star', height: 60, chainHole: true } },
    rows: [
      T('For a figure hanging below this one: raindrops under a cloud, a star under the moon.'),
      fileName('Suggested name, chain', '"-chain"', 'useFigureStore', 'Mobile-Figure-star-60mm-chain.stl', (core, p) => core.figure.filename(p)),
      Do('Warning', 'No room: “No room for the thread hole / second hole …”, orange', 'No room for the second hole', async (page) => {
        await page.evaluate(async () => {
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const state = stores.useFigureStore.getState();
          stores.useFigureStore.setState({ bundle: { ...state.bundle, holes: 1, holesWanted: 2, hangingHole: { x: 0, y: 0 } } });
        });
        const warning = page.getByTestId('figureHoleWarning');
        await expect(warning).toHaveText('No room for the second hole: make the figure taller or the hole smaller.');
        await expect(warning).toHaveAttribute('data-tone', 'warning');
        await page.evaluate(async () => {
          const stores = await import(/* @vite-ignore */ '/balloon-studio/src/stores/index.ts' as string);
          const state = stores.useFigureStore.getState();
          stores.useFigureStore.setState({ bundle: { ...state.bundle, holes: 0, holesWanted: 1, hangingHole: null } });
        });
        await expect(warning).toHaveText('No room for the thread hole: make the figure taller or the hole smaller.');
      }, { webNeedle: 'No room for the second hole' }),
      M('THREAD HOLE', /^Ø 2( · 2)?$/, 'mm'),
    ],
  },
];

// ---- Cable clip ----

const CLIP_NAILLESS = { cableDiameter: 3.75, mount: 'adhesive', nailDiameter: 1.8, nailHeadDiameter: 3.3, nailHeadHeight: 0.7, nailGap: 3, plate: 2, length: 6, wall: 0.7, overlap: 0.5, flat: false };

const clip: Scene[] = [
  {
    tab: 'Cable clip',
    part: 'Cable clip',
    title: 'Defaults (nail)',
    rows: [
      T('CABLE'),
      P('Cable diameter', 2, 6, 0.05, 'mm', { value: '3.75' }),
      T("Measure the lead over its fabric sheath. The strap's arch is 0.1 mm wider than the cable, which lies on the plate."),
      T('WALL FIXING'),
      G('Wall fixing', ['Nail', 'Adhesive'], 'Nail', { needle: 'accessibilityLabel("Wall fixing")', webNeedle: 'label="Wall fixing"' }),
      T('The plate runs on past the strap and the nail goes through that extension, so the hammer meets flat plate and never the strap. The head sinks in under the cable.', { needle: 'The plate runs on past the strap' }),
      P('Plate thickness', 1.2, 4, 0.1, 'mm', { value: '2' }),
      P('Nail shaft', 1, 4, 0.1, 'mm', { value: '1.8' }),
      P('Nail head', 2, 8, 0.1, 'mm', { value: '3.3' }),
      P('Head height', 0.3, 2, 0.1, 'mm', { value: '0.7' }),
      P('Nail gap from the strap', 0.4, 10, 0.5, 'mm', { value: '3' }),
      Do('Readout', 'Nail caption with plate run, counterbore and clip length', 'mm past the strap on one side', async (page) => {
        await expect(page.locator('#root')).toContainText(/The plate runs [\d.]+ mm past the strap on one side\. The head's counterbore, [\d.]+ mm wide and [\d.]+ mm deep, starts [\d.]+ mm past the strap: that is the room the hammer or a nail punch has\. The whole clip is [\d.]+ mm long\./);
      }, { webNeedle: 'mm past the strap on one side' }),
      T('STRAP'),
      P('Length along the cable', 4, 12, 0.5, 'mm', { value: '6' }),
      P('Thickness', 0.6, 1.2, 0.1, 'mm', { value: '0.7' }),
      P('Overlap below the cable', 0.3, 1.5, 0.1, 'mm', { value: '0.5' }),
      Do('Readout', 'Strap caption with edge, opening and lift', 'The strap is the spring', async (page) => {
        await expect(page.locator('#root')).toContainText(/The strap is the spring\. A thinner strap bends further; more overlap holds the cable better but needs a wider opening\. On the open side the plate ends [\d.]+ mm past the cable's middle under the strap, so the passage between the tip and the plate's edge is [\d.]+ mm, and the cable lifts the strap about [\d.]+ mm on its way in\./);
      }),
      Do('Readout', 'Strain label, accent up to 2.2 %', 'Strain about', async (page) => {
        const strain = page.getByTestId('clipStrain');
        await expect(strain).toContainText(/^Strain about [\d.]+ % as the cable goes in · PLA takes about 2 %, PETG more$/);
      }),
      T('PRINT'),
      C('Print lying on the plate', { checked: false }),
      T("Standing on the strap's end, the profile lies on the bed and the strap bends within its layers. Use a brim."),
      B('Export Clip STL…', { testId: 'exportCableClip', kind: 'Export', needle: '"Export Clip STL…"', webNeedle: 'label="Export Clip STL…"', disabled: false }),
      T('One STL · print orientation · millimetres', { kind: 'Export' }),
      G('Clip view', ['On the wall', 'Print view'], 'On the wall', { testId: 'cableClipPreviewPart', kind: 'Preview', needle: 'Picker("Clip view"', webNeedle: 'label="Clip view"' }),
      T('Cable clip · Ø 3.75 mm', { kind: 'Preview', needle: 'Cable clip · Ø', webNeedle: 'names(shownParameters).displayName' }),
      statusRow(),
      stageRow(/cable clip/),
      Do('Preview', 'Badge on the wall', 'On the wall · press the cable in from the open side', async (page) => {
        await expect(page.getByTestId('stageBadge')).toHaveText('On the wall · press the cable in from the open side');
      }),
      editorHint(),
      Do('Preview', 'Face view ↔ Angled view', 'topDown ? "Angled view" : "Face view"', stageChanges(clickRole('button', 'Face view'), clickRole('button', 'Angled view')), { webNeedle: "'Angled view' : 'Face view'" }),
      Do('Preview', 'Reset clip camera (help): undoes an orbit', 'Reset clip camera', resetAfterOrbit('Reset clip camera')),
      Do('Preview', 'Five colours with names and help', 'colorNames = ["Linen", "Wall white", "Black", "Grey", "Sage"]', async (page) => {
        for (const name of ['Linen', 'Wall white', 'Black', 'Grey', 'Sage']) {
          await expect(page.getByRole('button', { name: `${name} · preview only`, exact: true })).toHaveAttribute('title', `${name} · preview only`);
        }
      }, { webNeedle: "'Wall white'" }),
      T('Colour · preview only', { kind: 'Preview' }),
      Do('Preview', 'A swatch recolors the stage', 'colorIndex = i', stageChanges(clickRole('button', 'Sage · preview only'), clickRole('button', 'Linen · preview only')), { webNeedle: 'onSelect(i)' }),
      C('Wall', { kind: 'Preview', checked: true, needle: 'assembly ? "Wall" : "Build plate"', webNeedle: "'Wall' : 'Build plate'" }),
      Do('Preview', 'Wall toggles the wall', 'Toggle(assembly ? "Wall" : "Build plate", isOn:$showPlate)', stageChanges(clickRole('checkbox', 'Wall'), clickRole('checkbox', 'Wall')), { webNeedle: 'setShowPlate' }),
      Do('Preview', 'Wireframe (off by default)', 'Toggle("Wireframe", isOn:$wireframe)', stageChanges(clickRole('checkbox', 'Wireframe'), clickRole('checkbox', 'Wireframe')), { webNeedle: 'setWireframe' }),
      M('SIZE', /^[\d.]+ × [\d.]+ × [\d.]+$/, 'mm'),
      M('OPENING', /^[\d.]+ · lifts [\d.]+$/, 'mm'),
      M('BEYOND THE CABLE', /^\+[\d.]+ wide · \+[\d.]+ tall$/, 'mm'),
      T('Nail the plate, then press the cable in from the open side'),
      T('The nail sits past the strap, so the hammer never touches it; finish with a nail punch. The strap springs open for the cable and closes over it. A clip every 30 to 40 cm, two near a turn. The spring is not yet confirmed in print.'),
      Do('Preview', 'Print view: badge and “Build plate” label', 'Standing on the strap', async (page) => {
        await page.getByRole('radio', { name: 'Print view', exact: true }).click();
        await expect(page.getByTestId('stageBadge')).toHaveText("Standing on the strap's end · profile on the bed · brim");
        await expect(page.getByRole('checkbox', { name: 'Build plate', exact: true })).toBeChecked();
        await page.getByRole('radio', { name: 'On the wall', exact: true }).click();
      }, { webNeedle: "Standing on the strap's end · profile on the bed" }),
      savedLine('useClipStore', '"Saved · Show in Finder"', "'Saved' : 'Downloaded'", (mode) => `${mode === 'saved' ? 'Saved' : 'Downloaded'} · file.stl`),
      busyLabel('useClipStore', 'exportCableClip', 'Preparing clip…', true),
      exportAlert('useClipStore', 'Clip export failed'),
      fileName('Suggested name', 'Cable-Clip-\\(cableText)', 'useClipStore', 'Cable-Clip-3.75mm.stl', (core, p) => core.clip.filename(p)),
      Do('Export', 'Save panel strings (title, prompt, name, message)', 'Export Cable Clip', panelStrings('exportCableClip', ['Export Cable Clip', 'Export Clip', 'One-piece clip in print orientation. Millimetres.'], 'Cable-Clip-3.75mm.stl'), { webNeedle: 'exportTable' }),
      Do('Shortcut', '⌘E / Ctrl+E exports', 'keyboardShortcut("e")', exportShortcut('exportCableClip'), { webNeedle: 'onExport' }),
      Do('Shortcut', '⌘O / Ctrl+O opens', 'keyboardShortcut("o")', openShortcut, { webNeedle: 'onOpen' }),
      Do('Shortcut', 'Reset: Alt+N → defaults', 'case .clip:clip.apply(CableClipParameters())', resetShortcut('Plate thickness', '3', '2'), { decided: ALT_N, webNeedle: 'onReset' }),
      Do('Persistence', `${K.clip}: written at once, Mac JSON keys, survives a reload`, K.clip, persists(K.clip, 'Cable clip', 'Plate thickness', '2.5', 'plate', CLIP_KEYS), { webNeedle: 'cableClip.v1' }),
    ],
  },
  {
    tab: 'Cable clip',
    part: 'Cable clip',
    title: 'Adhesive',
    seed: { [K.clip]: CLIP_NAILLESS },
    rows: [
      T('No extension and no hole: the plate is as long as the strap and is stuck on with a pad of tape or mounting putty.', { needle: 'No extension and no hole' }),
      Do('Control', 'Adhesive hides the nail controls', 'if p.mount == .nail {', async (page) => {
        for (const name of ['Nail shaft', 'Nail head', 'Head height', 'Nail gap from the strap']) await expect(page.getByRole('textbox', { name, exact: true })).toHaveCount(0);
      }, { webNeedle: "p.mount === 'nail'" }),
      Do('Readout', 'Glue pad caption', 'mm² of glue pad', async (page) => {
        await expect(page.locator('#root')).toContainText(/The plate is [\d.]+ mm wide under the strap and [\d.]+ mm long, about \d+ mm² of glue pad\./);
      }),
      fileName('Suggested name, adhesive', '"-adhesive"', 'useClipStore', 'Cable-Clip-3.75mm-adhesive.stl', (core, p) => core.clip.filename(p)),
    ],
  },
  {
    tab: 'Cable clip',
    part: 'Cable clip',
    title: 'Lying flat',
    seed: { [K.clip]: { ...CLIP_NAILLESS, mount: 'nail', flat: true } },
    rows: [
      T('Lying flat the plate is on the bed and the arch is bridged, but the strap bends across its layers: PETG rather than PLA.'),
      Do('Preview', 'Print view badge', 'Lying on the plate · arch bridged · no supports', async (page) => {
        await page.getByRole('radio', { name: 'Print view', exact: true }).click();
        await expect(page.getByTestId('stageBadge')).toHaveText('Lying on the plate · arch bridged · no supports');
      }),
      fileName('Suggested name, flat', '"-flat"', 'useClipStore', 'Cable-Clip-3.75mm-flat.stl', (core, p) => core.clip.filename(p)),
    ],
  },
  {
    tab: 'Cable clip',
    part: 'Cable clip',
    title: 'Head too small for the nail',
    seed: { [K.clip]: { ...CLIP_NAILLESS, mount: 'nail', nailDiameter: 4, nailHeadDiameter: 2 } },
    rows: [
      W('A 2.0 mm head is too small for a 4.0 mm nail: it needs a head of 4.6 mm or more to hold the plate.', { needle: 'head is too small', webNeedle: 'head is too small' }),
      Do('Warning', 'Export gray and disabled while there is a problem', 'c.problem == nil ? accent : Color.gray', async (page) => {
        await expect(page.getByTestId('exportCableClip')).toBeDisabled();
        await expect(page.getByTestId('exportCableClip')).toHaveClass(/fc-export--blocked/);
      }, { webNeedle: 'blocked={c.problem !== null}' }),
      Do('Warning', 'The plate grows: “The plate is n mm here: at least 0.6 mm thicker …”', 'at least 0.6 mm thicker than the nail head', async (page) => {
        await page.getByRole('textbox', { name: 'Head height', exact: true }).fill('2');
        await page.getByRole('textbox', { name: 'Head height', exact: true }).press('Enter');
        await page.getByRole('textbox', { name: 'Plate thickness', exact: true }).fill('1.2');
        await page.getByRole('textbox', { name: 'Plate thickness', exact: true }).press('Enter');
        await expect(page.locator('#root')).toContainText(/The plate is [\d.]+ mm here: at least 0\.6 mm thicker than the nail head, so the head sinks in flush\./);
      }, { webNeedle: 'at least 0.6 mm thicker than the nail head' }),
    ],
  },
  {
    tab: 'Cable clip',
    part: 'Cable clip',
    title: 'High strain',
    seed: { [K.clip]: { ...CLIP_NAILLESS, mount: 'nail', cableDiameter: 2, wall: 1.2, overlap: 1.5 } },
    rows: [
      Do('Warning', 'Strain above 2.2 %: orange with a triangle', 'c.snapStrain > 0.022', async (page) => {
        const strain = page.getByTestId('clipStrain');
        await expect(strain).toHaveAttribute('data-tone', 'warning');
        await expect(strain.locator('[data-symbol="exclamationmark.triangle"]')).toHaveCount(1);
      }, { webNeedle: 'c.snapStrain > 0.022' }),
    ],
  },
];

export const SCENES: readonly Scene[] = [...shell, ...balloon, ...basket, ...ring, ...cloud, ...sun, ...figure, ...clip];
