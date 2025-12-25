module.exports = [
  {
    name: 'dom-whitespace.tsx',
    expectDiagnostics: [],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'export const LooseWhitespace = jsx`',
      '  <section>',
      '    ${"up"}${42}',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
