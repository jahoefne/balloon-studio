// Ported from mac/Sources/BalloonStudio/LampSettingsFile.swift @ cbda68d.

import { CoreFailure, LAMP_SETTINGS_ERROR, type LampSettingsApi } from '../api';
import type { CloudParameters } from '../types';
import { decodeCloudParameters, decodeRequiredDouble, normalized } from './cloudGeometry';

/** Swift `ReadError.invalidSettings` carries `LAMP_SETTINGS_ERROR` of core/api.ts as its description. */
export const decodeLampSettings = (data: string): CloudParameters => {
  try {
    const value: unknown = JSON.parse(data);
    // Preferences allow missing values for migration. An opened file must
    // identify a lamp before those defaults can replace the current design.
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a keyed container');
    const fields = value as Readonly<Record<string, unknown>>;
    for (const key of ['width', 'depth', 'diffuserThickness']) decodeRequiredDouble(fields, key);
    return normalized(decodeCloudParameters(value));
  } catch {
    throw new CoreFailure('invalid-lamp-settings', LAMP_SETTINGS_ERROR);
  }
};

export const LampSettingsFile: LampSettingsApi = { decode: decodeLampSettings };
