const assert = require('node:assert/strict')
const ts = require('typescript/lib/tsserverlibrary.js')
const plugin = require('../dist/jsx-ts-plugin.js')

const testing = plugin.__testing
if (!testing) {
  console.error('Internal testing helpers were not attached to the plugin export.')
  process.exit(1)
}

let failures = 0

const run = (name, fn) => {
  try {
    fn()
    console.log(`✔ ${name}`)
  } catch (error) {
    failures += 1
    console.error(`✖ ${name}`)
    console.error(error.stack ?? error)
  }
}

run('inferScriptKindFromFileName handles additional extensions', () => {
  assert.equal(
    testing.inferScriptKindFromFileName('/tmp/component.jsx'),
    ts.ScriptKind.JSX,
  )
  assert.equal(testing.inferScriptKindFromFileName('widget.js'), ts.ScriptKind.JS)
  assert.equal(testing.inferScriptKindFromFileName('plugin.mts'), ts.ScriptKind.TS)
  assert.equal(testing.inferScriptKindFromFileName('schema.json'), ts.ScriptKind.JSON)
  assert.equal(
    testing.inferScriptKindFromFileName('readme.custom'),
    ts.ScriptKind.Unknown,
  )
})

run('disposeCachedEntry calls completion service dispose', () => {
  let disposed = false
  testing.disposeCachedEntry({
    hasTemplates: true,
    configKey: 'test',
    completionService: {
      dispose() {
        disposed = true
      },
    },
  })
  assert.equal(disposed, true)
})

run('lastNonWhitespaceChar reports undefined for whitespace', () => {
  assert.equal(testing.lastNonWhitespaceChar('\n  \t  '), undefined)
})

run('mapReplacementPositionToOriginal remaps expression spans', () => {
  const spans = [
    {
      originalStart: 10,
      originalEnd: 30,
      replacementStart: 100,
      replacementEnd: 130,
      segments: [
        { kind: 'literal', rStart: 100, rEnd: 110, oStart: 10, oEnd: 20 },
        { kind: 'expr', rStart: 110, rEnd: 120, oStart: 20, oEnd: 25 },
      ],
    },
  ]
  const mapped = testing.mapReplacementPositionToOriginal(spans, 112)
  assert.equal(mapped, 22)
})

run('mapReplacementPositionToOriginal falls back to original span offsets', () => {
  const spans = [
    {
      originalStart: 0,
      originalEnd: 4,
      replacementStart: 10,
      replacementEnd: 16,
      segments: [],
    },
  ]
  const mapped = testing.mapReplacementPositionToOriginal(spans, 12)
  assert.equal(mapped, 2)
})

run('mapOriginalPositionToReplacement falls back to span deltas', () => {
  const spans = [
    {
      originalStart: 50,
      originalEnd: 60,
      replacementStart: 200,
      replacementEnd: 215,
      segments: [],
    },
  ]
  const mapped = testing.mapOriginalPositionToReplacement(spans, 55)
  assert.equal(mapped, 205)
})

run('remapCompletionEntriesToOriginal updates replacement spans', () => {
  const spans = [
    {
      originalStart: 0,
      originalEnd: 5,
      replacementStart: 100,
      replacementEnd: 105,
      segments: [{ kind: 'expr', rStart: 100, rEnd: 105, oStart: 0, oEnd: 5 }],
    },
  ]
  const entries = [
    {
      name: 'demo',
      kind: ts.ScriptElementKind.memberVariableElement,
      sortText: '0',
      replacementSpan: { start: 101, length: 2 },
    },
  ]
  const remapped = testing.remapCompletionEntriesToOriginal(entries, spans)
  assert.notEqual(remapped, entries)
  assert.equal(remapped[0].replacementSpan.start, 1)
})

run('remapQuickInfoSpan remaps spans when offsets change', () => {
  const spans = [
    {
      originalStart: 0,
      originalEnd: 5,
      replacementStart: 100,
      replacementEnd: 105,
      segments: [{ kind: 'expr', rStart: 100, rEnd: 105, oStart: 0, oEnd: 5 }],
    },
  ]
  const info = {
    kind: ts.ScriptElementKind.memberVariableElement,
    kindModifiers: '',
    textSpan: { start: 101, length: 2 },
    displayParts: [],
  }
  const remapped = testing.remapQuickInfoSpan(info, spans)
  assert.equal(remapped.textSpan.start, 1)
})

const diagnosticText = '({foo})value=${bar}'
const diagnosticSpan = {
  originalStart: 100,
  originalEnd: 130,
  replacementStart: 0,
  replacementEnd: diagnosticText.length,
  segments: [
    { kind: 'inserted', rStart: 0, rEnd: 1, oStart: 100, oEnd: 100, fallback: 'next' },
    { kind: 'expr', rStart: 1, rEnd: 5, oStart: 100, oEnd: 104 },
    {
      kind: 'inserted',
      rStart: 5,
      rEnd: 6,
      oStart: 104,
      oEnd: 104,
      fallback: 'previous',
    },
    { kind: 'literal', rStart: 6, rEnd: 13, oStart: 104, oEnd: 111 },
    { kind: 'expr', rStart: 13, rEnd: 16, oStart: 111, oEnd: 114 },
  ],
}
const diagnosticFile = { text: diagnosticText }
const sourceFile = { fileName: 'synthetic.ts' }

run('mapDiagnosticToOriginal advances to following segment when needed', () => {
  const diagnostic = {
    code: 1111,
    start: 0,
    length: 1,
    messageText: 'test',
    file: diagnosticFile,
  }
  const mapped = testing.mapDiagnosticToOriginal(diagnostic, sourceFile, [diagnosticSpan])
  assert.equal(mapped.start, 100)
})

run('mapDiagnosticToOriginal can fall back to previous segment', () => {
  const diagnostic = {
    code: 2222,
    start: 5,
    length: 1,
    messageText: 'test',
    file: diagnosticFile,
  }
  const mapped = testing.mapDiagnosticToOriginal(diagnostic, sourceFile, [diagnosticSpan])
  assert.equal(mapped.start, 103)
})

run('mapDiagnosticToOriginal retargets literal assignment diagnostics', () => {
  const diagnostic = {
    code: 2322,
    start: 7,
    length: 1,
    messageText: 'assignment mismatch',
    file: diagnosticFile,
  }
  const mapped = testing.mapDiagnosticToOriginal(diagnostic, sourceFile, [diagnosticSpan])
  assert.equal(mapped.start, 111)
})

run('mapDiagnosticToOriginal handles segments without neighbors', () => {
  const spans = [
    {
      originalStart: 300,
      originalEnd: 310,
      replacementStart: 0,
      replacementEnd: 2,
      segments: [
        {
          kind: 'inserted',
          rStart: 0,
          rEnd: 2,
          oStart: 300,
          oEnd: 300,
          fallback: 'next',
        },
      ],
    },
  ]
  const diagnostic = {
    code: 9999,
    start: 1,
    length: 1,
    messageText: 'no neighbors',
    file: { text: '()' },
  }
  const mapped = testing.mapDiagnosticToOriginal(diagnostic, sourceFile, spans)
  assert.equal(mapped.start, 301)
})

if (failures) {
  process.exitCode = 1
  console.error('Internal coverage assertions failed.')
} else {
  console.log('All internal coverage assertions passed.')
}
