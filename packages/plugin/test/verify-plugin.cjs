const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const initPlugin = require('../dist/jsx-ts-plugin.js')

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: '@knighted/jsx',
  lib: ['ES2022', 'DOM'],
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
}

const defaultFormatCodeSettings = {
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  newLineCharacter: ts.sys.newLine ?? '\n',
}

const CASES_DIR = path.join(__dirname, 'cases')

const flattenSamples = mod => {
  if (typeof mod === 'function') {
    return flattenSamples(mod())
  }

  if (Array.isArray(mod)) {
    return mod
  }

  if (mod && Array.isArray(mod.samples)) {
    return mod.samples
  }

  return []
}

function loadSamplesFromCases() {
  if (!fs.existsSync(CASES_DIR)) {
    return []
  }

  const caseFiles = fs
    .readdirSync(CASES_DIR)
    .filter(file => file.endsWith('.cjs'))
    .sort()

  return caseFiles.flatMap(file => {
    const resolved = path.join(CASES_DIR, file)
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(resolved)
    return flattenSamples(mod)
  })
}

const requestedSamples = (process.env.SAMPLE || process.env.SAMPLES || '')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean)

const samples = loadSamplesFromCases().filter(sample => {
  if (!requestedSamples.length) return true
  return requestedSamples.some(name =>
    sample.name.toLowerCase().includes(name.toLowerCase()),
  )
})

if (!samples.length) {
  if (requestedSamples.length) {
    console.error(
      `No verification samples matched filter: ${requestedSamples.map(n => `'${n}'`).join(', ')}`,
    )
  } else {
    console.error(
      'No verification samples found. Did you add any files under test/cases?',
    )
  }
  process.exitCode = 1
  process.exit()
}

const noopWatcher = () => ({ close() {} })
const pluginFactory = initPlugin({ typescript: ts })

const sampleSourceFileCache = new WeakMap()

function createLanguageService(sample) {
  const baseDir = path.join(process.cwd(), '__virtual__')
  const fileName = path.join(baseDir, sample.name)
  const files = new Map([[fileName, { text: sample.source, version: 0 }]])
  if (sample.extraFiles && typeof sample.extraFiles === 'object') {
    Object.entries(sample.extraFiles).forEach(([relativePath, text]) => {
      const resolved = path.join(baseDir, relativePath)
      files.set(resolved, { text, version: 0 })
    })
  }
  const fileExists = file => files.has(file) || ts.sys.fileExists(file)
  const readFile = file =>
    files.has(file) ? files.get(file).text : ts.sys.readFile(file)
  const getScriptSnapshot = file => {
    const info = files.get(file)
    if (info) {
      return ts.ScriptSnapshot.fromString(info.text)
    }
    const disk = ts.sys.readFile(file)
    if (disk === undefined) {
      return undefined
    }
    return ts.ScriptSnapshot.fromString(disk)
  }

  const moduleResolutionHost = {
    fileExists,
    readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath ?? (value => value),
  }

  const host = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: file => String(files.get(file)?.version ?? 0),
    getScriptSnapshot,
    fileExists,
    readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map(moduleName => {
        const resolution = ts.resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionHost,
        )
        return resolution.resolvedModule
      }),
  }

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry())
  const plugin = pluginFactory.create({
    languageService,
    languageServiceHost: host,
    config: sample.config ?? {},
    project: {
      getCompilerOptions: () => compilerOptions,
      getRootFileNames: () => [...files.keys()],
    },
    serverHost: {
      ...ts.sys,
      watchFile: noopWatcher,
      watchDirectory: noopWatcher,
      setTimeout,
      clearTimeout,
      setImmediate,
      clearImmediate,
    },
  })

  return { plugin, fileName }
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || diagnostic.start === undefined) {
    return `${message} (TS${diagnostic.code})`
  }
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  )
  const relPath = path.relative(process.cwd(), diagnostic.file.fileName)
  return `${relPath}:${line + 1}:${character + 1} - ${message} (TS${diagnostic.code})`
}

function validateDiagnostics(sample, diagnostics) {
  if (!sample.expectDiagnostics.length) {
    if (diagnostics.length === 0) {
      console.log(`✔ ${sample.name}: no diagnostics`)
      return true
    }
    console.error(
      `✖ ${sample.name}: expected no diagnostics but received ${diagnostics.length}`,
    )
    diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    return false
  }

  if (diagnostics.length !== sample.expectDiagnostics.length) {
    console.error(
      `✖ ${sample.name}: expected ${sample.expectDiagnostics.length} diagnostics but received ${diagnostics.length}`,
    )
    diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    return false
  }

  let success = true
  const pending = [...diagnostics]

  sample.expectDiagnostics.forEach(expected => {
    const matchIndex = pending.findIndex(diag => {
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
      return diag.code === expected.code && message.includes(expected.messageIncludes)
    })

    if (matchIndex === -1) {
      success = false
      console.error(
        `✖ ${sample.name}: missing diagnostic TS${expected.code} containing "${expected.messageIncludes}"`,
      )
      diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    } else {
      const matched = pending.splice(matchIndex, 1)[0]
      if (expected.atText) {
        const fileText = matched.file?.text ?? sample.source
        const start = matched.start ?? -1
        const snippet =
          start >= 0 ? fileText.slice(start, start + expected.atText.length) : undefined
        if (snippet !== expected.atText) {
          success = false
          console.error(
            `✖ ${sample.name}: diagnostic TS${expected.code} did not start at the expected text "${expected.atText}"`,
          )
          console.error(`  - actual snippet: "${snippet ?? 'unknown'}" (offset ${start})`)
        }
      }
    }
  })

  if (success) {
    console.log(`✔ ${sample.name}: diagnostics match expectations`)
  }
  return success
}

function verifyCompletionExpectations(sample, plugin, fileName) {
  let success = true
  sample.completions.forEach(expectation => {
    const description = expectation.description ?? 'completion expectation'
    let position
    try {
      position = resolveSamplePosition(sample, expectation.position)
    } catch (error) {
      success = false
      console.error(`✖ ${sample.name}: ${description} - ${error.message}`)
      return
    }

    const result = plugin.getCompletionsAtPosition(
      fileName,
      position,
      expectation.options,
      expectation.formatOptions,
    )

    if (!result) {
      success = false
      console.error(`✖ ${sample.name}: ${description} - no completions returned`)
      return
    }

    if (Array.isArray(expectation.expectEntries)) {
      expectation.expectEntries.forEach(entryExpectation => {
        const entry = result.entries.find(
          candidate => candidate.name === entryExpectation.name,
        )
        if (!entry) {
          success = false
          console.error(
            `✖ ${sample.name}: ${description} - missing completion entry "${entryExpectation.name}"`,
          )
          return
        }

        if (entryExpectation.replacementSpanText !== undefined) {
          if (!entry.replacementSpan) {
            success = false
            console.error(
              `✖ ${sample.name}: ${description} - entry "${entryExpectation.name}" did not include a replacement span`,
            )
          } else {
            const snippet = sample.source.slice(
              entry.replacementSpan.start,
              entry.replacementSpan.start + entry.replacementSpan.length,
            )
            if (snippet !== entryExpectation.replacementSpanText) {
              success = false
              console.error(
                `✖ ${sample.name}: ${description} - entry "${entryExpectation.name}" replacement text mismatch (expected "${entryExpectation.replacementSpanText}", received "${snippet}")`,
              )
            }
          }
        }

        if (entryExpectation.details) {
          const formatOptions =
            entryExpectation.details.formatOptions ?? defaultFormatCodeSettings
          const details = plugin.getCompletionEntryDetails(
            fileName,
            position,
            entryExpectation.name,
            formatOptions,
            entryExpectation.details.source ?? entry.source,
            entryExpectation.details.preferences,
            entry.data,
          )

          if (!details) {
            success = false
            console.error(
              `✖ ${sample.name}: ${description} - missing completion details for "${entryExpectation.name}"`,
            )
            return
          }

          const textChanges = collectCodeActionTextChanges(details.codeActions)
          if (entryExpectation.details.codeActionTextIncludes) {
            const combined = textChanges
              .map(({ textChange }) => textChange.newText)
              .join('\n')
            if (!combined.includes(entryExpectation.details.codeActionTextIncludes)) {
              success = false
              console.error(
                `✖ ${sample.name}: ${description} - completion code actions did not contain "${entryExpectation.details.codeActionTextIncludes}"`,
              )
            }
          }

          if (entryExpectation.details.codeActionSpanStart !== undefined) {
            if (!textChanges.length) {
              success = false
              console.error(
                `✖ ${sample.name}: ${description} - expected code action span but no text changes were supplied`,
              )
            } else {
              const expectedSpanStart =
                typeof entryExpectation.details.codeActionSpanStart === 'object'
                  ? resolveSamplePosition(
                      sample,
                      entryExpectation.details.codeActionSpanStart,
                    )
                  : entryExpectation.details.codeActionSpanStart
              const span = textChanges[0].textChange.span
              if (!span || span.start !== expectedSpanStart) {
                success = false
                console.error(
                  `✖ ${sample.name}: ${description} - expected first code action span to start at ${expectedSpanStart}, received ${span?.start ?? 'unknown'}`,
                )
              }
            }
          }
        }
      })
    }
  })

  if (success) {
    console.log(`✔ ${sample.name}: completion expectations satisfied`)
  }
  return success
}

function verifyQuickInfoExpectations(sample, plugin, fileName) {
  let success = true
  sample.quickInfo.forEach(expectation => {
    const description = expectation.description ?? 'quick info expectation'
    let position
    try {
      position = resolveSamplePosition(sample, expectation.position)
    } catch (error) {
      success = false
      console.error(`✖ ${sample.name}: ${description} - ${error.message}`)
      return
    }

    const info = plugin.getQuickInfoAtPosition(fileName, position)
    if (!info) {
      success = false
      console.error(`✖ ${sample.name}: ${description} - no quick info returned`)
      return
    }

    if (Array.isArray(expectation.textIncludes)) {
      const flattened = ts.displayPartsToString(info.displayParts)
      expectation.textIncludes.forEach(fragment => {
        if (!flattened.includes(fragment)) {
          success = false
          console.error(
            `✖ ${sample.name}: ${description} - quick info text missing "${fragment}"`,
          )
        }
      })
    }

    if (expectation.expectSpanText !== undefined) {
      const snippet = sample.source.slice(
        info.textSpan.start,
        info.textSpan.start + info.textSpan.length,
      )
      if (snippet !== expectation.expectSpanText) {
        success = false
        console.error(
          `✖ ${sample.name}: ${description} - quick info span mismatch (expected "${expectation.expectSpanText}", received "${snippet}")`,
        )
      }
    }
  })

  if (success) {
    console.log(`✔ ${sample.name}: quick info expectations satisfied`)
  }
  return success
}

function resolveSamplePosition(sample, locator) {
  if (typeof locator === 'number') {
    return locator
  }

  if (locator && typeof locator === 'object') {
    if (typeof locator.line === 'number' && typeof locator.character === 'number') {
      const sourceFile = getSampleSourceFile(sample)
      return ts.getPositionOfLineAndCharacter(
        sourceFile,
        locator.line - 1,
        locator.character - 1,
      )
    }

    if (typeof locator.match === 'string') {
      const occurrence = locator.occurrence ?? 0
      let fromIndex = 0
      let index = -1
      for (let i = 0; i <= occurrence; i += 1) {
        index = sample.source.indexOf(locator.match, fromIndex)
        if (index === -1) break
        fromIndex = index + locator.match.length
      }
      if (index === -1) {
        throw new Error(
          `could not find match "${locator.match}" at occurrence ${occurrence}`,
        )
      }
      return index + (locator.offset ?? 0)
    }

    if (typeof locator.offset === 'number') {
      return locator.offset
    }
  }

  throw new Error('invalid position locator')
}

function getSampleSourceFile(sample) {
  let cached = sampleSourceFileCache.get(sample)
  if (!cached) {
    cached = ts.createSourceFile(
      sample.name,
      sample.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    sampleSourceFileCache.set(sample, cached)
  }
  return cached
}

function collectCodeActionTextChanges(codeActions) {
  if (!codeActions?.length) return []
  const bucket = []
  codeActions.forEach(action => {
    action.changes.forEach(change => {
      change.textChanges.forEach(textChange => {
        bucket.push({ action, change, textChange })
      })
    })
  })
  return bucket
}

let hasFailures = false

for (const sample of samples) {
  const { plugin, fileName } = createLanguageService(sample)
  const diagnostics = plugin.getSemanticDiagnostics(fileName)

  const diagnosticsOk = validateDiagnostics(sample, diagnostics)
  let sampleFailed = !diagnosticsOk

  if (diagnosticsOk && Array.isArray(sample.completions) && sample.completions.length) {
    const completionsOk = verifyCompletionExpectations(sample, plugin, fileName)
    if (!completionsOk) {
      sampleFailed = true
    }
  }

  if (diagnosticsOk && Array.isArray(sample.quickInfo) && sample.quickInfo.length) {
    const quickInfoOk = verifyQuickInfoExpectations(sample, plugin, fileName)
    if (!quickInfoOk) {
      sampleFailed = true
    }
  }

  if (sampleFailed) {
    hasFailures = true
  }
}

if (hasFailures) {
  process.exitCode = 1
  console.error('Plugin verification failed.')
} else {
  console.log('All plugin verification checks passed.')
}
