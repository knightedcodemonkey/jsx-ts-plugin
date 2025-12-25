module.exports = [
  {
    name: 'config-tag-runtime-dom.tsx',
    config: {
      mode: 'runtime',
      tag: '  legacyRuntime  ',
    },
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
      'const legacyRuntime = jsx',
      '',
      'export const runtimeDomError = legacyRuntime`',
      '  <button onClick=${"still not a handler"} />',
      '`',
    ].join('\n'),
  },
  {
    name: 'config-tags-react.tsx',
    config: {
      mode: 'react',
      tags: ['legacyReactArray', '  spacedReactAlias  ', '   ', 42],
    },
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const spacedReactAlias = reactJsx',
      '',
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => reactJsx`<span>${label}</span>`',
      '',
      'export const reactArrayError = spacedReactAlias`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
  {
    name: 'config-tag-modes.tsx',
    config: {
      tagModes: {
        altDom: 'dom',
        altReact: 'react',
      },
    },
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
      },
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const altDom = jsx',
      'const altReact = reactJsx',
      '',
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => reactJsx`<span>${label}</span>`',
      '',
      'export const domOverrideError = altDom`',
      '  <button onClick=${"still wrong"} />',
      '`',
      '',
      'export const reactOverrideError = altReact`',
      '  <section>',
      '    <${Badge} label=${456} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
