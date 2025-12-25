module.exports = [
  {
    name: 'diagnostic-adjustment.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
      },
      {
        code: 2322,
        messageIncludes: "Type 'true' is not assignable",
      },
      {
        code: 2322,
        messageIncludes: "Type 'JsxRenderable' is not assignable",
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      'const invalidHandler = "handler"',
      'const secondaryInvalid = true',
      '',
      'export const multiple = jsx`',
      '  <>',
      '    <button onClick=${invalidHandler}>',
      '      <div>${"text"}</div>',
      '    </button>',
      '    <input onFocus=${secondaryInvalid} />',
      '  </>',
      '`',
      '',
      'const needsAdjustment: boolean = multiple',
    ].join('\n'),
  },
]
