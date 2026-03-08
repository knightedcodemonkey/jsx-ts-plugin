module.exports = [
  {
    name: 'dom-multiline-expression-errors.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
        atText: 'badHandlerValue',
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'const badHandlerValue: number = 123',
      '',
      'export const broken = jsx`',
      '  <button',
      '    onClick=${badHandlerValue}',
      '    class="dom-multiline-errors"',
      '  >',
      '    Broken handler',
      '  </button>',
      '`',
    ].join('\n'),
  },
]
