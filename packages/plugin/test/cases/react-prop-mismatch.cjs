module.exports = [
  {
    name: 'react-prop-mismatch.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
        atText: '123',
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => reactJsx`<span>${label}</span>`',
      '',
      'export const view = reactJsx`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
