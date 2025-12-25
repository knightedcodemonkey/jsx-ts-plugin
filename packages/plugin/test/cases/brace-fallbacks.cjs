module.exports = [
  {
    name: 'brace-fallbacks.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'true' is not assignable",
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'const invalidHandler = true',
      '',
      'export const view = jsx`',
      '  <>',
      '    ${"   "}',
      '    <button onClick=${invalidHandler}>',
      '      ${"\\n        "}',
      '      Click me',
      '    </button>',
      '    ${"\\n"}',
      '  </>',
      '`',
    ].join('\n'),
  },
]
