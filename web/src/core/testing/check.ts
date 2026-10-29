// Ported from mac/Tests/GeometryTests.swift @ cbda68d (lines 5-7: `require`) and
// mac/Tests/PatternTests.swift (line 7: `check`). Swift's test runners call fatalError; the
// port throws, so vitest reports the message. Swift `require(cond, msg)` → `check(cond, msg)`.

export class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}

/** Swift `require(condition, message)` / `check(value, message)`. */
export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new CheckError(message);
}
