// `Codec` (api.ts) on top of JSONDecoder semantics: `JSONKeyedContainer` reads both the text and an
// already parsed value, and a DecodingError leaves as `CoreFailure('invalid-settings', …)` with
// Foundation's message. Shared by core/real and core/stub.
import { CoreFailure, type Codec } from './api';
import { encodeJSONCompact, JSONDecodeError, JSONKeyedContainer, type JSONValue } from './swift/json';

/** Runs a decoder and turns its `JSONDecodeError` into the contract's error. */
function decoding<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof JSONDecodeError) throw new CoreFailure('invalid-settings', error.message);
    throw error;
  }
}

/** A codec from a parameter module's own text and value decoders. */
export function settingsCodec<T>(fromText: (text: string) => T, fromValue: (value: unknown) => T, encode: (value: T) => string): Codec<T> {
  return {
    decode: (text) => decoding(() => fromText(text)),
    decodeValue: (value) => decoding(() => fromValue(value)),
    encode,
  };
}

/** `JSONEncoder` with `.sortedKeys` of a flat settings struct; a `null` optional is nil and omitted. */
export function encodeSettings(value: object): string {
  const fields: Record<string, JSONValue> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== null) fields[key] = field as JSONValue;
  }
  return encodeJSONCompact(fields);
}

/** A codec from the body of an `init(from:)`; call the readers in Swift's declaration order. */
export function keyedCodec<T extends object>(fields: (c: JSONKeyedContainer) => T, encode: (value: T) => string = encodeSettings): Codec<T> {
  return settingsCodec(
    (text) => fields(JSONKeyedContainer.fromJSON(text)),
    (value) => fields(JSONKeyedContainer.fromValue(value)),
    encode,
  );
}

/** `((try? c.decodeIfPresent(String.self, forKey:)) ?? nil).flatMap(T.init(rawValue:))`: never throws. */
export function lenientEnumeration<T extends string>(c: JSONKeyedContainer, key: string, cases: readonly T[]): T | undefined {
  const raw = c.lenientString(key);
  return raw !== undefined && (cases as readonly string[]).includes(raw) ? (raw as T) : undefined;
}
