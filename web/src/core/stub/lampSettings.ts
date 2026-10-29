// Ported from mac/Sources/BalloonStudio/LampSettingsFile.swift @ 03c9307.

import { CoreFailure, LAMP_SETTINGS_ERROR, type LampSettingsApi } from '../api';
import type { CloudParameters } from '../types';
import { decodeLamp, normalizeLamp } from './cloud';
import { container, required } from './json';

/**
 * An opened file must identify a lamp (width, depth and diffuser thickness present) before
 * the preference defaults may fill in the rest. Any failure is the one actionable message.
 */
export const decodeLampSettings = (text: string): CloudParameters => {
  try {
    const value: unknown = JSON.parse(text);
    const fields = container(value);
    for (const key of ['width', 'depth', 'diffuserThickness']) required.double(fields, key);
    return normalizeLamp(decodeLamp(value));
  } catch {
    throw new CoreFailure('invalid-lamp-settings', LAMP_SETTINGS_ERROR);
  }
};

export const lampSettings: LampSettingsApi = { decode: decodeLampSettings };
