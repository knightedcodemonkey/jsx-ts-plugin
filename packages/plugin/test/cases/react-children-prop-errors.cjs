module.exports = [
  {
    name: 'react-children-prop-errors.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const NeedsText = ({ children }: { children: string }) => reactJsx`<p>${children}</p>`',
      '',
      'export const broken = reactJsx`',
      '  <${NeedsText} children=${123} />',
      '`',
    ].join('\n'),
  },
]
