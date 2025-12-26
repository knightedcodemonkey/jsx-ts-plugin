module.exports = [
  {
    name: 'completion-fallback.tsx',
    expectDiagnostics: [],
    completions: [
      {
        description: 'fallback completions on non-template file',
        position: {
          match: 'metrics.count',
          offset: 'metrics.'.length + 'cou'.length,
        },
        expectEntries: [
          {
            name: 'count',
            details: {},
          },
        ],
      },
    ],
    source: [
      'const metrics = { count: 1, label: "ok" }',
      'metrics.count',
      '',
      'export default metrics',
    ].join('\n'),
  },
]
