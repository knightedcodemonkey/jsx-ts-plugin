module.exports = [
  {
    name: 'directive-overrides.tsx',
    config: {
      mode: 'react',
      tag: 'legacyReactSingle',
      tags: ['legacyReactMulti'],
      tagModes: {
        customDom: 'dom',
      },
    },
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
      {
        code: 2322,
        messageIncludes: "Type 'string' is not assignable",
      },
    ],
    source: [
      "import { jsx as customDom } from '@knighted/jsx'",
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const legacyReactSingle = reactJsx',
      'const legacyReactMulti = reactJsx',
      '',
      'const Badge = ({ label }: { label: string }) => reactJsx`<span>${label}</span>`',
      '',
      'export const reactError = legacyReactSingle`',
      '  <section>',
      '    <${Badge} label=${123} />',
      '  </section>',
      '`',
      '',
      '/* @jsx-react */',
      'export const reactOverride = customDom`',
      '  <${Badge} label="ok" />',
      '`',
      '',
      '/* @jsx-dom */',
      'export const domError = legacyReactMulti`',
      '  <button onClick=${"not a handler"} />',
      '`',
    ].join('\n'),
  },
]
