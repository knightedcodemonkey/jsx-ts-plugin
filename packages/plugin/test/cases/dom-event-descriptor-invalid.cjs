module.exports = [
  {
    name: 'dom-event-descriptor-invalid.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      "const descriptor = { handler: 'nope' }",
      '',
      'export const invalid = jsx`',
      '  <button on:ready=${descriptor} />',
      '`',
    ].join('\n'),
  },
]
