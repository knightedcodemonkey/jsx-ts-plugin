module.exports = [
  {
    name: 'react-multi-diagnostic-same-template.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
        atText: '123',
      },
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
        atText: "'oops'",
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'type CardProps = {',
      '  title: string',
      '  count: number',
      '}',
      '',
      'const Card = ({ title, count }: CardProps) => reactJsx`<article>${title} · ${count}</article>`',
      '',
      'export const broken = reactJsx`',
      "  <${Card} title=${123} count=${'oops'} />",
      '`',
    ].join('\n'),
  },
]
