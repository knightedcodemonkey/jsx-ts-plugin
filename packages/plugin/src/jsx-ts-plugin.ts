import path from 'node:path'
import * as ts from 'typescript/lib/tsserverlibrary.js'

type Mode = 'dom' | 'react'

type NormalizedConfig = {
  tagModes: Map<string, Mode>
  maxTemplatesPerFile?: number
}

type ReplacementSpan = {
  originalStart: number
  originalEnd: number
  replacementStart: number
  replacementEnd: number
  segments: Array<Segment>
}

type SegmentKind = 'expr' | 'literal' | 'inserted'

type Segment = {
  kind: SegmentKind
  rStart: number
  rEnd: number
  oStart?: number
  oEnd?: number
  fallback?: 'previous' | 'next'
}

type TemplateSpanInfo = {
  exprText: string
  litText: string
  needsBraces: boolean
  exprStart: number
  exprEnd: number
  litStart: number
  litEnd: number
}

type TemplateInfo =
  | {
      kind: 'no-substitution'
      body: string
    }
  | {
      kind: 'spans'
      body: string
      headText: string
      spans: TemplateSpanInfo[]
    }

type TransformedFile = {
  text: string
  spans: ReplacementSpan[]
}

type CachedTransformEntry =
  | {
      hasTemplates: false
      version?: string
      configKey: string
    }
  | {
      hasTemplates: true
      version?: string
      configKey: string
      transformed: TransformedFile
      extraDiagnostics?: ts.Diagnostic[]
      diagnosticsVersion?: string
      completionService?: ts.LanguageService
      completionProjectVersion?: string
    }

const documentRegistry = ts.createDocumentRegistry()

const DEFAULT_TAG_MODES: Record<string, Mode> = {
  jsx: 'dom',
  reactJsx: 'react',
}

const DIRECTIVE_PATTERN =
  /\/\*\s*@jsx-(dom|react)\s*\*\/|\/\/\s*@jsx-(dom|react)\b[^\n\r]*/g

function inferScriptKindFromFileName(fileName: string): ts.ScriptKind {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.ts':
      return ts.ScriptKind.TS
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS
    case '.json':
      return ts.ScriptKind.JSON
    default:
      return ts.ScriptKind.Unknown
  }
}

function computeConfigKey(tagModes: Map<string, Mode>, config: NormalizedConfig) {
  const entries = Array.from(tagModes.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const tagSignature = entries.map(([tag, mode]) => `${tag}:${mode}`).join('|')
  return `${tagSignature}|${config.maxTemplatesPerFile ?? 'none'}`
}

function disposeCachedEntry(entry: CachedTransformEntry | undefined) {
  if (entry && entry.hasTemplates && entry.completionService) {
    entry.completionService.dispose?.()
  }
}

type ModeDirective = {
  end: number
  mode: Mode
}

function parseMode(mode: unknown): Mode | undefined {
  if (mode === 'dom' || mode === 'react') return mode
  if (mode === 'runtime') return 'dom'
  return undefined
}

function normalizeConfig(config: unknown): NormalizedConfig {
  const tagModes = new Map<string, Mode>(Object.entries(DEFAULT_TAG_MODES))
  const normalized: NormalizedConfig = { tagModes }

  if (config && typeof config === 'object') {
    const c = config as Record<string, unknown>
    const legacyMode = parseMode(c.mode)

    if (typeof c.tag === 'string' && c.tag.trim().length) {
      const mode = legacyMode ?? 'dom'
      tagModes.set(c.tag.trim(), mode)
    }

    if (Array.isArray(c.tags)) {
      const mode = legacyMode ?? 'dom'
      c.tags.forEach(tag => {
        if (typeof tag === 'string') {
          const normalizedTag = tag.trim()
          if (normalizedTag.length) {
            tagModes.set(normalizedTag, mode)
          }
        }
      })
    }

    if (c.tagModes && typeof c.tagModes === 'object') {
      Object.entries(c.tagModes).forEach(([tagName, mode]) => {
        const parsed = parseMode(mode)
        const normalizedTag = tagName.trim()
        if (parsed && normalizedTag.length) {
          tagModes.set(normalizedTag, parsed)
        }
      })
    }

    if (typeof c.maxTemplatesPerFile === 'number') {
      normalized.maxTemplatesPerFile = c.maxTemplatesPerFile
    }
  }

  return normalized
}

function collectReplacements(
  sourceFile: ts.SourceFile,
  tagModes: Map<string, Mode>,
): Array<{ node: ts.TaggedTemplateExpression; replacement: string }> {
  const replacements: Array<{ node: ts.TaggedTemplateExpression; replacement: string }> =
    []
  const text = sourceFile.getFullText()
  const directives = extractModeDirectives(text)
  const taggedTemplates: ts.TaggedTemplateExpression[] = []

  const visitor = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag)) {
      taggedTemplates.push(node)
    }

    ts.forEachChild(node, visitor)
  }

  ts.forEachChild(sourceFile, visitor)

  const overrides = resolveDirectiveOverrides(taggedTemplates, directives, sourceFile)

  taggedTemplates.forEach(node => {
    if (!ts.isIdentifier(node.tag)) return
    const tagName = node.tag.text
    const override = overrides.get(node)
    const mode = override ?? tagModes.get(tagName)
    if (!mode) return

    const info = computeTemplateInfo(node, sourceFile, text)
    const replacement = `(${info.body})`
    replacements.push({ node, replacement })
  })

  return replacements
}

function extractModeDirectives(text: string): ModeDirective[] {
  const directives: ModeDirective[] = []
  if (!text.length) return directives

  let match: RegExpExecArray | null
  while ((match = DIRECTIVE_PATTERN.exec(text))) {
    const mode = (match[1] ?? match[2]) as Mode | undefined
    if (!mode) continue
    directives.push({ end: match.index + match[0].length, mode })
  }

  return directives.sort((a, b) => a.end - b.end)
}

function resolveDirectiveOverrides(
  nodes: ts.TaggedTemplateExpression[],
  directives: ModeDirective[],
  sourceFile: ts.SourceFile,
) {
  const overrides = new Map<ts.TaggedTemplateExpression, Mode>()
  if (!directives.length || !nodes.length) return overrides

  const sortedNodes = nodes
    .filter(node => ts.isIdentifier(node.tag))
    .sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile))

  let directiveIdx = 0
  for (const node of sortedNodes) {
    let override: Mode | undefined
    while (
      directiveIdx < directives.length &&
      directives[directiveIdx].end <= node.getStart(sourceFile)
    ) {
      override = directives[directiveIdx].mode
      directiveIdx += 1
    }

    if (override) {
      overrides.set(node, override)
    }

    if (directiveIdx >= directives.length) break
  }

  return overrides
}

function applyReplacements(
  sourceFile: ts.SourceFile,
  replacements: Array<{ node: ts.TaggedTemplateExpression; replacement: string }>,
): TransformedFile {
  let text = sourceFile.getFullText()
  const spans: ReplacementSpan[] = []

  const sorted = replacements
    .slice()
    .sort((a, b) => b.node.getStart(sourceFile) - a.node.getStart(sourceFile))

  for (const { node, replacement } of sorted) {
    const start = node.getStart(sourceFile)
    const end = node.getEnd()
    const replacementStart = start
    const replacementEnd = start + replacement.length

    text = `${text.slice(0, start)}${replacement}${text.slice(end)}`

    spans.push({
      originalStart: start,
      originalEnd: end,
      replacementStart,
      replacementEnd,
      segments: buildSegments(node, sourceFile, replacementStart),
    })
  }

  spans.sort((a, b) => a.replacementStart - b.replacementStart)

  let cumulativeDelta = 0
  for (const span of spans) {
    const replacementLength = span.replacementEnd - span.replacementStart
    const originalLength = span.originalEnd - span.originalStart
    span.replacementStart += cumulativeDelta
    span.replacementEnd = span.replacementStart + replacementLength
    span.segments = span.segments.map(seg => ({
      ...seg,
      rStart: seg.rStart + cumulativeDelta,
      rEnd: seg.rEnd + cumulativeDelta,
    }))
    cumulativeDelta += replacementLength - originalLength
  }

  return { text, spans }
}

function lastNonWhitespaceChar(value: string): string | undefined {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const ch = value[i]
    if (!/\s/.test(ch)) return ch
  }
  return undefined
}

function firstNonWhitespaceChar(value: string): string | undefined {
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (!/\s/.test(ch)) return ch
  }
  return undefined
}

function computeTemplateInfo(
  node: ts.TaggedTemplateExpression,
  sourceFile: ts.SourceFile,
  fullText: string,
): TemplateInfo {
  const tpl = node.template

  if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
    return { kind: 'no-substitution', body: tpl.text }
  }

  const headText = tpl.head.text
  let body = headText

  const spans: TemplateSpanInfo[] = []

  for (const span of tpl.templateSpans) {
    const exprStart = span.expression.getStart(sourceFile)
    const exprEnd = span.expression.getEnd()
    const exprText = fullText.slice(exprStart, exprEnd)

    const prevChar = lastNonWhitespaceChar(body)
    const nextChar = firstNonWhitespaceChar(span.literal.text)

    const isTagPosition = prevChar === '<' || (prevChar === '/' && body.endsWith('</'))
    const alreadyBraced = prevChar === '{' && nextChar === '}'
    const needsBraces = !isTagPosition && !alreadyBraced

    body += needsBraces ? `{${exprText}}` : exprText

    const litText = span.literal.text
    body += litText

    spans.push({
      exprText,
      litText,
      needsBraces,
      exprStart,
      exprEnd,
      litStart: span.literal.getStart(sourceFile),
      litEnd: span.literal.getEnd(),
    })
  }

  return { kind: 'spans', body, headText, spans }
}

function cookedSpan(
  literal:
    | ts.TemplateHead
    | ts.TemplateMiddle
    | ts.TemplateTail
    | ts.NoSubstitutionTemplateLiteral,
  sourceFile: ts.SourceFile,
) {
  const start = literal.getStart(sourceFile) + 1
  return { start, end: start + literal.text.length }
}

function buildSegments(
  node: ts.TaggedTemplateExpression,
  sourceFile: ts.SourceFile,
  replacementStart: number,
): Segment[] {
  const segments: Segment[] = []
  const fullText = sourceFile.getFullText()
  const tplInfo = computeTemplateInfo(node, sourceFile, fullText)

  let rCursor = 0
  // leading "("
  segments.push({
    kind: 'inserted',
    rStart: rCursor,
    rEnd: rCursor + 1,
    oStart: node.getStart(sourceFile),
    oEnd: node.getStart(sourceFile) + 1,
  })
  rCursor += 1

  if (tplInfo.kind === 'no-substitution') {
    const cooked = cookedSpan(
      node.template as ts.NoSubstitutionTemplateLiteral,
      sourceFile,
    )
    const text = node.template.getText(sourceFile)
    segments.push({
      kind: 'literal',
      rStart: rCursor,
      rEnd: rCursor + text.length,
      oStart: cooked.start,
      oEnd: cooked.end,
    })
    rCursor += text.length
  } else {
    const tpl = node.template as ts.TemplateExpression
    const head = tpl.head
    const headText = tplInfo.headText
    const cookedHead = cookedSpan(head, sourceFile)
    segments.push({
      kind: 'literal',
      rStart: rCursor,
      rEnd: rCursor + headText.length,
      oStart: cookedHead.start,
      oEnd: cookedHead.end,
    })
    rCursor += headText.length

    tpl.templateSpans.forEach((nodeSpan, idx) => {
      const info = tplInfo.spans[idx]
      const exprText = info.exprText

      if (info.needsBraces) {
        segments.push({
          kind: 'inserted',
          rStart: rCursor,
          rEnd: rCursor + 1,
          oStart: info.exprStart,
          oEnd: info.exprStart,
          fallback: 'next',
        })
        rCursor += 1
      }

      segments.push({
        kind: 'expr',
        rStart: rCursor,
        rEnd: rCursor + exprText.length,
        oStart: info.exprStart,
        oEnd: info.exprEnd,
      })
      rCursor += exprText.length

      if (info.needsBraces) {
        segments.push({
          kind: 'inserted',
          rStart: rCursor,
          rEnd: rCursor + 1,
          oStart: info.exprEnd,
          oEnd: info.exprEnd,
          fallback: 'previous',
        })
        rCursor += 1
      }

      const litText = info.litText
      const cooked = cookedSpan(nodeSpan.literal, sourceFile)
      segments.push({
        kind: 'literal',
        rStart: rCursor,
        rEnd: rCursor + litText.length,
        oStart: cooked.start,
        oEnd: cooked.end,
      })
      rCursor += litText.length
    })
  }

  // trailing ")"
  segments.push({
    kind: 'inserted',
    rStart: rCursor,
    rEnd: rCursor + 1,
    oStart: node.getEnd() - 1,
    oEnd: node.getEnd(),
  })

  // adjust by replacementStart for global offsets
  return segments.map(seg => ({
    kind: seg.kind,
    rStart: seg.rStart + replacementStart,
    rEnd: seg.rEnd + replacementStart,
    oStart: seg.oStart,
    oEnd: seg.oEnd,
    fallback: seg.fallback,
  }))
}

function ensureTransformEntry(
  cache: Map<string, CachedTransformEntry>,
  fileName: string,
  sourceFile: ts.SourceFile,
  version: string | undefined,
  tagModes: Map<string, Mode>,
  config: NormalizedConfig,
  configKey: string,
): CachedTransformEntry {
  const normalized = path.normalize(fileName)
  const existing = cache.get(normalized)
  if (existing && existing.version === version && existing.configKey === configKey) {
    return existing
  }

  disposeCachedEntry(existing)

  const replacements = collectReplacements(sourceFile, tagModes)
  if (!replacements.length) {
    const entry: CachedTransformEntry = { hasTemplates: false, version, configKey }
    cache.set(normalized, entry)
    return entry
  }

  if (config.maxTemplatesPerFile && replacements.length > config.maxTemplatesPerFile) {
    const entry: CachedTransformEntry = { hasTemplates: false, version, configKey }
    cache.set(normalized, entry)
    return entry
  }

  const transformed = applyReplacements(sourceFile, replacements)
  const entry: CachedTransformEntry = {
    hasTemplates: true,
    version,
    configKey,
    transformed,
  }
  cache.set(normalized, entry)
  return entry
}

function adjustPositionForEarlierSpans(spans: ReplacementSpan[], pos: number) {
  let delta = 0
  for (const span of spans) {
    if (span.replacementEnd > pos) break
    const replacementLength = span.replacementEnd - span.replacementStart
    const originalLength = span.originalEnd - span.originalStart
    delta += replacementLength - originalLength
  }
  return Math.max(0, pos - delta)
}

function mapReplacementPositionToOriginal(spans: ReplacementSpan[], pos: number) {
  const span = spans.find(s => pos >= s.replacementStart && pos <= s.replacementEnd)
  if (!span) {
    return adjustPositionForEarlierSpans(spans, pos)
  }

  const seg = span.segments.find(s => pos >= s.rStart && pos <= s.rEnd)
  if (seg && seg.oStart !== undefined && seg.oEnd !== undefined) {
    const offsetInSeg = pos - seg.rStart
    const origLen = seg.oEnd - seg.oStart
    const mappedOffset = Math.min(offsetInSeg, Math.max(origLen - 1, 0))
    return Math.max(seg.oStart, seg.oStart + mappedOffset)
  }

  return span.originalStart + (pos - span.replacementStart)
}

function mapOriginalPositionToReplacement(spans: ReplacementSpan[], pos: number) {
  const span = spans.find(s => pos >= s.originalStart && pos <= s.originalEnd)
  if (!span) return undefined

  for (const seg of span.segments) {
    if (seg.oStart === undefined || seg.oEnd === undefined) continue
    if (pos >= seg.oStart && pos <= seg.oEnd) {
      const offset = Math.min(pos - seg.oStart, seg.oEnd - seg.oStart)
      return seg.rStart + offset
    }
  }

  return span.replacementStart + (pos - span.originalStart)
}

function mapTransformedTextSpanToOriginal(
  textSpan: ts.TextSpan,
  spans: ReplacementSpan[],
): ts.TextSpan | undefined {
  const start = mapReplacementPositionToOriginal(spans, textSpan.start)
  const end = mapReplacementPositionToOriginal(spans, textSpan.start + textSpan.length)
  if (start === undefined || end === undefined) return undefined
  return { start, length: Math.max(0, end - start) }
}

function remapCompletionEntriesToOriginal(
  entries: readonly ts.CompletionEntry[],
  spans: ReplacementSpan[],
): ts.CompletionEntry[] {
  let mutated = false
  const mappedEntries = entries.map(entry => {
    if (!entry.replacementSpan) return entry
    const mappedSpan = mapTransformedTextSpanToOriginal(entry.replacementSpan, spans)
    if (!mappedSpan) return entry
    mutated = true
    return { ...entry, replacementSpan: mappedSpan }
  })
  return mutated ? mappedEntries : (entries as ts.CompletionEntry[])
}

function remapQuickInfoSpan(info: ts.QuickInfo, spans: ReplacementSpan[]) {
  const mappedSpan = mapTransformedTextSpanToOriginal(info.textSpan, spans)
  return mappedSpan && mappedSpan !== info.textSpan
    ? { ...info, textSpan: mappedSpan }
    : info
}

function getOrCreateTransformedLanguageService(
  fileName: string,
  entry: Extract<CachedTransformEntry, { hasTemplates: true }>,
  baseProgram: ts.Program,
  baseHost: ts.LanguageServiceHost | undefined,
): ts.LanguageService {
  if (entry.completionService) return entry.completionService

  const normalizedTarget = path.normalize(fileName)
  const compilerOptions = baseProgram.getCompilerOptions()
  const hostFileNames = [
    ...((baseHost?.getScriptFileNames?.() ?? baseProgram.getRootFileNames()) as
      | string[]
      | readonly string[]),
  ]
  const scriptFileNames = hostFileNames.includes(normalizedTarget)
    ? [...hostFileNames]
    : [...hostFileNames, normalizedTarget]

  const serviceHost: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...scriptFileNames],
    getScriptVersion: f => {
      const normalized = path.normalize(f)
      if (normalized === normalizedTarget) return `${entry.version ?? '0'}-transformed`
      return baseHost?.getScriptVersion?.(f) ?? '0'
    },
    getScriptSnapshot: f => {
      const normalized = path.normalize(f)
      if (normalized === normalizedTarget) {
        return ts.ScriptSnapshot.fromString(entry.transformed.text)
      }
      const snapshot = baseHost?.getScriptSnapshot?.(f)
      if (snapshot) return snapshot
      const source = baseProgram.getSourceFile(normalized)
      if (source) return ts.ScriptSnapshot.fromString(source.text)
      const text = ts.sys.readFile(normalized)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    fileExists: f => baseHost?.fileExists?.(f) ?? ts.sys.fileExists(f),
    readFile: f => baseHost?.readFile?.(f) ?? ts.sys.readFile(f),
    directoryExists: d =>
      baseHost?.directoryExists?.(d) ?? ts.sys.directoryExists?.(d) ?? true,
    getDirectories: d =>
      baseHost?.getDirectories?.(d) ?? ts.sys.getDirectories?.(d) ?? [],
    readDirectory: (dir, extensions, excludes, includes, depth) =>
      baseHost?.readDirectory?.(dir, extensions, excludes, includes, depth) ??
      ts.sys.readDirectory(dir, extensions, excludes, includes, depth),
    realpath: baseHost?.realpath?.bind(baseHost) ?? ts.sys.realpath?.bind(ts.sys),
    getCurrentDirectory: () =>
      baseHost?.getCurrentDirectory?.() ?? ts.sys.getCurrentDirectory(),
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getNewLine: () => baseHost?.getNewLine?.() ?? ts.sys.newLine,
    useCaseSensitiveFileNames: () =>
      baseHost?.useCaseSensitiveFileNames?.() ?? ts.sys.useCaseSensitiveFileNames,
    resolveModuleNames: baseHost?.resolveModuleNames
      ? (moduleNames, containingFile, ...rest) =>
          baseHost.resolveModuleNames!(moduleNames, containingFile, ...rest)
      : undefined,
    getScriptKind: f => {
      if (path.normalize(f) === normalizedTarget) return ts.ScriptKind.TSX
      const fromHost = baseHost?.getScriptKind?.(f)
      if (fromHost !== undefined) return fromHost
      return inferScriptKindFromFileName(f)
    },
    getProjectVersion: () => baseHost?.getProjectVersion?.() ?? '',
  }

  const service = ts.createLanguageService(serviceHost, documentRegistry)
  entry.completionService = service
  return service
}

function remapCodeActionsToOriginal(
  fileName: string,
  spans: ReplacementSpan[],
  actions: readonly ts.CodeAction[] | undefined,
) {
  if (!actions?.length) return actions
  const normalizedTarget = path.normalize(fileName)
  let mutated = false

  const mappedActions = actions.map(action => {
    let actionMutated = false
    const mappedChanges = action.changes.map(change => {
      if (path.normalize(change.fileName) !== normalizedTarget) return change

      let changeMutated = false
      const mappedTextChanges = change.textChanges.map(textChange => {
        const mappedSpan = mapTransformedTextSpanToOriginal(textChange.span, spans)
        if (!mappedSpan) return textChange
        changeMutated = true
        return { ...textChange, span: mappedSpan }
      })

      if (!changeMutated) return change
      actionMutated = true
      return { ...change, textChanges: mappedTextChanges }
    })

    if (!actionMutated) return action
    mutated = true
    return { ...action, changes: mappedChanges }
  })

  return mutated ? mappedActions : actions
}

function computeTransformedDiagnostics(
  fileName: string,
  sourceFile: ts.SourceFile,
  transformed: TransformedFile,
  program: ts.Program,
  baseHost: ts.LanguageServiceHost | undefined,
) {
  const opts = program.getCompilerOptions()
  const rootNames = program.getRootFileNames()
  const normalizedTarget = path.normalize(fileName)

  const readFromHost = (f: string) => {
    const normalized = path.normalize(f)
    if (normalized === normalizedTarget) return transformed.text
    const snapshot = baseHost?.getScriptSnapshot?.(f)
    if (snapshot) return snapshot.getText(0, snapshot.getLength())
    const existing = program.getSourceFile(normalized)
    if (existing) return existing.text
    return ts.sys.readFile(f)
  }

  const host = ts.createCompilerHost(opts, true)
  host.readFile = readFromHost
  host.fileExists = f => {
    const normalized = path.normalize(f)
    if (normalized === normalizedTarget) return true
    if (baseHost?.fileExists) return baseHost.fileExists(f)
    if (program.getSourceFile(normalized)) return true
    return ts.sys.fileExists(f)
  }
  host.getSourceFile = (f, languageVersion) => {
    const text = host.readFile(f)
    if (text === undefined) return undefined
    const normalized = path.normalize(f)
    const scriptKind =
      normalized === normalizedTarget
        ? ts.ScriptKind.TSX
        : (baseHost?.getScriptKind?.(f) ?? inferScriptKindFromFileName(f))
    return ts.createSourceFile(f, text, languageVersion, true, scriptKind)
  }

  const diagProgram = ts.createProgram({ rootNames, options: opts, host })
  const transformedSource = diagProgram.getSourceFile(fileName)
  if (!transformedSource) return []

  const normalizedFileName = path.normalize(fileName)
  return ts
    .getPreEmitDiagnostics(diagProgram, transformedSource)
    .filter(d => d.file && path.normalize(d.file.fileName) === normalizedFileName)
    .map(diag => mapDiagnosticToOriginal(diag, sourceFile, transformed.spans))
}

function createPlugin(info: ts.server.PluginCreateInfo) {
  if (!info || !info.languageService)
    return info?.languageService ?? ({} as ts.LanguageService)
  const config = normalizeConfig(info.config)
  const tagModes = config.tagModes
  const configKey = computeConfigKey(tagModes, config)
  const transformCache = new Map<string, CachedTransformEntry>()
  const lsHost = info.languageServiceHost

  const diagKey = (d: ts.Diagnostic) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    const start = d.start ?? -1
    const length = d.length ?? -1
    return `${d.code}:${start}:${length}:${msg}`
  }

  const proxy: ts.LanguageService = Object.create(null)
  const baseLs = info.languageService
  for (const k of Object.keys(baseLs) as Array<keyof ts.LanguageService>) {
    const x = baseLs[k]
    // @ts-expect-error - copying from language service
    proxy[k] = typeof x === 'function' ? x.bind(baseLs) : x
  }

  const getTransformedContext = (fileName: string, position: number) => {
    const program = info.languageService.getProgram()
    if (!program) return undefined

    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) return undefined

    const version = lsHost?.getScriptVersion?.(fileName)
    const entry = ensureTransformEntry(
      transformCache,
      fileName,
      sourceFile,
      version,
      tagModes,
      config,
      configKey,
    )
    if (!entry.hasTemplates) return undefined

    const transformedPosition = mapOriginalPositionToReplacement(
      entry.transformed.spans,
      position,
    )
    if (transformedPosition === undefined) return undefined

    const service = getOrCreateTransformedLanguageService(
      fileName,
      entry,
      program,
      lsHost,
    )

    return { entry, service, transformedPosition, sourceFile, program }
  }

  proxy.getSemanticDiagnostics = (fileName: string) => {
    const base = info.languageService.getSemanticDiagnostics(fileName)
    const program = info.languageService.getProgram()
    if (!program) return base

    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) return base

    const version = lsHost?.getScriptVersion?.(fileName)
    const entry = ensureTransformEntry(
      transformCache,
      fileName,
      sourceFile,
      version,
      tagModes,
      config,
      configKey,
    )
    if (!entry.hasTemplates) return base

    const projectVersion = lsHost?.getProjectVersion?.() ?? 'static'
    if (!entry.extraDiagnostics || entry.diagnosticsVersion !== projectVersion) {
      entry.extraDiagnostics = computeTransformedDiagnostics(
        fileName,
        sourceFile,
        entry.transformed,
        program,
        lsHost,
      )
      entry.diagnosticsVersion = projectVersion
    }

    const baseKeys = new Set(base.map(diagKey))
    const extraDiags = entry.extraDiagnostics ?? []
    const dedupedExtra = extraDiags.filter(d => !baseKeys.has(diagKey(d)))

    return [...base, ...dedupedExtra]
  }

  proxy.getCompletionsAtPosition = (
    fileName: string,
    position: number,
    options?: ts.GetCompletionsAtPositionOptions,
    formattingSettings?: ts.FormatCodeSettings,
  ) => {
    const fallback = () =>
      baseLs.getCompletionsAtPosition(fileName, position, options, formattingSettings)

    const context = getTransformedContext(fileName, position)
    if (!context) return fallback()

    const result = context.service.getCompletionsAtPosition(
      fileName,
      context.transformedPosition,
      options,
      formattingSettings,
    )
    if (!result) return fallback()

    const mappedEntries = remapCompletionEntriesToOriginal(
      result.entries,
      context.entry.transformed.spans,
    )
    return mappedEntries !== result.entries
      ? { ...result, entries: mappedEntries }
      : result
  }

  proxy.getCompletionEntryDetails = (
    fileName: string,
    position: number,
    entryName: string,
    formatOptions?: ts.FormatCodeOptions | ts.FormatCodeSettings,
    source?: string,
    preferences?: ts.UserPreferences,
    data?: ts.CompletionEntryData,
  ) => {
    const context = getTransformedContext(fileName, position)
    if (context) {
      const details = context.service.getCompletionEntryDetails(
        fileName,
        context.transformedPosition,
        entryName,
        formatOptions,
        source,
        preferences,
        data,
      )
      if (details) {
        const mappedCodeActions = remapCodeActionsToOriginal(
          fileName,
          context.entry.transformed.spans,
          details.codeActions,
        )
        if (mappedCodeActions !== details.codeActions) {
          return {
            ...details,
            codeActions: mappedCodeActions ? [...mappedCodeActions] : mappedCodeActions,
          }
        }
        return details
      }
    }

    return baseLs.getCompletionEntryDetails(
      fileName,
      position,
      entryName,
      formatOptions,
      source,
      preferences,
      data,
    )
  }

  proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
    const context = getTransformedContext(fileName, position)
    if (!context) return baseLs.getQuickInfoAtPosition(fileName, position)

    const info = context.service.getQuickInfoAtPosition(
      fileName,
      context.transformedPosition,
    )
    if (!info) return baseLs.getQuickInfoAtPosition(fileName, position)

    return remapQuickInfoSpan(info, context.entry.transformed.spans)
  }

  return proxy
}

function mapDiagnosticToOriginal(
  diagnostic: ts.Diagnostic,
  sourceFile: ts.SourceFile,
  spans: ReplacementSpan[],
): ts.Diagnostic {
  if (!diagnostic.file || diagnostic.start == null) return diagnostic

  const span = spans.find(
    s => diagnostic.start! >= s.replacementStart && diagnostic.start! <= s.replacementEnd,
  )
  if (!span) {
    const adjustedStart = adjustPositionForEarlierSpans(spans, diagnostic.start)
    return {
      ...diagnostic,
      file: sourceFile,
      start: adjustedStart,
    }
  }

  const local = diagnostic.start - span.replacementStart
  let segIndex = span.segments.findIndex(
    s => diagnostic.start! >= s.rStart && diagnostic.start! < s.rEnd,
  )
  const getSegmentWithDirection = (
    startIdx: number,
    direction: -1 | 1,
    predicate: (candidate: Segment) => boolean,
  ) => {
    let idx = startIdx + direction
    while (idx >= 0 && idx < span.segments.length) {
      const candidate = span.segments[idx]
      if (predicate(candidate)) return { segment: candidate, index: idx }
      idx += direction
    }
    return undefined
  }

  let seg = segIndex === -1 ? undefined : span.segments[segIndex]
  if (seg && !hasOriginalRange(seg)) {
    if (seg.fallback === 'next') {
      const resolved = getSegmentWithDirection(segIndex, 1, candidate =>
        hasOriginalRange(candidate),
      )
      if (resolved) {
        seg = resolved.segment
        segIndex = resolved.index
      }
    } else if (seg.fallback === 'previous') {
      const resolved = getSegmentWithDirection(segIndex, -1, candidate =>
        hasOriginalRange(candidate),
      )
      if (resolved) {
        seg = resolved.segment
        segIndex = resolved.index
      }
    }
  }

  if (
    seg &&
    seg.kind === 'literal' &&
    diagnostic.code === 2322 &&
    diagnostic.file?.text
  ) {
    const literalText = diagnostic.file.text.slice(seg.rStart, seg.rEnd)
    const literalIdx = diagnostic.start - seg.rStart
    if (literalIdx >= 0 && literalIdx <= literalText.length) {
      const suffix = literalText.slice(literalIdx)
      if (suffix.includes('=')) {
        const nextExpr = getSegmentWithDirection(
          segIndex,
          1,
          candidate => candidate.kind === 'expr' && hasOriginalRange(candidate),
        )
        if (nextExpr) {
          seg = nextExpr.segment
          segIndex = nextExpr.index
        }
      }
    }
  }

  let mappedStart = span.originalStart + local
  let mappedLength = Math.min(
    span.originalEnd - span.originalStart,
    diagnostic.length ?? 1,
  )

  if (seg && hasOriginalRange(seg)) {
    const segWidth = Math.max(0, seg.rEnd - seg.rStart)
    const rawOffsetInSeg = diagnostic.start - seg.rStart
    // Clamp offset so fallbacks that land just outside the expression don't inflate lengths
    const offsetInSeg = Math.max(0, Math.min(rawOffsetInSeg, Math.max(segWidth - 1, 0)))
    const origLen = seg.oEnd - seg.oStart
    const mappedOffset = Math.min(offsetInSeg, Math.max(origLen - 1, 0))
    mappedStart = Math.max(seg.oStart, seg.oStart + mappedOffset)
    mappedLength = Math.max(0, Math.min(origLen - mappedOffset, diagnostic.length ?? 1))
  }

  return {
    ...diagnostic,
    file: sourceFile,
    start: mappedStart,
    length: mappedLength,
  }
}

function hasOriginalRange(
  seg: Segment | undefined,
): seg is Segment & { oStart: number; oEnd: number } {
  return (
    seg !== undefined &&
    seg.oStart !== undefined &&
    seg.oEnd !== undefined &&
    seg.oEnd > seg.oStart
  )
}

type TestingExports = {
  inferScriptKindFromFileName: typeof inferScriptKindFromFileName
  disposeCachedEntry: typeof disposeCachedEntry
  lastNonWhitespaceChar: typeof lastNonWhitespaceChar
  mapReplacementPositionToOriginal: typeof mapReplacementPositionToOriginal
  mapOriginalPositionToReplacement: typeof mapOriginalPositionToReplacement
  mapDiagnosticToOriginal: typeof mapDiagnosticToOriginal
  remapCompletionEntriesToOriginal: typeof remapCompletionEntriesToOriginal
  remapQuickInfoSpan: typeof remapQuickInfoSpan
}

const testingApi: TestingExports = {
  inferScriptKindFromFileName,
  disposeCachedEntry,
  lastNonWhitespaceChar,
  mapReplacementPositionToOriginal,
  mapOriginalPositionToReplacement,
  mapDiagnosticToOriginal,
  remapCompletionEntriesToOriginal,
  remapQuickInfoSpan,
}

function init(_modules: { typescript: typeof ts }) {
  return {
    create(info: ts.server.PluginCreateInfo) {
      return createPlugin(info)
    },
  }
}

;(init as typeof init & { __testing?: TestingExports }).__testing = testingApi

export = init
