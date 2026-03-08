module.exports = [
  {
    name: 'react-tag-position-errors.tsx',
    expectDiagnostics: [
      {
        code: 2604,
        messageIncludes: 'does not have any construct or call signatures',
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const NotAComponent = 42',
      '',
      'export const broken = reactJsx`',
      '  <${NotAComponent} label="oops" />',
      '`',
    ].join('\n'),
  },
]
