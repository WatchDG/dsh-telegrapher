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
  /^(?:Sure|Certainly|Of course|Absolutely|Great question|Happy to help|I'd be happy to help|I'd be glad to help|No problem|Конечно|Разумеется|Отличный вопрос|Без проблем|Само собой|Безусловно|С радостью помогу|Я с удовольствием помогу|Я помогу)(?![\p{L}\p{N}_])[^.!?\n]{0,100}[.!?]\s*/iu
const FILLER_PHRASE =
  /(?<![\p{L}\p{N}_])(?:of course|needless to say|as you (?:can see|know)|на самом деле|собственно говоря|в общем-то)(?![\p{L}\p{N}_])[,]?\s*/giu

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
  /^(?:Let me|Allow me|Now,? let me|Now I'll|First,? let me|Next,? let me|Let's|Let us|I'll|I will|I'm going to|I am going to|Let me go ahead and|Давайте (?:проверим|посмотрим|начнём)|Сейчас я|Сначала (?:проверим|посмотрим))\s+/iu

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
    if (!/[\p{L})]\.$/u.test(trimmed)) return null
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

/** Em-dash replaced with a hyphen: the rejected control. */
export const emDash = {
  id: 'em-dash',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      const dashes = part.match(/—/g)
      if (!dashes) return { text: part, count: 0 }
      return { text: part.replace(/—/g, '-'), count: dashes.length }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: `em-dash (${count})`, snippet: '—' }],
    }
  },
}

const VERBOSE_DONE_EN =
  /^\s*(?:I have|I've|The changes have been|The file has been)\s+(?:successfully\s+)?(?:updated|modified|applied|saved|written|edited|created)\b[^.!?\n]{0,80}[.!?]\s*$/i
const VERBOSE_DONE_RU =
  /^\s*(?:Я\s+)?(?:успешно\s+)?(?:обновил|изменил|сохранил|применил изменения|записал|отредактировал)(?![\p{L}\p{N}_])[^.!?\n]{0,80}[.!?]\s*$/iu

/** One-sentence verbose confirmation after a mechanical operation. */
export const verboseDone = {
  id: 'verbose-done',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    const trimmed = text.trim()
    if (trimmed === '' || trimmed.includes('\n')) return null
    if (VERBOSE_DONE_EN.test(trimmed)) {
      return {
        before: text,
        after: 'Done.',
        matches: [{ note: 'verbose completion sentence', snippet: trimmed.slice(0, 120) }],
      }
    }
    if (VERBOSE_DONE_RU.test(trimmed)) {
      return {
        before: text,
        after: 'Готово.',
        matches: [{ note: 'verbose completion sentence', snippet: trimmed.slice(0, 120) }],
      }
    }
    return null
  },
}

const APOLOGY =
  /(?:^|\n|\s)(?:I apologize|Sorry about that|My apologies|My mistake|I'm sorry for the confusion|Извините за|Прошу прощения за)(?![\p{L}\p{N}_])[^.!?\n]{0,100}[.!?]\s*/giu

/** Apologies and self-blame in prose. */
export const apology = {
  id: 'apology',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    let snippet = ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      const matches = part.match(APOLOGY)
      if (!matches) return { text: part, count: 0 }
      const next = part.replace(APOLOGY, ' ').trimStart()
      if (next.trim().length < 4) return { text: part, count: 0 }
      if (!snippet) snippet = matches[0].trim().slice(0, 120)
      return { text: next, count: matches.length }
    })
    if (count === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: 'apology or self-blame', snippet }],
    }
  },
}

/** A two-item bullet list of short fragments rewritten inline. */
export const shortList = {
  id: 'short-list',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    let snippet = ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      const lines = part.split('\n')
      const out = []
      let hits = 0
      let i = 0
      while (i < lines.length) {
        const first = lines[i]?.match(/^\s*[-*]\s+([^\n]{2,50})$/)
        const second = lines[i + 1]?.match(/^\s*[-*]\s+([^\n]{2,50})$/)
        const prevIsItem = i > 0 && /^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i - 1] ?? '')
        const nextIsItem = i + 2 < lines.length && /^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i + 2] ?? '')
        if (first && second && !prevIsItem && !nextIsItem) {
          const inline = `${first[1].trim().replace(/[.;,]+$/, '')}; ${second[1].trim()}`
          out.push(inline)
          hits += 1
          if (!snippet) snippet = `${lines[i]}\n${lines[i + 1]}`.slice(0, 120)
          i += 2
          continue
        }
        out.push(lines[i])
        i += 1
      }
      return { text: out.join('\n'), count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: `two-item list (${count})`, snippet }],
    }
  },
}

const PLAIN_BACKTICK_WORD =
  /(?<![`\w])`(yes|no|done|ok|clean|pass|fail|none|all|default|да|нет|готово|ок|чисто)`(?![`\w])/giu

/** Backticks around plain conversational words rather than code. */
export const plainBackticks = {
  id: 'plain-backticks',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    let snippet = ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let hits = 0
      const next = part.replace(PLAIN_BACKTICK_WORD, (all, word) => {
        hits += 1
        if (!snippet) snippet = all
        return word
      })
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: `plain-word backticks (${count})`, snippet }],
    }
  },
}

/** Markdown link whose label repeats the URL verbatim: [https://...](https://...). */
export const duplicateUrlLink = {
  id: 'duplicate-url-link',
  scope: 'unit',
  kind: 'text',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    let snippet = ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let hits = 0
      const next = part.replace(/\[(https?:\/\/[^\]\s]+)\]\((https?:\/\/[^)\s]+)\)/g, (all, label, url) => {
        if (label.replace(/\/+$/, '') !== url.replace(/\/+$/, '')) return all
        hits += 1
        if (!snippet) snippet = all.slice(0, 120)
        return url
      })
      return { text: next, count: hits }
    })
    if (count === 0) return null
    return {
      before: text,
      after: rewritten,
      matches: [{ note: `duplicate URL link (${count})`, snippet }],
    }
  },
}

// ---------------------------------------------------------------------------
// Thinking detectors
// ---------------------------------------------------------------------------

/** Code drafted in thinking that the same step immediately writes or edits. */
export const thinkingCodeDraft = {
  id: 'thinking-code-draft',
  scope: 'unit',
  kind: 'thinking',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    const stepLines = unit.context?.stepCodeLines
    const codeLines = stepLines && stepLines.size > 0 ? stepLines : unit.context?.codeLines
    if (!codeLines || codeLines.size === 0) return null
    let matched = 0
    let snippet = ''
    const parts = splitFences(text)
    if (parts.some((part) => part.fence)) {
      const rewritten = parts
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
          if (hits.length === 0 || hits.length / content.length < 0.75) return part.text
          matched += 1
          if (!snippet) snippet = hits[0].slice(0, 120)
          return ''
        })
        .join('')
      if (matched > 0) {
        return {
          before: text,
          after: tidy(rewritten),
          matches: [{ note: `code draft in thinking (${matched} fence${matched === 1 ? '' : 's'})`, snippet }],
        }
      }
    }
    const lines = text.split('\n')
    if (lines.length < 4) return null
    const kept = []
    let run = []
    const flushRun = () => {
      if (run.length >= 3) {
        matched += 1
        if (!snippet) snippet = normalize(run[0]).slice(0, 120)
      } else {
        kept.push(...run)
      }
      run = []
    }
    for (const line of lines) {
      const norm = normalize(line)
      if (norm.length >= 12 && codeLines.has(norm)) {
        run.push(line)
      } else {
        flushRun()
        kept.push(line)
      }
    }
    flushRun()
    if (matched === 0) return null
    return {
      before: text,
      after: tidy(kept.join('\n')),
      matches: [{ note: `code draft in thinking (${matched} block${matched === 1 ? '' : 's'})`, snippet }],
    }
  },
}

const THINKING_OPENER =
  /^(?:Okay,?\s*|Alright,?\s*|Hmm,?\s*|Well,?\s*|Wait,?\s*|Now,?\s*)+(?:let's see(?:\s+what\s+we\s+have(?:\s+here)?)?|let me (?:think|see|check|look at|understand)|so the user (?:wants|is asking|asked)|the user (?:wants|is asking|asked) me to)[^.!?\n]{0,100}[.!?]\s*/i
const THINKING_PHRASE =
  /\b(?:let's see what we have here|let me double check that|let's think step by step|wait a second,? let me)\b[.,!]?\s*/gi

/** Conversational self-talk, hedging or question restatement in thinking. */
export const thinkingFiller = {
  id: 'thinking-filler',
  scope: 'unit',
  kind: 'thinking',
  apply(unit) {
    const text = unit.text ?? ''
    if (text.trim() === '') return null
    let snippet = ''
    const { text: rewritten, count } = rewriteProse(text, (part) => {
      let next = part
      let hits = 0
      const opener = next.match(THINKING_OPENER)
      if (opener && opener[0].length < next.length) {
        if (!snippet) snippet = opener[0].trim().slice(0, 120)
        next = next.slice(opener[0].length)
        hits += 1
      }
      const phrase = next.match(THINKING_PHRASE)
      if (phrase) {
        if (!snippet) snippet = phrase[0].trim().slice(0, 120)
        next = next.replace(THINKING_PHRASE, '')
        hits += phrase.length
      }
      return { text: next, count: hits }
    })
    if (count === 0 || tidy(rewritten).length === 0) return null
    return {
      before: text,
      after: tidy(rewritten),
      matches: [{ note: `self-talk in thinking (${count})`, snippet }],
    }
  },
}

/** A plan restated in thinking after it was already written down in the session. */
export const thinkingPlan = {
  id: 'thinking-plan',
  scope: 'unit',
  kind: 'thinking',
  apply(unit) {
    const text = unit.text ?? ''
    const earlier = normalize(unit.context?.earlierText)
    if (earlier.length < 100 || text.trim() === '') return null
    const lines = text.split('\n')
    const kept = []
    let removed = 0
    let snippet = ''
    for (const line of lines) {
      const isStep = /^\s*(?:\d+[.)]|[-*])\s+/.test(line)
      const candidate = normalize(line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, ''))
      if (isStep && candidate.length >= 24 && earlier.includes(candidate)) {
        removed += 1
        if (!snippet) snippet = line.trim().slice(0, 120)
        continue
      }
      kept.push(line)
    }
    if (removed < 2) return null
    return {
      before: text,
      after: tidy(kept.join('\n')),
      matches: [{ note: `plan steps restated in thinking (${removed})`, snippet }],
    }
  },
}

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

/** Multiple sequential edits to the same file in one turn that one edit call replaces. */
export const adjacentEdits = {
  id: 'adjacent-edits',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const hits = []
    let run = []
    const flush = () => {
      if (run.length >= 2) {
        const path = run[0].args?.file_path ?? run[0].args?.path ?? ''
        const wrapper = JSON.stringify({ file_path: path, old_string: '', new_string: '' })
        hits.push({
          before: wrapper,
          after: '',
          units: run.length - 1,
          matches: [
            {
              note: `${run.length} adjacent edits to ${basename(path)} in one turn`,
              snippet: String(path).slice(0, 120),
            },
          ],
        })
      }
      run = []
    }
    for (const call of session.calls) {
      if (!['edit', 'str_replace', 'replace'].includes(call.name)) {
        flush()
        continue
      }
      const path = call.args?.file_path ?? call.args?.path
      if (typeof path !== 'string' || path === '') {
        flush()
        continue
      }
      const prev = run[run.length - 1]
      const prevPath = prev ? (prev.args?.file_path ?? prev.args?.path) : null
      if (
        prev &&
        prevPath === path &&
        (call.turn === undefined || prev.turn === undefined || call.turn === prev.turn) &&
        call.raw !== prev.raw
      ) {
        run.push(call)
      } else {
        flush()
        run = [call]
      }
    }
    flush()
    return hits.length === 0 ? null : hits
  },
}

const BANNER_LINE = /^\s*(?:\/\/|#|\/\*+|\*+)\s*[-=*#~]{8,}\s*(?:\*+\/)?\s*$/

/** Decorative ASCII banner divider lines in written or edited code. */
export const bannerComments = {
  id: 'banner-comments',
  scope: 'unit',
  kind: 'tool',
  tools: ['write', 'create_file', 'edit', 'str_replace', 'replace'],
  apply(unit) {
    const call = unit.call
    if (!call || !this.tools.includes(call.name)) return null
    const target =
      typeof call.args?.content === 'string'
        ? call.args.content
        : typeof call.args?.new_string === 'string'
          ? call.args.new_string
          : null
    if (!target) return null
    const oldLines =
      typeof call.args?.old_string === 'string' ? new Set(call.args.old_string.split('\n')) : new Set()
    let removed = 0
    let snippet = ''
    const kept = target.split('\n').filter((line) => {
      if (!BANNER_LINE.test(line) || oldLines.has(line)) return true
      removed += 1
      if (!snippet) snippet = line.trim().slice(0, 120)
      return false
    })
    if (removed === 0) return null
    return {
      before: target,
      after: kept.join('\n'),
      matches: [{ note: `banner comment line (${removed})`, snippet }],
    }
  },
}

const SHELL_SEP =
  /(?:^\s*|(?:;|&&)\s*)(?:echo|printf|Write-Host)\s+(?:-[a-zA-Z]+\s+)*(?:"[-=_*#~]{3,}[^"\n]*"|'[-=_*#~]{3,}[^'\n]*'|[-=_*#~]{3,})\s*(?:(?:;|&&)\s*)?/g

/** Decorative echo/printf separator commands in shell calls. */
export const shellSeparators = {
  id: 'shell-separators',
  scope: 'unit',
  kind: 'tool',
  tools: [...SHELL_TOOLS],
  apply(unit) {
    const call = unit.call
    if (!call || !this.tools.includes(call.name)) return null
    const command = call.args?.command
    if (typeof command !== 'string') return null
    const matches = command.match(SHELL_SEP)
    if (!matches) return null
    const next = command.replace(SHELL_SEP, ' ').trim()
    if (next === '' || next === command.trim()) return null
    return {
      before: command,
      after: next,
      matches: [{ note: `shell separator (${matches.length})`, snippet: matches[0].trim().slice(0, 120) }],
    }
  },
}

/** Re-reading an unchanged file with the same range in the same session. */
export const repeatRead = {
  id: 'repeat-read',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const seen = new Map()
    const hits = []
    for (const call of session.calls) {
      if (SHELL_TOOLS.has(call.name)) {
        seen.clear()
        continue
      }
      const path = call.args?.file_path ?? call.args?.path
      if (['write', 'create_file', 'edit', 'str_replace', 'replace'].includes(call.name)) {
        if (typeof path === 'string') {
          for (const key of [...seen.keys()]) {
            if (key.startsWith(`${path}\u0000`)) seen.delete(key)
          }
        }
        continue
      }
      if (!['read', 'read_file'].includes(call.name)) continue
      if (typeof path !== 'string' || path === '') continue
      const key = `${path}\u0000${call.args?.offset ?? ''}\u0000${call.args?.limit ?? ''}`
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      if (count >= 2 && call.raw) {
        hits.push({
          before: call.raw,
          after: '',
          matches: [{ note: `repeated read of ${basename(path)}`, snippet: call.raw.slice(0, 120) }],
        })
      }
    }
    return hits.length === 0 ? null : hits
  },
}

/** Three or more file writes in one session sharing the same template structure. */
export const templateWrites = {
  id: 'template-writes',
  scope: 'session',
  kind: 'tool',
  apply(session) {
    const writes = []
    for (const call of session.calls) {
      if (!['write', 'create_file'].includes(call.name)) continue
      const path = call.args?.file_path ?? call.args?.path
      const content = call.args?.content
      if (typeof path !== 'string' || typeof content !== 'string') continue
      const lines = content
        .split('\n')
        .map((line) => normalize(line))
        .filter((line) => line.length >= 6)
      if (lines.length < 6) continue
      writes.push({ path, content, lines, set: new Set(lines) })
    }
    if (writes.length < 3) return null
    const used = new Set()
    const hits = []
    for (let i = 0; i < writes.length; i += 1) {
      if (used.has(i)) continue
      const base = writes[i]
      const group = [base]
      const paths = new Set([base.path])
      for (let j = i + 1; j < writes.length; j += 1) {
        if (used.has(j) || paths.has(writes[j].path)) continue
        const other = writes[j]
        const shared = base.lines.filter((line) => other.set.has(line)).length
        if (shared / Math.max(base.lines.length, other.lines.length) >= 0.7) {
          group.push(other)
          paths.add(other.path)
          used.add(j)
        }
      }
      if (group.length >= 3) {
        used.add(i)
        hits.push({
          before: base.content,
          after: './generate.mjs',
          units: group.length - 1,
          matches: [
            {
              note: `${group.length} template-similar writes (${basename(base.path)}…)`,
              snippet: base.lines[0]?.slice(0, 120) ?? '',
            },
          ],
        })
      }
    }
    return hits.length === 0 ? null : hits
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
  emDash,
  verboseDone,
  apology,
  shortList,
  plainBackticks,
  duplicateUrlLink,
  thinkingEcho,
  thinkingCodeDraft,
  thinkingFiller,
  thinkingRederive,
  thinkingPlan,
  editAnchor,
  repeatWrite,
  identicalEdits,
  adjacentEdits,
  cdPrefix,
  toolDescription,
  bannerComments,
  shellSeparators,
  repeatRead,
  templateWrites,
  hotCommand,
  pathRepeat,
  repeatParagraph,
]

/** Detector lookup by id. */
export const DETECTORS_BY_ID = new Map(DETECTORS.map((detector) => [detector.id, detector]))
