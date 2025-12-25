module.exports = [
  {
    name: 'brace-spans.tsx',
    expectDiagnostics: [
      {
        code: 2322,
        messageIncludes: "Type 'number' is not assignable",
      },
    ],
    source: [
      "import { jsx } from '@knighted/jsx'",
      '',
      'const count = 2',
      'const Icon = ({ label }: { label: string }) => jsx`<span data-label=${label} />`',
      '',
      'export const domView = jsx`',
      '  <section>',
      '    <${Icon} label=${"ok"} />',
      '    <button onClick=${count} data-note=${["x", "y"]}>',
      '      Count is ${count}',
      '      <span>',
      '        Total:',
      '        ${count}',
      '      </span>',
      '    </button>',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
