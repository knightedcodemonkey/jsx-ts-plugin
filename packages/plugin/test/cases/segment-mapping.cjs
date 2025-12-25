module.exports = [
  {
    name: 'segment-mapping-braced.tsx',
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
      'const invalidHandler = "still wrong"',
      'const label = "text"',
      '',
      'export const bracedSegment = jsx`',
      '  <button onClick=${invalidHandler}>',
      '    {${label}}',
      '  </button>',
      '`',
    ].join('\n'),
  },
  {
    name: 'segment-mapping-tag-position.tsx',
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
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => jsx`<span>${label}</span>`',
      '',
      'export const tagPositionSegment = jsx`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
