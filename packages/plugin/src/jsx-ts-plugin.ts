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
  segments: Array<{
    rStart: number
    rEnd: number
    oStart?: number
    oEnd?: number
  }>
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

const DEFAULT_TAG_MODES: Record<string, Mode> = {
  jsx: 'dom',
  reactJsx: 'react',
}

const DIRECTIVE_PATTERN =
  /\/\*\s*@jsx-(dom|react)\s*\*\/|\/\/\s*@jsx-(dom|react)\b[^\n\r]*/g

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
  let transformed = ''
  let cursor = 0
  const spans: ReplacementSpan[] = []
  const fullText = sourceFile.getFullText()

  for (const { node, replacement } of replacements) {
    const start = node.getStart(sourceFile)
    const end = node.getEnd()

    transformed += fullText.slice(cursor, start)
    const replacementStart = transformed.length
    transformed += replacement
    const replacementEnd = transformed.length

    spans.push({
      originalStart: start,
      originalEnd: end,
      replacementStart,
      replacementEnd,
      segments: buildSegments(node, sourceFile, replacementStart),
    })

    cursor = end
  }

  transformed += fullText.slice(cursor)

  return { text: transformed, spans }
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
): Array<{ rStart: number; rEnd: number; oStart?: number; oEnd?: number }> {
  const segments: Array<{
    rStart: number
    rEnd: number
    oStart?: number
    oEnd?: number
  }> = []
  const fullText = sourceFile.getFullText()
  const tplInfo = computeTemplateInfo(node, sourceFile, fullText)

  let rCursor = 0
  // leading "("
  segments.push({
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
          rStart: rCursor,
          rEnd: rCursor + 1,
          oStart: info.exprStart,
          oEnd: info.exprStart + 1,
        })
        rCursor += 1
      }

      segments.push({
        rStart: rCursor,
        rEnd: rCursor + exprText.length,
        oStart: info.exprStart,
        oEnd: info.exprEnd,
      })
      rCursor += exprText.length

      if (info.needsBraces) {
        segments.push({
          rStart: rCursor,
          rEnd: rCursor + 1,
          oStart: info.exprEnd - 1,
          oEnd: info.exprEnd,
        })
        rCursor += 1
      }

      const litText = info.litText
      const cooked = cookedSpan(nodeSpan.literal, sourceFile)
      segments.push({
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
    rStart: rCursor,
    rEnd: rCursor + 1,
    oStart: node.getEnd() - 1,
    oEnd: node.getEnd(),
  })

  // adjust by replacementStart for global offsets
  return segments.map(seg => ({
    rStart: seg.rStart + replacementStart,
    rEnd: seg.rEnd + replacementStart,
    oStart: seg.oStart,
    oEnd: seg.oEnd,
  }))
}

function createPlugin(info: ts.server.PluginCreateInfo) {
  if (!info || !info.languageService)
    return info?.languageService ?? ({} as ts.LanguageService)
  const config = normalizeConfig(info.config)
  const tagModes = config.tagModes

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

  proxy.getSemanticDiagnostics = (fileName: string) => {
    const base = info.languageService.getSemanticDiagnostics(fileName)
    const program = info.languageService.getProgram()
    if (!program) return base

    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) return base

    const replacements = collectReplacements(sourceFile, tagModes)
    if (!replacements.length) return base
    if (config.maxTemplatesPerFile && replacements.length > config.maxTemplatesPerFile)
      return base

    const transformed = applyReplacements(sourceFile, replacements)

    const opts = program.getCompilerOptions()
    const rootNames = program.getRootFileNames()
    const normalizedTarget = path.normalize(fileName)

    const host = ts.createCompilerHost(opts, true)
    host.getSourceFile = (f, lv) => {
      const normalized = path.normalize(f)
      const text = normalized === normalizedTarget ? transformed.text : ts.sys.readFile(f)
      if (text === undefined) return undefined
      const scriptKind = opts.jsx ? ts.ScriptKind.TSX : undefined
      return ts.createSourceFile(f, text, lv, true, scriptKind)
    }
    host.readFile = f => {
      const normalized = path.normalize(f)
      if (normalized === normalizedTarget) return transformed.text
      return ts.sys.readFile(f)
    }
    host.fileExists = f => {
      const normalized = path.normalize(f)
      if (normalized === normalizedTarget) return true
      return ts.sys.fileExists(f)
    }

    const diagProgram = ts.createProgram({ rootNames, options: opts, host })
    const transformedSource = diagProgram.getSourceFile(fileName)
    if (!transformedSource) return base

    const extraDiags = ts
      .getPreEmitDiagnostics(diagProgram, transformedSource)
      .filter(d => d.file && path.normalize(d.file.fileName) === normalizedTarget)
      .map(diag => mapDiagnosticToOriginal(diag, sourceFile, transformed.spans))

    const baseKeys = new Set(base.map(diagKey))
    const dedupedExtra = extraDiags.filter(d => !baseKeys.has(diagKey(d)))

    return [...base, ...dedupedExtra]
  }

  return proxy
}

function mapDiagnosticToOriginal(
  diagnostic: ts.Diagnostic,
  sourceFile: ts.SourceFile,
  spans: ReplacementSpan[],
): ts.Diagnostic {
  if (!diagnostic.file || diagnostic.start == null) return diagnostic

  const adjustForEarlierSpans = (pos: number) => {
    let delta = 0
    for (const span of spans) {
      if (span.replacementEnd > pos) break
      const replacementLength = span.replacementEnd - span.replacementStart
      const originalLength = span.originalEnd - span.originalStart
      delta += replacementLength - originalLength
    }
    return Math.max(0, pos - delta)
  }

  const span = spans.find(
    s => diagnostic.start! >= s.replacementStart && diagnostic.start! <= s.replacementEnd,
  )
  if (!span) {
    const adjustedStart = adjustForEarlierSpans(diagnostic.start)
    return {
      ...diagnostic,
      file: sourceFile,
      start: adjustedStart,
    }
  }

  const local = diagnostic.start - span.replacementStart
  const seg = span.segments.find(
    s => diagnostic.start! >= s.rStart && diagnostic.start! < s.rEnd,
  )

  let mappedStart = span.originalStart + local
  let mappedLength = Math.min(
    span.originalEnd - span.originalStart,
    diagnostic.length ?? 1,
  )

  if (seg && seg.oStart !== undefined && seg.oEnd !== undefined) {
    const offsetInSeg = diagnostic.start - seg.rStart
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

function init(_modules: { typescript: typeof ts }) {
  return {
    create(info: ts.server.PluginCreateInfo) {
      return createPlugin(info)
    },
  }
}

export = init
