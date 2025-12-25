module.exports = [
  {
    name: 'config-max-templates.tsx',
    config: {
      maxTemplatesPerFile: 1,
      tagModes: {
        cappedDom: 'dom',
        cappedReact: 'react',
      },
    },
    expectDiagnostics: [],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const cappedDom = jsx',
      'const cappedReact = reactJsx',
      '',
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => reactJsx`<span>${label}</span>`',
      '',
      'export const skippedDomError = cappedDom`',
      '  <button onClick=${"still nope"} />',
      '`',
      '',
      'export const skippedReactError = cappedReact`',
      '  <section>',
      '    <${Badge} label=${789} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
