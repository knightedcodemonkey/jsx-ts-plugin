module.exports = [
  {
    name: 'dom-attr-type.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'export const invalid = jsx`',
      '  <button className=${123} />',
      '`',
    ].join('\n'),
  },
]
