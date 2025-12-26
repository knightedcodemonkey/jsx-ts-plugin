module.exports = [
  {
    name: 'editor-features.tsx',
    expectDiagnostics: [
      {
        code: 2304,
        messageIncludes: "Cannot find name 'Wid'",
        atText: 'Wid',
      },
    ],
    extraFiles: {
      'widget.tsx': [
        "import { reactJsx } from '@knighted/jsx/react'",
        '',
        'export type WidgetProps = { title: string }',
        'export const Widget = ({ title }: WidgetProps) => reactJsx`<span>${title}</span>`',
      ].join('\n'),
    },
    completions: [
      {
        description: 'auto-import widget completion inside template',
        position: { match: 'Wid', offset: 3 },
        options: {
          includeCompletionsForModuleExports: true,
          includeCompletionsWithInsertText: true,
        },
        expectEntries: [
          {
            name: 'Widget',
            details: {
              codeActionTextIncludes: 'import { Widget ',
              codeActionSpanStart: {
                match: "import { reactJsx } from '@knighted/jsx/react'",
                offset: "import { reactJsx } from '@knighted/jsx/react'".length + 1,
              },
            },
          },
        ],
      },
      {
        description: 'infoTarget property completion inside template',
        position: {
          match: 'infoTarget.count',
          offset: 'infoTarget.'.length + 'count'.length,
        },
        expectEntries: [
          {
            name: 'count',
          },
        ],
      },
    ],
    quickInfo: [
      {
        description: 'infoTarget quick info within template expression',
        position: { match: 'infoTarget', occurrence: 1 },
        textIncludes: ['const infoTarget: InfoTarget'],
        expectSpanText: 'infoTarget',
      },
    ],
    source: [
      "import { reactJsx } from '@knighted/jsx/react'",
      '',
      'type InfoTarget = { slug: string; count: number }',
      'const infoTarget: InfoTarget = { slug: "demo", count: 42 }',
      '',
      'export const EditorSignals = reactJsx`',
      '  <section data-slug=${infoTarget.slug} data-count=${infoTarget.count}>',
      '    <${Wid} title=${"typed"} />',
      '  </section>',
      '`',
    ].join('\n'),
  },
]
