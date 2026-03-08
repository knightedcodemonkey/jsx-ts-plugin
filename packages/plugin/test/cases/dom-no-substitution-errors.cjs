module.exports = [
  {
    name: 'dom-no-substitution-errors.tsx',
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
      'export const broken = jsx`<button onClick="not a handler">No substitutions</button>`',
    ].join('\n'),
  },
]
