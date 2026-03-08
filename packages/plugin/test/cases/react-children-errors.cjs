module.exports = [
  {
    name: 'react-children-errors.tsx',
    expectDiagnostics: [
      {
        code: 2745,
        messageIncludes: "expects type 'string'",
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const NeedsText = ({ children }: { children: string }) => reactJsx`<p>${children}</p>`',
      '',
      'export const broken = reactJsx`',
      '  <${NeedsText}>${reactJsx`<strong>not text</strong>`}</${NeedsText}>',
      '`',
    ].join('\n'),
  },
]
