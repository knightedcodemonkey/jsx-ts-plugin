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

const samples = loadSamplesFromCases()

if (!samples.length) {
  console.error('No verification samples found. Did you add any files under test/cases?')
  process.exitCode = 1
  process.exit()
}

const noopWatcher = () => ({ close() {} })
const pluginFactory = initPlugin({ typescript: ts })

function createLanguageService(sample) {
  const fileName = path.join(process.cwd(), '__virtual__', sample.name)
  const files = new Map([[fileName, { text: sample.source, version: 0 }]])
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

let hasFailures = false

for (const sample of samples) {
  const { plugin, fileName } = createLanguageService(sample)
  const diagnostics = plugin.getSemanticDiagnostics(fileName)

  if (!sample.expectDiagnostics.length) {
    if (diagnostics.length === 0) {
      console.log(`✔ ${sample.name}: no diagnostics`)
    } else {
      hasFailures = true
      console.error(
        `✖ ${sample.name}: expected no diagnostics but received ${diagnostics.length}`,
      )
      diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    }
    continue
  }

  if (diagnostics.length !== sample.expectDiagnostics.length) {
    hasFailures = true
    console.error(
      `✖ ${sample.name}: expected ${sample.expectDiagnostics.length} diagnostics but received ${diagnostics.length}`,
    )
    diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    continue
  }

  const pending = [...diagnostics]

  sample.expectDiagnostics.forEach(expected => {
    const matchIndex = pending.findIndex(diag => {
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
      return diag.code === expected.code && message.includes(expected.messageIncludes)
    })

    if (matchIndex === -1) {
      hasFailures = true
      console.error(
        `✖ ${sample.name}: missing diagnostic TS${expected.code} containing "${expected.messageIncludes}"`,
      )
      diagnostics.forEach(diag => console.error('  -', formatDiagnostic(diag)))
    } else {
      pending.splice(matchIndex, 1)
    }
  })

  if (!hasFailures) {
    console.log(`✔ ${sample.name}: diagnostics match expectations`)
  }
}

if (hasFailures) {
  process.exitCode = 1
  console.error('Plugin verification failed.')
} else {
  console.log('All plugin verification checks passed.')
}
