module.exports = [
  {
    name: 'config-empty-tag.tsx',
    config: {
      mode: 'react',
      tag: '   ',
    },
    expectDiagnostics: [],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const customReact = reactJsx',
      '',
      'export const emptyTagIgnored = customReact`',
      '  <button onClick=${"still wrong"} />',
      '`',
    ].join('\n'),
  },
  {
    name: 'config-invalid-tag-modes-entry.tsx',
    config: {
      tagModes: {
        brokenAlias: 'unknown-mode',
        validReactAlias: 'react',
      },
    },
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      "import { jsx } from '@knighted/jsx'",
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const brokenAlias = jsx',
      'const validReactAlias = reactJsx',
      '',
      'type BadgeProps = { label: string }',
      'const Badge = ({ label }: BadgeProps) => reactJsx`<span>${label}</span>`',
      '',
      'export const ignored = brokenAlias`',
      '  <button onClick=${"still wrong"} />',
      '`',
      '',
      'export const valid = validReactAlias`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
  {
    name: 'config-tags-invalid-mode.tsx',
    config: {
      mode: 'unsupported-mode',
      tags: ['fallbackDomAlias'],
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
      'const fallbackDomAlias = jsx',
      '',
      'export const invalidModeFallback = fallbackDomAlias`',
      '  <button onClick=${"still wrong"} />',
      '`',
    ].join('\n'),
  },
]
