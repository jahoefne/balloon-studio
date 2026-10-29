// Ported from Swift String semantics used by mac/Sources/BalloonStudio @ cbda68d
// (BalloonPatterns.swift:55 `String(text.prefix(64).map {$0.isWhitespace ? " " : $0})`, kit
// texts, ZIP entry names; docs/plan.md, Abschnitt 3). Measured with probes/arith.swift (WS).
//
// Swift `Character` is an extended grapheme cluster → Intl.Segmenter('grapheme'), the only
// Intl API allowed in the core. `Character.isWhitespace` tests the *first* scalar for the
// Unicode White_Space property, so " \u{301}" (one Character) counts as whitespace.

let segmenter: Intl.Segmenter | undefined;

/** Swift `Array(string)`: the extended grapheme clusters of `s`. */
export function swiftCharacters(s: string): string[] {
  segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' });
  const out: string[] = [];
  for (const { segment } of segmenter.segment(s)) out.push(segment);
  return out;
}

/** Swift `string.count`. */
export function swiftCount(s: string): number {
  return swiftCharacters(s).length;
}

/** Swift `String(string.prefix(n))`, counted in Characters. */
export function swiftPrefix(s: string, n: number): string {
  return swiftCharacters(s).slice(0, n).join('');
}

const WHITE_SPACE = /^\p{White_Space}/u;

/** Swift `Character.isWhitespace`: the first Unicode scalar has the White_Space property. */
export function isSwiftWhitespace(character: string): boolean {
  return WHITE_SPACE.test(character);
}

let encoder: TextEncoder | undefined;
let decoder: TextDecoder | undefined;

/** Swift `Data(string.utf8)`. Lone surrogates (impossible in a Swift String) become U+FFFD. */
export function utf8(s: string): Uint8Array {
  encoder ??= new TextEncoder();
  return encoder.encode(s);
}

/** Swift `String(decoding: data, as: UTF8.self)`: invalid sequences become U+FFFD. */
export function utf8Decode(bytes: Uint8Array): string {
  decoder ??= new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  return decoder.decode(bytes);
}
