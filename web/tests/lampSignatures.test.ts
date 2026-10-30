// The lamp modules import each other, as the Swift files do (see cloudGeometry.ts). Whichever a
// bundle reaches first, none may read another at module level.
import { describe, expect, it, vi } from 'vitest';

const modules: Record<string, () => Promise<unknown>> = {
  cableClamp: () => import('../src/core/lamp/cableClamp'),
  cableSeal: () => import('../src/core/lamp/cableSeal'),
  cloudGeometry: () => import('../src/core/lamp/cloudGeometry'),
  cloudLedLayout: () => import('../src/core/lamp/cloudLedLayout'),
  lampSettingsFile: () => import('../src/core/lamp/lampSettingsFile'),
  lampSurface: () => import('../src/core/lamp/lampSurface'),
  nailInsert: () => import('../src/core/lamp/nailInsert'),
  sunGeometry: () => import('../src/core/lamp/sunGeometry'),
};

describe('lamp modules', () => {
  it.each(Object.keys(modules))('load with %s first', async (name) => {
    vi.resetModules();
    await expect(modules[name]!()).resolves.toBeDefined();
    const { lampProfile, cloudParameters, height } = await import('../src/core/lamp/cloudGeometry');
    const { wallLampDefaults } = await import('../src/core/lamp/sunGeometry');
    expect(height(cloudParameters())).toBeGreaterThan(0);
    expect(lampProfile(wallLampDefaults('sun')).polygons.length).toBe(12);
  });
});
