module.exports = [
  {
    name: 'directive-nodes-less-than-directives.tsx',
    expectDiagnostics: [],
    source: [
      '/// <reference lib="dom" />',
      "import { jsx } from '@knighted/jsx'",
      '',
      '/* @jsx-dom */',
      '/* @jsx-react */',
      '// @jsx-dom',
      '',
      'export const plain = jsx`',
      '  <div>no directives used</div>',
      '`',
    ].join('\n'),
  },
]
