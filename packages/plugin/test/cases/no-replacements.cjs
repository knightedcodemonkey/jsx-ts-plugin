module.exports = [
  {
    name: 'no-tagged-templates.ts',
    expectDiagnostics: [],
    source: [
      'export const add = (a: number, b: number) => a + b',
      '',
      'export const answer = add(19, 23)',
    ].join('\n'),
  },
]
