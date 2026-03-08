module.exports = [
  {
    name: 'directive-override-errors.tsx',
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
      "import { jsx } from '@knighted/jsx'",
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'const Badge = ({ label }: { label: string }) => reactJsx`<span>${label}</span>`',
      '',
      '// @jsx-react',
      'export const reactOverride = jsx`<${Badge} label=${123} />`',
      '',
      '/* @jsx-dom */',
      'export const domOverride = reactJsx`<button onClick=${"not a handler"}>Broken</button>`',
    ].join('\n'),
  },
]
