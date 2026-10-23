/**
 * dsh-telegrapher — detectors.
 *
 * A detector is a pure function over one unit of model output (a visible text
 * block, a reasoning block, or one tool call) or over a whole session. It
 * returns the text as the rule would have written it, so the analysis can
 * price the difference with the tokenizer instead of guessing.
 *
 * Rules:
 *   - Never rewrite inside a ``` fence: code, logs and commands stay verbatim.
 *   - Every rewrite must be one the rule really asks for. A detector that
 *     trims content is a bug, not an optimisation.
 *   - Session-scope detectors return `units`, the number of independent
 *     savings the same rewrite stands for (a path repeated five times saves
 *     four times).
 */

/**
 * @typedef {object} Unit
 * @property {'text' | 'thinking' | 'tool'} kind
 * @property {string} [text] visible or reasoning text
 * @property {{ name: string, args: Record<string, any>, raw: string }} [call]
 * @property {object} [context]
 * @property {boolean} [context.hasToolCalls] the message also called tools
 * @property {string[]} [context.turnCommands] commands issued in the same turn
 * @property {string} [context.previousToolResult]
 * @property {string} [context.earlierText]
 * @property {Set<string>} [context.codeLines]
 * @property {string} [context.cwd]
 */

/**
 * @typedef {object} Hit
 * @property {string} detector
 * @property {string} kind
 * @property {string} before
 * @property {string} after
 * @property {number} [units]
 * @property {string} [note]
 * @property {string} [snippet]
 */

const FENCE = /```[^\n]*\n[\s\S]*?```/g

/** Split text into prose and fence parts, preserving order. */
export function splitFences(text) {
  const parts = []
  let last = 0
  FENCE.lastIndex = 0
  for (let match = FENCE.exec(text); match !== null; match = FENCE.exec(text)) {
    if (match.index > last) parts.push({ fence: false, text: text.slice(last, match.index) })
    parts.push({ fence: true, text: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ fence: false, text: text.slice(last) })
  return parts
}

/** Concatenate the prose parts of a text, fences excluded. */
export function proseOnly(text) {
  return splitFences(text)
    .filter((part) => !part.fence)
    .map((part) => part.text)
    .join(' ')
}

/**
 * Apply a rewriter to prose parts only.
 *
 * @param {string} text
 * @param {(part: string) => { text: string, count: number }} rewriter
 * @returns {{ text: string, count: number }}
 */
function rewriteProse(text, rewriter) {
  let count = 0
  const out = splitFences(text)
    .map((part) => {
      if (part.fence) return part.text
      const result = rewriter(part.text)
      count += result.count
      return result.text
    })
    .join('')
  return { text: out, count }
}

/** Collapse whitespace for verbatim comparisons. */
export function normalize(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split a paragraph into sentences. */
export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** Trim blank lines this rewrite leaves behind. */
function tidy(text) {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** Longest common leading line count of two line arrays. */
function commonPrefix(a, b) {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1
  return index
}

/** Longest common trailing line count of two line arrays, capped before the prefix. */
function commonSuffix(a, b, prefix) {
  let index = 0
  while (
    index < a.length - prefix &&
    index < b.length - prefix &&
    a[a.length - 1 - index] === b[b.length - 1 - index]
  ) {
    index += 1
  }
  return index
}

/** File-name part of a path or URL. */
export function basename(token) {
  const clean = String(token).replace(/[.,;:)\]]+$/, '')
  const parts = clean.split(/[\\/]/)
  return parts[parts.length - 1] || clean
}

// ---------------------------------------------------------------------------
// Text detectors
// ---------------------------------------------------------------------------

const FILLER_OPENER =
  /^(?:Sure|Certainly|Of course|Absolutely|Great question|Happy to help|I'd be happy to help|I'd be glad to help|No problem|Конечно|Разумеется|Отличный вопрос|Без проблем|Само собой)\b[^.!?\n]{0,100}[.!?]\s*/i
const FILLER_PHRASE =
  /\b(?:of course|needless to say|as you (?:can see|know))\b[,]?\s*|(?:на самом деле|собственно говоря|в общем-то)\b[,]?\s*/gi

/** @type {import('./catalogue.js').Rule['detectors'] extends string[] ? object : never} */
export const filler = {
  id: 'filler',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let next = part
      let hits = 0
      for (let round = 0; round < 3; round += 1) {
        const opener = next.match(FILLER_OPENER)
        if (!opener || opener[0].length >= next.length) break
        next = next.slice(opener[0].length)
        hits += 1
      }
      const phrase = next.match(FILLER_PHRASE)
      if (phrase) {
        next = next.replace(FILLER_PHRASE, '')
        hits += phrase.length
      }
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: 'filler opener or phrase', snippet: text.slice(0, 120) }],
    }
  },
}

const RECAP_MARKER =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Summary|In summary|To summarize|Recap|TL;DR|Итого|Итог|Резюме|В итоге|Кратко)(?:\*\*)?\s*:?/i

/** Trailing summary block after the answer. */
export const recap = {
  id: 'recap',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const lines = text.split('\n')
    let cut = -1
    for (let index = 1; index < lines.length; index += 1) {
      if (RECAP_MARKER.test(lines[index])) cut = index
    }
    if (cut < 0) return null
    const prefix = lines.slice(0, cut).join('\n').trimEnd()
    const recapText = lines.slice(cut).join('\n').trim()
    if (prefix.length < 80 || recapText.length === 0) return null
    if (recapText.length > text.length * 0.6) return null
    return {
      before: text,
      after: prefix,
      matches: [{ note: 'trailing recap block', snippet: recapText.slice(0, 120) }],
    }
  },
}

const OFFER =
  /(?:^|\n|\s)(?:Let me know if|Feel free to|If you (?:need|want|have) (?:anything|any) (?:else|questions)|Happy to help|I'm happy to|Would you like me to|Want me to|Should I|Дайте знать|Если (?:нужна|нужно|понадобится) (?:помощь|что-то)|Готов помочь)[^.!?\n]*[.!?]\s*$/i

/** Closing pleasantry at the end of a reply. */
export const offer = {
  id: 'offer',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const match = proseOnly(text).match(OFFER)
    if (!match || match[0].length >= text.length) return null
    const removed = match[0].trim()
    const index = text.lastIndexOf(removed)
    if (index <= 0) return null
    return {
      before: text,
      after: text.slice(0, index).trimEnd(),
      matches: [{ note: 'closing offer', snippet: removed.slice(0, 120) }],
    }
  },
}

const RESTATE =
  /^(?:You(?:'re| are) asking|You want me to|You would like|The question is|Your question|Ваш вопрос|Вы спрашиваете|Вы просите|Вы хотите)[^\n]*(?:\n+|$)/i

/** First paragraph restating the user question. */
export const restate = {
  id: 'restate',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const match = text.match(RESTATE)
    if (!match) return null
    const rest = text.slice(match[0].length)
    if (rest.trim().length < 12) return null
    return {
      before: text,
      after: rest.trimStart(),
      matches: [{ note: 'question restatement', snippet: match[0].slice(0, 120) }],
    }
  },
}

/** Fenced block whose lines already appeared in an edit or write argument. */
export const reprint = {
  id: 'reprint',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const codeLines = unit.context?.codeLines
    if (!codeLines || codeLines.size === 0) return null
    let matched = 0
    let snippet = ''
    const rewritten = splitFences(text)
      .map((part) => {
        if (!part.fence) return part.text
        const content = part.text
          .replace(/^```[^\n]*\n/, '')
          .replace(/```$/, '')
          .split('\n')
          .map((line) => normalize(line))
          .filter((line) => line.length >= 8)
        if (content.length < 2) return part.text
        const hits = content.filter((line) => codeLines.has(line))
        if (hits.length === 0 || hits.length / content.length < 0.8) return part.text
        matched += 1
        if (!snippet) snippet = hits[0].slice(0, 120)
        return ''
      })
      .join('')
    if (matched === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: `reprinted code (${matched} fence${matched === 1 ? '' : 's'})`, snippet }],
    }
  },
}

const NEXT_STEPS =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Next steps|Next step|Дальнейшие шаги|Следующие шаги|Что дальше)(?:\*\*)?\s*:?[^\n]*(?:\n|$)/i

/** A "Next steps" block at the end of a reply. */
export const nextSteps = {
  id: 'next-steps',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const match = text.match(NEXT_STEPS)
    if (!match || match.index === undefined || match.index === 0) return null
    const prefix = text.slice(0, match.index).trimEnd()
    const block = text.slice(match.index).trim()
    if (prefix.length < 80 || block.length === 0) return null
    return {
      before: text,
      after: prefix,
      matches: [{ note: 'next-steps block', snippet: block.slice(0, 120) }],
    }
  },
}

/** Two before/after fences where one quotation would do. */
export const beforeAfter = {
  id: 'before-after',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const fences = text.match(FENCE)
    if (!fences || fences.length < 2) return null
    const inner = (fence) => normalize(fence.replace(/^```[^\n]*\n/, '').replace(/```$/, ''))
    const first = inner(fences[0])
    const second = inner(fences[1])
    if (first.length < 20 || second.length < 20) return null
    const firstLines = first.split('\n')
    const secondSet = new Set(second.split('\n'))
    const shared = firstLines.filter((line) => line.length >= 8 && secondSet.has(line)).length
    if (shared === 0 || shared / firstLines.length < 0.8) return null
    return {
      before: text,
      after: tidy(text.replace(fences[0], '')),
      matches: [{ note: 'before/after pair where one block would do', snippet: first.slice(0, 120) }],
    }
  },
}

const WRAPPER =
  /^(?:The|This|It|Your) [^\n]{0,60}?\b(?:is|are|lies|can be found|is located|is defined|lives)\b[^\n]{0,80}?[.!?]\s+/

/** Wrapper sentence around a bare value. */
export const wrapper = {
  id: 'wrapper',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const lines = text.split('\n').length
    if (lines > 4) return null
    const match = text.match(WRAPPER)
    if (!match) return null
    const rest = text.slice(match[0].length)
    if (rest.trim().length < 2) return null
    return {
      before: text,
      after: rest.trimStart(),
      matches: [{ note: 'wrapper sentence around a value', snippet: match[0].trim().slice(0, 120) }],
    }
  },
}

/** A command quoted in prose that the same turn already ran. */
export const commandQuote = {
  id: 'command-quote',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const commands = (unit.context?.turnCommands ?? []).map((command) => normalize(command))
    if (commands.length === 0) return null
    const rewritten = rewriteProse(text, (part) => {
      let count = 0
      const next = part.replace(/`([^`\n]{1,160})`/g, (all, inner) => {
        const candidate = normalize(inner)
        if (!commands.some((command) => command === candidate || candidate.startsWith(command))) {
          return all
        }
        count += 1
        return inner
      })
      return { text: next, count }
    })
    if (rewritten.count === 0) return null
    return {
      before: text,
      after: rewritten.text,
      matches: [{ note: 'command quoted in prose', snippet: '' }],
    }
  },
}

const NARRATION_LEAD =
  /^(?:Let me|Allow me|Now,? let me|Now I'll|First,? let me|Next,? let me|Let's|Let us|I'll|I will|I'm going to|I am going to|Let me go ahead and)\s+/i

/** Intent lead-in before a tool call, or a pure status line. */
export const narration = {
  id: 'narration',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '' || text.includes('```')) return null
    const lead = text.match(NARRATION_LEAD)
    if (!lead) return null
    const hasToolCalls = unit.context?.hasToolCalls === true
    const isShort = text.trim().length <= 220
    if (hasToolCalls && isShort) {
      return {
        before: text,
        after: '',
        matches: [{ note: 'status line before a tool call', snippet: text.trim().slice(0, 120) }],
      }
    }
    return {
      before: text,
      after: text.slice(lead[0].length),
      matches: [{ note: 'narration lead-in', snippet: lead[0].trim() }],
    }
  },
}

/** Reply text echoing lines of the tool result it just received. */
export const toolEcho = {
  id: 'tool-echo',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const result = normalize(unit.context?.previousToolResult)
    if (result.length < 40) return null
    let removed = 0
    let snippet = ''
    const rewritten = splitFences(text)
      .map((part) => {
        if (part.fence) return part.text
        return part.text
          .split('\n')
          .filter((line) => {
            const candidate = normalize(line)
            if (candidate.length < 40 || candidate.split(' ').length < 5) return true
            if (!result.includes(candidate)) return true
            removed += 1
            if (!snippet) snippet = candidate.slice(0, 120)
            return false
          })
          .join('\n')
      })
      .join('')
    if (removed === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: `echoed tool output (${removed} line${removed === 1 ? '' : 's'})`, snippet }],
    }
  },
}

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B50}\u{2705}\u{274C}\u{2757}]/gu

/** TextStyle markers: bold, headings in short answers, emoji. */
export const markup = {
  id: 'markup',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const lineCount = text.split('\n').length
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let next = part
      let hits = 0
      const bold = next.match(/\*\*[^*\n]{1,120}\*\*/g)
      if (bold) {
        hits += bold.length
        next = next.replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '$1')
      }
      if (lineCount <= 12) {
        const headings = next.match(/^#{1,6}\s+\S/gm)
        if (headings) {
          hits += headings.length
          next = next.replace(/^#{1,6}\s+/gm, '')
        }
      }
      const emoji = next.match(EMOJI)
      if (emoji) {
        hits += emoji.length
        next = next.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ')
      }
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: `markup markers (${count})`, snippet: '' }],
    }
  },
}

/** A markdown table rewritten as inline rows. */
export const table = {
  id: 'table',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const block = text.match(/(?:^|\n)((?:\|[^\n]*\|[^\n]*\n?){2,})/)
    if (!block) return null
    const rows = block[1].split('\n').filter((line) => line.trim() !== '')
    if (rows.length < 2) return null
    const dataRows = rows.filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
    if (dataRows.length === 0) return null
    const inline = dataRows
      .map((line) =>
        line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(', '),
      )
      .join('\n')
    return {
      before: text,
      after: tidy(text.replace(block[1], inline)),
      matches: [{ note: `table with ${dataRows.length} rows`, snippet: rows[0].slice(0, 120) }],
    }
  },
}

/** Terminal period on a one-line answer. */
export const terminalPeriod = {
  id: 'terminal-period',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const trimmed = text.trimEnd()
    if (trimmed.includes('\n') || trimmed.length > 120) return null
    if (!/[A-Za-zА-Яа-я)]\.$/.test(trimmed)) return null
    const lastWord = trimmed.split(/\s+/).pop() ?? ''
    if (/\.[A-Za-z0-9]{1,6}\.$/.test(lastWord)) return null
    return {
      before: text,
      after: trimmed.slice(0, -1),
      matches: [{ note: 'terminal period on a fragment', snippet: trimmed.slice(-60) }],
    }
  },
}

/** Language tag on a log or plain-text fence. */
export const fenceLang = {
  id: 'fence-lang',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    let count = 0
    const rewritten = splitFences(text)
      .map((part) => {
        if (!part.fence) return part.text
        const replaced = part.text.replace(/^```(?:text|txt|log|plaintext|console|output)\s*\n/i, () => {
          count += 1
          return '```\n'
        })
        return replaced
      })
      .join('')
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: 'language tag on a log fence', snippet: '```text' }],
    }
  },
}

/** Paths enumerated with commas instead of spaces. */
export const commaPath = {
  id: 'comma-path',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let hits = 0
      const next = part.replace(/(\S+\.\w{1,6}), (?=\S+\.\w{1,6})/g, (all, first) => {
        hits += 1
        return `${first} `
      })
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: `paths separated by commas (${count})`, snippet: '' }],
    }
  },
}

/** Blank lines between list items: the rejected control. */
export const blankLines = {
  id: 'blank-lines',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const matches = text.match(/\n\n(?=\s*(?:[-*]|\d+\.)\s)/g)
    if (!matches) return null
    return {
      before: text,
      after: text.replace(/\n\n(?=\s*(?:[-*]|\d+\.)\s)/g, '\n'),
      matches: [{ note: 'blank lines between list items', snippet: '' }],
    }
  },
}

const ABBREVIATIONS = {
  cfg: 'configuration',
  impl: 'implementation',
  req: 'request',
  res: 'response',
  fn: 'function',
  mgr: 'manager',
}

/** Invented abbreviations: the rejected control. */
export const inventedAbbrev = {
  id: 'invented-abbrev',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let hits = 0
      const next = part.replace(/\b(cfg|impl|req|res|fn|mgr)\b/g, (all, word) => {
        hits += 1
        return ABBREVIATIONS[word] ?? all
      })
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: 'invented abbreviation', snippet: '' }],
    }
  },
}

/** Causal arrow: the rejected control. */
export const causalArrow = {
  id: 'causal-arrow',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const arrows = text.match(/→/g)
    if (!arrows) return null
    return {
      before: text,
      after: text.replace(/→/g, '.'),
      matches: [{ note: 'causal arrow', snippet: '→' }],
    }
  },
}

// ---------------------------------------------------------------------------
// Thinking detectors
// ---------------------------------------------------------------------------

/** Reasoning that quotes the tool result it just received. */
export const thinkingEcho = {
  id: 'thinking-echo',
  scope: 'unit',
  kind: 'thinking',
  apply(unit) {
    const text = unit.text ?? ''
    const result = normalize(unit.context?.previousToolResult)
    if (result.length < 60 || text.trim() === '') return null
    const kept = []
    let removed = 0
    let snippet = ''
    for (const sentence of sentences(text)) {
      const candidate = normalize(sentence)
      if (candidate.length >= 60 && result.includes(candidate)) {
        removed += 1
        if (!snippet) snippet = candidate.slice(0, 120)
        continue
      }
      kept.push(sentence)
    }
    if (removed === 0) return null
    return {
      before: text,
      after: kept.join(' '),
      matches: [{ note: `tool result narrated in thinking (${removed})`, snippet }],
    }
  },
}

/** Reasoning that repeats an earlier conclusion of the same session. */
export const thinkingRederive = {
  id: 'thinking-rederive',
  scope: 'unit',
  kind: 'thinking',
  apply(unit) {
    const text = unit.text ?? ''
    const earlier = normalize(unit.context?.earlierText)
    if (earlier.length < 200 || text.trim() === '') return null
    const kept = []
    let removed = 0
    let snippet = ''
    for (const sentence of sentences(text)) {
      const candidate = normalize(sentence)
      if (candidate.length >= 60 && earlier.includes(candidate)) {
        removed += 1
        if (!snippet) snippet = candidate.slice(0, 120)
        continue
      }
      kept.push(sentence)
    }
    if (removed === 0) return null
    return {
      before: text,
      after: kept.join(' '),
      matches: [{ note: `fact re-derived in thinking (${removed})`, snippet }],
    }
  },
}

// ---------------------------------------------------------------------------
// Tool-call detectors
// ---------------------------------------------------------------------------

const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'exec', 'run'])

/**
 * A wide edit anchor: the changed lines plus one context line on each side is
 * the smallest anchor that still names the change. Uniqueness is not checked
 * here, so the delta is an upper bound.
 */
export const editAnchor = {
  id: 'edit-anchor',
  scope: 'unit',
  kind: 'tool',
  tools: ['edit', 'str_replace', 'replace'],
  apply(unit) {
    const call = unit.call
    if (!call || !this.tools.includes(call.name)) return null
    const oldText = call.args?.old_string
    const newText = call.args?.new_string
    if (typeof oldText !== 'string' || typeof newText !== 'string') return null
    const oldLines = oldText.split('\n')
    if (oldLines.length < 4) return null
    const newLines = newText.split('\n')
    const prefix = commonPrefix(oldLines, newLines)
    const suffix = commonSuffix(oldLines, newLines, prefix)
    const start = Math.max(0, prefix - 1)
    const end = Math.min(oldLines.length, oldLines.length - suffix + 1)
    if (end <= start) return null
    const minimal = oldLines.slice(start, end).join('\n')
    if (minimal === oldText || minimal === '' || end - start === oldLines.length) return null
    return {
      before: oldText,
      after: minimal,
      matches: [
        {
          note: `anchor of ${oldLines.length} lines, ${end - start} needed`,
          snippet: minimal.slice(0, 120),
        },
      ],
    }
  },
}

/**
 * A second write of a path already written in the session: the edit that would
 * have carried the same change pays only for the changed lines.
 */
export const repeatWrite = {
  id: 'repeat-write',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const written = new Map()
    const hits = []
    for (const call of session.calls) {
      if (!['write', 'create_file'].includes(call.name)) continue
      const path = call.args?.file_path ?? call.args?.path
      const content = call.args?.content
      if (typeof path !== 'string' || typeof content !== 'string') continue
      const previous = written.get(path)
      written.set(path, content)
      if (previous === undefined || previous === content) continue
      const oldLines = previous.split('\n')
      const newLines = content.split('\n')
      const prefix = commonPrefix(oldLines, newLines)
      const suffix = commonSuffix(oldLines, newLines, prefix)
      const changedOld = oldLines.slice(prefix, oldLines.length - suffix)
      const changedNew = newLines.slice(prefix, newLines.length - suffix)
      const changedLines = changedOld.length + changedNew.length
      if (changedLines === 0) continue
      if (changedLines >= newLines.length * 0.5) continue
      if (content.length <= changedOld.join('\n').length + changedNew.join('\n').length) continue
      const patch = [...changedOld, ...changedNew].join('\n')
      hits.push({
        before: content,
        after: patch,
        matches: [
          {
            note: `repeated write of ${basename(path)} (${newLines.length} lines)`,
            snippet: changedNew[0]?.slice(0, 120) ?? '',
          },
        ],
      })
    }
    return hits.length === 0 ? null : hits
  },
}

/** Identical edits that one `replace_all` call replaces. */
export const identicalEdits = {
  id: 'identical-edits',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const groups = new Map()
    for (const call of session.calls) {
      if (call.name !== 'edit') continue
      if (call.args?.replace_all === true) continue
      const key = call.raw
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    const hits = []
    for (const [raw, count] of groups) {
      if (count < 2) continue
      hits.push({
        before: raw,
        after: '',
        units: count - 1,
        matches: [{ note: `identical edit repeated ${count} times`, snippet: raw.slice(0, 120) }],
      })
    }
    return hits.length === 0 ? null : hits
  },
}

/** A `cd <path> && ` prefix that names the directory the session is already in. */
export const cdPrefix = {
  id: 'cd-prefix',
  scope: 'unit',
  kind: 'tool',
  tools: [...SHELL_TOOLS],
  apply(unit) {
    const call = unit.call
    if (!call || !this.tools.includes(call.name)) return null
    const command = call.args?.command
    if (typeof command !== 'string') return null
    const match = command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)\s*/)
    if (!match) return null
    const target = (match[1] ?? match[2] ?? match[3] ?? '').replace(/[\\/]+$/, '').toLowerCase()
    const cwd = String(unit.context?.cwd ?? '').replace(/[\\/]+$/, '').toLowerCase()
    const workdir = String(call.args?.workdir ?? '').replace(/[\\/]+$/, '').toLowerCase()
    if (target === '' || (target !== cwd && target !== workdir)) return null
    return {
      before: match[0],
      after: '',
      matches: [{ note: 'cd prefix naming the current directory', snippet: match[0].trim() }],
    }
  },
}

/** A shell description longer than five words. */
export const toolDescription = {
  id: 'tool-description',
  scope: 'unit',
  kind: 'tool',
  tools: [...SHELL_TOOLS],
  apply(unit) {
    const call = unit.call
    if (!call || !this.tools.includes(call.name)) return null
    const description = call.args?.description
    if (typeof description !== 'string') return null
    const words = description.trim().split(/\s+/).filter(Boolean)
    if (words.length <= 5) return null
    return {
      before: description,
      after: words.slice(0, 5).join(' '),
      matches: [{ note: `description of ${words.length} words`, snippet: description.slice(0, 120) }],
    }
  },
}

/** A long shell command repeated three times or more. */
export const hotCommand = {
  id: 'hot-command',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const counts = new Map()
    for (const call of session.calls) {
      if (!SHELL_TOOLS.has(call.name)) continue
      const command = call.args?.command
      if (typeof command !== 'string') continue
      const key = normalize(command)
      if (key.length < 60) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const hits = []
    for (const [command, count] of counts) {
      if (count < 3) continue
      hits.push({
        before: command,
        after: './script.ps1',
        units: count - 2,
        matches: [{ note: `long command repeated ${count} times`, snippet: command.slice(0, 120) }],
      })
    }
    return hits.length === 0 ? null : hits
  },
}

/** A long path or URL that a session alias would have shortened. */
export const pathRepeat = {
  id: 'path-repeat',
  scope: 'session',
  kind: 'text',
  apply(session) {
    const counts = new Map()
    for (const text of session.texts) {
      const prose = proseOnly(text)
      const tokens =
        prose.match(/[A-Za-z]:\\[^\s`<>"|*?]+/g) ??
        []
      const urls = prose.match(/https?:\/\/[^\s`<>")\]]+/g) ?? []
      const posix = prose.match(/(?:^|\s)(\/(?:[\w.@-]+\/){2,}[\w.@-]+)/g) ?? []
      for (const token of [...tokens, ...urls, ...posix.map((part) => part.trim())]) {
        if (token.length < 24) continue
        counts.set(token, (counts.get(token) ?? 0) + 1)
      }
    }
    const hits = []
    for (const [token, count] of counts) {
      if (count < 3) continue
      hits.push({
        before: token,
        after: basename(token),
        units: count - 1,
        matches: [{ note: `path repeated ${count} times`, snippet: token.slice(0, 120) }],
      })
    }
    return hits.length === 0 ? null : hits
  },
}

/** Paragraph repeated from an earlier turn of the same session. */
export const repeatParagraph = {
  id: 'repeat-paragraph',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const earlier = normalize(unit.context?.earlierText)
    if (earlier.length < 300) return null
    let removed = 0
    let snippet = ''
    const kept = text.split(/\n{2,}/).filter((paragraph) => {
      const candidate = normalize(paragraph)
      if (candidate.length < 120) return true
      if (!earlier.includes(candidate)) return true
      removed += 1
      if (!snippet) snippet = candidate.slice(0, 120)
      return false
    })
    if (removed === 0) return null
    return {
      before: text,
      after: tidy(kept.join('\n\n')),
      matches: [{ note: `paragraph repeated from an earlier turn (${removed})`, snippet }],
    }
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Every detector, in catalogue order of first use. */
export const DETECTORS = [
  filler,
  recap,
  offer,
  restate,
  reprint,
  nextSteps,
  beforeAfter,
  wrapper,
  commandQuote,
  narration,
  toolEcho,
  markup,
  table,
  terminalPeriod,
  fenceLang,
  commaPath,
  blankLines,
  inventedAbbrev,
  causalArrow,
  thinkingEcho,
  thinkingRederive,
  editAnchor,
  repeatWrite,
  identicalEdits,
  cdPrefix,
  toolDescription,
  hotCommand,
  pathRepeat,
  repeatParagraph,
]

/** Detector lookup by id. */
export const DETECTORS_BY_ID = new Map(DETECTORS.map((detector) => [detector.id, detector]))
