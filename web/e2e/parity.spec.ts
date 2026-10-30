import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { Pending } from './parity/dsl';
import { SCENES } from './parity/rows';

// Walks docs/parity-checklist.md in the running app and writes the results next to this file.
// `npm run e2e:parity` runs it on both cores and regenerates the document (parity/report.mjs).

const core = process.env.E2E_CORE === 'real' ? 'real' : 'stub';

interface Result {
  part: string;
  scene: string;
  kind: string;
  name: string;
  needle: string | null;
  webNeedle?: string | undefined;
  decided?: string | undefined;
  open?: { owner: string; note: string } | undefined;
  status: 'pass' | 'pending' | 'fail';
  only?: 'real' | undefined;
  message?: string;
  owner?: string;
}

test.describe.configure({ mode: 'serial' });

const results: Result[] = [];

for (const scene of SCENES.filter((candidate) => !candidate.only || candidate.only === core)) {
  test(`${scene.part} · ${scene.title}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    expect(info.project.name).toBe('chromium');
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('./');
    await page.evaluate((seed) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, JSON.stringify(value));
    }, scene.seed ?? {});
    await page.reload();
    await page.getByRole('radio', { name: scene.tab, exact: true }).click();
    await expect(page.locator('#root')).toContainText('Live preview', { timeout: 120_000 });
    await scene.setup?.(page);
    await page.waitForTimeout(250);
    if (scene.title !== 'Import review (a reconstructed STL)') await expect(page.locator('#root')).toContainText('Live preview', { timeout: 120_000 });

    for (const row of scene.rows) {
      const base: Result = {
        part: scene.part,
        scene: scene.title,
        kind: row.kind,
        name: row.name,
        needle: row.needle,
        webNeedle: row.webNeedle,
        decided: row.decided,
        open: row.open,
        status: 'pass',
        only: scene.only,
      };
      try {
        await row.check(page);
        results.push(base);
      } catch (error) {
        if (error instanceof Pending) {
          results.push({ ...base, status: 'pending', owner: error.owner, message: error.message });
        } else {
          const message = error instanceof Error ? error.message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' ') : String(error);
          results.push({ ...base, status: 'fail', message });
          // Leave no dialog behind for the next row.
          await page.keyboard.press('Escape').catch(() => undefined);
        }
      }
    }
    if (pageErrors.length > 0) results.push({ part: scene.part, scene: scene.title, kind: 'Readout', name: 'No uncaught page errors', needle: null, status: 'fail', message: pageErrors.join(' | ') });
    // After every scene: a long run that dies still leaves what it saw.
    const dir = join(import.meta.dirname, '.results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `parity-${core}.json`), `${JSON.stringify({ core, at: new Date().toISOString(), results }, null, 1)}\n`);
  });
}
