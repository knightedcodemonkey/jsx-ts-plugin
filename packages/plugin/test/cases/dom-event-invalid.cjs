module.exports = [
  {
    name: 'dom-event-invalid.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
        atText: '"nope"',
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'export const broken = jsx`',
      '  <section',
      '    onClick=${"nope"}',
      '  />',
      '`',
    ].join('\n'),
  },
]
