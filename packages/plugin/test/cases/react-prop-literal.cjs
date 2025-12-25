module.exports = [
  {
    name: 'react-prop-literal.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
        atText: '456',
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'type WidgetProps = { title: string }',
      'const Widget = ({ title }: WidgetProps) => reactJsx`<span>${title}</span>`',
      '',
      'export const LiteralMapping = reactJsx`',
      '  <article>',
      '    <${Widget} title=${456} />',
      '  </article>',
      '`',
    ].join('\n'),
  },
]
