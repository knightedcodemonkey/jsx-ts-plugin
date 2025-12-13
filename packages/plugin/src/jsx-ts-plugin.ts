import path from 'node:path'
import * as ts from 'typescript/lib/tsserverlibrary.js'

type PluginConfig = {
  tags?: string[]
  mode?: 'react' | 'dom'
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

const DEFAULT_TAGS = ['jsx', 'reactJsx']

function normalizeConfig(config: unknown): PluginConfig {
  const base: PluginConfig = {}
  if (config && typeof config === 'object') {
    const c = config as Record<string, unknown>
    if (Array.isArray(c.tags) && c.tags.every(tag => typeof tag === 'string')) {
      base.tags = c.tags as string[]
    }
    if (c.mode === 'react' || c.mode === 'dom') base.mode = c.mode
    if (typeof c.maxTemplatesPerFile === 'number')
      base.maxTemplatesPerFile = c.maxTemplatesPerFile
  }
  return base
}

function collectReplacements(
  sourceFile: ts.SourceFile,
  tagSet: Set<string>,
): Array<{ node: ts.TaggedTemplateExpression; replacement: string }> {
  const replacements: Array<{ node: ts.TaggedTemplateExpression; replacement: string }> =
    []
  const text = sourceFile.getFullText()

  const visitor = (node: ts.Node) => {
    if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isIdentifier(node.tag) &&
      tagSet.has(node.tag.text)
    ) {
      const info = computeTemplateInfo(node, sourceFile, text)

      const replacement = `(${info.body})`
      replacements.push({ node, replacement })
    }

    ts.forEachChild(node, visitor)
  }

  ts.forEachChild(sourceFile, visitor)
  return replacements
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
    const text = node.template.getText(sourceFile)
    segments.push({
      rStart: rCursor,
      rEnd: rCursor + text.length,
      oStart: node.template.getStart(sourceFile),
      oEnd: node.template.getEnd(),
    })
    rCursor += text.length
  } else {
    const tpl = node.template as ts.TemplateExpression
    const head = tpl.head
    const headText = tplInfo.headText
    segments.push({
      rStart: rCursor,
      rEnd: rCursor + headText.length,
      oStart: head.getStart(sourceFile),
      oEnd: head.getEnd(),
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
      segments.push({
        rStart: rCursor,
        rEnd: rCursor + litText.length,
        oStart: nodeSpan.literal.getStart(sourceFile),
        oEnd: nodeSpan.literal.getEnd(),
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
  const tags = new Set(config.tags && config.tags.length ? config.tags : DEFAULT_TAGS)

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

    const replacements = collectReplacements(sourceFile, tags)
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

    return [...base, ...extraDiags]
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
  if (!span) return diagnostic

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
    mappedStart = seg.oStart + mappedOffset
    mappedLength = Math.min(origLen - mappedOffset, diagnostic.length ?? 1)
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
