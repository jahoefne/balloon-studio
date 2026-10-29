// ESLint for the geometry/export core (docs/plan.md, Abschnitt 3 and 4: WP-K1).
// web/src/core must be deterministic across browsers and match Swift bit for bit, so it may not
// use engine-dependent Math functions, JS min/max/round semantics, bare sorts, `**`, clocks,
// randomness, DOM APIs or node: modules. Use swift/dmath.ts, swift/minmax.ts, swift/rounding.ts
// and swift/sort.ts instead. Test files (*.test.ts) compare against Math.* and node:crypto and
// are exempt.
import tseslint from 'typescript-eslint';

const bannedMath = [
  ['sin', 'dmath.sin'],
  ['cos', 'dmath.cos'],
  ['tan', 'dmath.tan'],
  ['asin', 'dmath.asin'],
  ['acos', 'dmath.acos'],
  ['atan', 'dmath.atan'],
  ['atan2', 'dmath.atan2'],
  ['sinh', 'a dmath function'],
  ['cosh', 'a dmath function'],
  ['tanh', 'a dmath function'],
  ['asinh', 'a dmath function'],
  ['acosh', 'a dmath function'],
  ['atanh', 'a dmath function'],
  ['exp', 'dmath.exp'],
  ['expm1', 'dmath.exp'],
  ['log', 'dmath.log'],
  ['log1p', 'dmath.log'],
  ['log2', 'dmath.log'],
  ['log10', 'dmath.log'],
  ['pow', 'dmath.pow, or x * x for squares'],
  ['cbrt', 'dmath.cbrt'],
  ['hypot', 'dmath.hypot (Swift hypot = sqrt(x*x + y*y))'],
  ['min', 'swiftMin/swiftMin3/arrayMin from swift/minmax.ts (Swift tie and -0 semantics)'],
  ['max', 'swiftMax/swiftMax3/arrayMax from swift/minmax.ts (Swift tie and -0 semantics)'],
  ['round', 'rounded from swift/rounding.ts (halves away from zero)'],
  ['random', 'nothing: the core is deterministic'],
].map(([property, replacement]) => ({
  object: 'Math',
  property,
  message: `Math.${property} is not deterministic Swift semantics; use ${replacement}.`,
}));

export default tseslint.config(
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
    rules: {
      'no-restricted-properties': ['error', ...bannedMath],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: 'The ** operator is banned in the core (engine-dependent pow); use dmath.pow or x * x.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'The **= operator is banned in the core (engine-dependent pow); use dmath.pow or x * x.',
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='sort'][arguments.length=0]",
          message: 'A bare .sort() compares strings; use stableSorted/sortedDoubles from swift/sort.ts or pass a comparator.',
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='toSorted'][arguments.length=0]",
          message: 'A bare .toSorted() compares strings; use stableSorted/sortedDoubles from swift/sort.ts or pass a comparator.',
        },
        {
          selector: "MemberExpression[object.name='Intl'][property.name!='Segmenter']",
          message: 'Only Intl.Segmenter (swift/text.ts) is allowed in the core.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No clocks in the core: output must not depend on time.' },
        { name: 'performance', message: 'No clocks in the core: output must not depend on time.' },
        { name: 'document', message: 'The core runs in a worker and in Node: no DOM.' },
        { name: 'window', message: 'The core runs in a worker and in Node: no DOM.' },
        { name: 'navigator', message: 'The core runs in a worker and in Node: no DOM.' },
        { name: 'OffscreenCanvas', message: 'The core rasterizes in software (core/raster): no canvas.' },
        { name: 'HTMLCanvasElement', message: 'The core rasterizes in software (core/raster): no canvas.' },
        { name: 'localStorage', message: 'Persistence belongs to the UI, not the core.' },
        { name: 'crypto', message: 'Use io/sha256.ts (synchronous, identical everywhere).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'The core runs in the browser worker: no node: modules (tests may use them).' },
            { group: ['react', 'react-dom', 'three', 'zustand', '**/ui/**', '**/app/**'], message: 'The core must not depend on UI code.' },
          ],
        },
      ],
    },
  },
);
