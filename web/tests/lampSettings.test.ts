// Ported from mac/Tests/LampSettingsTests.swift @ cbda68d.
import { describe, it } from 'vitest';
import { CoreFailure, LAMP_SETTINGS_ERROR } from '../src/core/api';
import { cloudParameters, encodeCloudParameters, normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { decodeLampSettings } from '../src/core/lamp/lampSettingsFile';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { utf8Decode } from '../src/core/swift/text';
import { check } from '../src/core/testing/check';
import type { CloudParameters, WallLampKind } from '../src/core/types';
import { referenceText, sameParameters } from './support/lamp';

describe('lamp settings', () => {
  it('keeps every saved option', () => {
    const cloud: CloudParameters = {
      ...cloudParameters(),
      style: 'billow', mirrored: true,
      width: 239, depth: 28, diffuserThickness: 0.8,
      surface: 'sculpted', surfaceDepth: 20,
      stripWidth: 10, stripThickness: 4, stripCutLength: 25, ledRowSpacing: 18,
      clipFit: 0.4, cableDiameter: 5, cableSide: 'left',
      strainRelief: false, nailHead: 9, nailShaft: 4,
      nailInsert: true, nailDiameter: 2.1, nailHeadDiameter: 4.2,
    };
    const sun: CloudParameters = { ...cloud, kind: 'sun', sunStyle: 'pinwheel' };
    for (const input of [cloud, sun]) {
      const expected = normalized(input);
      const restored = decodeLampSettings(encodeCloudParameters(expected));
      check(sameParameters(restored, expected), 'Opening lamp settings lost a saved option');
    }
  });

  // Use the JSON actually packaged alongside the printable parts.
  it('restores the settings of an exported kit', () => {
    for (const kind of ['cloud', 'sun'] as WallLampKind[]) {
      const kit = new CloudKit(wallLampDefaults(kind));
      const entry = kit.entries().find(([name]) => name === `${kind}-settings.json`)!;
      const reopened = decodeLampSettings(utf8Decode(entry[1]));
      check(sameParameters(reopened, kit.parameters), 'An exported lamp kit cannot restore its settings');
    }
  });

  it('opens the five legacy files', () => {
    const files: [string, number, number, number, number, WallLampKind][] = [
      ['cloud-lamp-100', 100.0, 16.0, 0.8, 14.0, 'cloud'],
      ['cloud-lamp-230', 230.0, 28.0, 1.2, 14.0, 'cloud'],
      ['cloud-lamp-100-led-rows', 100.0, 22.0, 0.8, 14.0, 'cloud'],
      ['cloud-lamp-239-led-rows', 239.0, 22.0, 0.8, 18.0, 'cloud'],
      ['sun-lamp-200', 200.0, 22.0, 1.2, 14.0, 'sun'],
    ];
    for (const [folder, width, depth, thickness, rowSpacing, kind] of files) {
      const restored = decodeLampSettings(referenceText(`fixtures/legacy-settings/${folder}-${kind}-settings.json`));
      check(restored.kind === kind && restored.width === width && restored.depth === depth, 'An older exported design opened with the wrong shape or dimensions');
      check(restored.diffuserThickness === thickness && restored.ledRowSpacing === rowSpacing, 'An older exported design lost its diffuser or LED settings');
      check(
        restored.style === 'classic' && !restored.mirrored && restored.sunStyle === 'soft-star' && restored.surface === 'flat',
        'Missing newer options did not preserve the older design',
      );
    }
  });

  it('migrates and normalizes', () => {
    // Suns saved as one of the former designs open as the first sun.
    const former = decodeLampSettings('{"kind":"sun","sunStyle":"halo","width":180,"depth":22,"diffuserThickness":1.2}');
    check(former.kind === 'sun' && former.sunStyle === 'soft-star' && former.width === 180, 'A sun of a former design did not open');

    const sparse = decodeLampSettings('{"width":100,"depth":16,"diffuserThickness":0.8}');
    check(sparse.kind === 'cloud' && sparse.stripCutLength === 16 && sparse.ledRowSpacing === 14, 'Legacy settings did not receive the migration defaults');
    const clamped = decodeLampSettings('{"width":999,"depth":-1,"diffuserThickness":0,"stripWidth":12,"ledRowSpacing":1}');
    check(
      clamped.width === 500 && clamped.depth === 16 && clamped.diffuserThickness === 0.8 && clamped.ledRowSpacing === 16,
      "Opened settings bypassed the editor's supported dimensions",
    );
  });

  it('rejects what is not a lamp', () => {
    for (const invalid of [
      '', '{', '[]', 'null', '{}', '{"unrelated":true}',
      '{"width":100,"depth":16}',
      '{"width":null,"depth":16,"diffuserThickness":0.8}',
      '{"width":"100","depth":16,"diffuserThickness":0.8}',
      '{"width":100,"depth":16,"diffuserThickness":0.8,"kind":"basket"}',
      '{"width":100,"depth":16,"diffuserThickness":0.8,"style":"unknown"}',
      '{"width":100,"depth":16,"diffuserThickness":0.8,"mirrored":"yes"}',
      '{"width":1e999,"depth":16,"diffuserThickness":0.8}',
    ]) {
      let failure: unknown;
      try {
        decodeLampSettings(invalid);
      } catch (error) {
        failure = error;
      }
      // Expected: callers receive an actionable error before applying a design.
      check(
        failure instanceof CoreFailure && failure.code === 'invalid-lamp-settings' && failure.message === LAMP_SETTINGS_ERROR,
        `Invalid or unrelated JSON was accepted as lamp settings: ${invalid}`,
      );
    }
  });
});
