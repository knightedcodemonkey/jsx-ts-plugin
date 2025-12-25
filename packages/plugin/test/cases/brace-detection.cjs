module.exports = [
  {
    name: 'brace-detection-tag-position.tsx',
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
      'export const tagPosition = jsx`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
  {
    name: 'brace-detection-already-braced.tsx',
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
      'const invalidHandler = "handler"',
      '',
      'export const alreadyWrapped = jsx`',
      '  <button onClick={${invalidHandler}} />',
      '`',
    ].join('\n'),
  },
  {
    name: 'brace-detection-closing-tag.tsx',
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
      'const invalidHandler = "handler"',
      'const Wrapper = ({ children }: { children?: any }) => jsx`<div>${children}</div>`',
      '',
      'export const closingTag = jsx`',
      '  <${Wrapper}>',
      '    <button onClick=${invalidHandler} />',
      '  </${Wrapper}>',
      '`',
    ].join('\n'),
  },
]
