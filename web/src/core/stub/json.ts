// JSONDecoder / JSONEncoder semantics for the parameter codecs.
// TODO(WP-K1): encoding moves to core/swift/json.ts (`encodeJSONCompact`) once it lands.

import { CoreFailure, INVALID_SETTINGS_MESSAGE, type Codec } from '../api';
import { jsonNumber } from './swiftCompat';

/** A failed `init(from:)`; codecs turn it into `CoreFailure('invalid-settings')`. */
export class DecodeError extends Error {}

export type Container = Readonly<Record<string, unknown>>;

/** `decoder.container(keyedBy:)`: a JSON object, nothing else. */
export const container = (value: unknown): Container => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DecodeError('Expected a keyed container');
  return value as Container;
};

const present = (c: Container, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined;

// `JSONDecoder` reads JSON numbers as Double; out-of-range literals (1e999) fail, which
// `JSON.parse` turns into Infinity.
const asDouble = (v: unknown, key: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DecodeError(`${key}: expected Double`);
  return v;
};
const asInt = (v: unknown, key: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > 2 ** 63) throw new DecodeError(`${key}: expected Int`);
  return v;
};
const asBool = (v: unknown, key: string): boolean => {
  if (typeof v !== 'boolean') throw new DecodeError(`${key}: expected Bool`);
  return v;
};
const asString = (v: unknown, key: string): string => {
  if (typeof v !== 'string') throw new DecodeError(`${key}: expected String`);
  return v;
};
const asEnum = <T extends string>(v: unknown, key: string, cases: readonly T[]): T => {
  const raw = asString(v, key);
  if (!(cases as readonly string[]).includes(raw)) throw new DecodeError(`${key}: unknown raw value ${raw}`);
  return raw as T;
};

/** `try c.decodeIfPresent(T.self, forKey:)`: absent or null is nil, a wrong type throws. */
export const ifPresent = {
  double: (c: Container, key: string): number | undefined => {
    const v = present(c, key);
    return v === undefined || v === null ? undefined : asDouble(v, key);
  },
  int: (c: Container, key: string): number | undefined => {
    const v = present(c, key);
    return v === undefined || v === null ? undefined : asInt(v, key);
  },
  bool: (c: Container, key: string): boolean | undefined => {
    const v = present(c, key);
    return v === undefined || v === null ? undefined : asBool(v, key);
  },
  string: (c: Container, key: string): string | undefined => {
    const v = present(c, key);
    return v === undefined || v === null ? undefined : asString(v, key);
  },
  enum: <T extends string>(c: Container, key: string, cases: readonly T[]): T | undefined => {
    const v = present(c, key);
    return v === undefined || v === null ? undefined : asEnum(v, key, cases);
  },
};

/** `((try? c.decodeIfPresent(String.self, forKey:)) ?? nil).flatMap(T.init(rawValue:))`: never throws. */
export const lenientEnum = <T extends string>(c: Container, key: string, cases: readonly T[]): T | undefined => {
  const v = present(c, key);
  return typeof v === 'string' && (cases as readonly string[]).includes(v) ? (v as T) : undefined;
};

/** `try c.decode(T.self, forKey:)` of synthesized Codable: the key must be there and not null. */
export const required = {
  double: (c: Container, key: string): number => {
    const v = present(c, key);
    if (v === undefined || v === null) throw new DecodeError(`${key}: missing`);
    return asDouble(v, key);
  },
  enum: <T extends string>(c: Container, key: string, cases: readonly T[]): T => {
    const v = present(c, key);
    if (v === undefined || v === null) throw new DecodeError(`${key}: missing`);
    return asEnum(v, key, cases);
  },
};

type JsonValue = string | number | boolean | null | undefined | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** JSONEncoder with `.sortedKeys`: compact, nil (null/undefined) omitted, `/` escaped. */
export const encodeSorted = (value: JsonValue): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return jsonNumber(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value).replaceAll('/', '\\/');
  if (Array.isArray(value)) return `[${(value as readonly JsonValue[]).map(encodeSorted).join(',')}]`;
  const object = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(object)
    .filter((key) => object[key] !== null && object[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : b < a ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${encodeSorted(object[key])}`).join(',')}}`;
};

/** Builds a `Codec` from an `init(from:)` port. */
export const makeCodec = <T>(decodeValue: (value: unknown) => T): Codec<T> => {
  const decodeOrFail = (value: unknown): T => {
    try {
      return decodeValue(value);
    } catch (error) {
      if (error instanceof DecodeError) throw new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
      throw error;
    }
  };
  return {
    decode(text) {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
      }
      return decodeOrFail(value);
    },
    decodeValue: decodeOrFail,
    encode: (value) => encodeSorted(value as unknown as JsonValue),
  };
};
