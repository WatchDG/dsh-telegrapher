/**
 * dsh-telegrapher — the agent tool.
 *
 * One tool with an `action` switch instead of five tools: the definitions are
 * paid for on every request, and a single bounded entry point is enough for an
 * agent that needs the numbers behind the rules. Every answer is a short text
 * table; the detail lives in Settings → Telegrapher.
 */

import { filterWords } from './words.js'

/** Compact token count: 270123 -> "270.1K". */
export function fmtTokens(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`
  return String(Math.round(number))
}

/** Share as a rounded percentage: 0.792 -> "79%". */
export function fmtShare(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${Math.round(number * 100)}%`
}

/** One line of the summary view. */
export function formatSummary(report, ledger, sectionTokens = null) {
  if (!report?.ok) {
    return `Telegrapher analysis unavailable: ${report?.reason ?? 'unknown reason'}\nOpen Settings → Telegrapher for diagnostics, or set analysis: true in the plugin config.`
  }
  const lines = []
  const measure = report.measure ?? {}
  lines.push(
    `Telegrapher — ${report.scannedSessions} sessions, ${report.totals.assistantMessages} steps, ${fmtTokens(report.totals.outputTokens)} output tokens (tiktoken ${measure.encoding ?? '?'}, ${measure.exact ? 'exact' : 'estimate'})`,
  )
  const attribution = report.attribution ?? {}
  lines.push(
    `Mass: tool args ${fmtShare(attribution.tool)} (${fmtTokens(report.mass?.tool)}) | thinking ${fmtShare(attribution.thinking)} (${fmtTokens(report.mass?.thinking)}) | text ${fmtShare(attribution.text)} (${fmtTokens(report.mass?.text)})`,
  )
  const tools = (report.tools ?? []).slice(0, 4)
  if (tools.length > 0) {
    lines.push(`Top tools: ${tools.map((tool) => `${tool.name} ${fmtShare(tool.share)}`).join(' | ')}`)
  }
  const measured = (ledger ?? [])
    .filter((entry) => entry.kind === 'rule' && entry.status === 'supported')
    .sort((a, b) => b.tokens - a.tokens)
  const potential = measured.reduce((sum, entry) => sum + entry.tokens, 0)
  if (measured.length > 0) {
    const share = report.totals.outputTokens > 0 ? potential / report.totals.outputTokens : 0
    const overlap = Number.isFinite(report.potential?.overlap) ? report.potential.overlap : 0
    const netTokens = Math.max(0, potential - overlap)
    const net = overlap > 0 ? `, net ${fmtTokens(netTokens)}` : ''
    lines.push(
      `Rule potential (sum, rules may overlap): ${fmtTokens(potential)} tokens (${fmtShare(share)} of output${net}) — top: ${measured
        .slice(0, 3)
        .map((entry) => `${entry.rule} ${fmtTokens(entry.tokens)}`)
        .join(', ')}`,
    )
  } else {
    lines.push('Rule potential: nothing measured yet in the scanned sessions')
  }
  for (const hypothesis of (ledger ?? []).filter((entry) => entry.kind === 'empirical')) {
    lines.push(`${hypothesis.id} ${hypothesis.metric}: ${hypothesis.status} — ${hypothesis.reason}`)
  }
  if (Array.isArray(report.skipped) && report.skipped.length > 0) {
    const reasons = {}
    for (const entry of report.skipped) {
      const reason = String(entry?.reason ?? 'unknown')
      reasons[reason] = (reasons[reason] ?? 0) + 1
    }
    lines.push(
      `Skipped: ${Object.entries(reasons)
        .map(([reason, count]) => `${count}× ${reason}`)
        .join('; ')}`,
    )
  }
  if (sectionTokens !== null && Number.isFinite(sectionTokens)) {
    lines.push(`Prompt section: ${sectionTokens} tokens per request`)
  }
  return lines.join('\n')
}

/** The per-rule table, strongest evidence first. */
export function formatRules(ledger) {
  const order = { supported: 0, inconclusive: 1, refuted: 2, unmeasured: 3 }
  const entries = (ledger ?? [])
    .filter((entry) => entry.kind === 'rule')
    .sort((a, b) => {
      const status = (order[a.status] ?? 9) - (order[b.status] ?? 9)
      return status !== 0 ? status : b.tokens - a.tokens
    })
  if (entries.length === 0) return 'No rule measurements yet.'
  const rows = [
    ['rule', 'tier', 'occ', 'tokens', '/session', 'payback', 'status'],
    ...entries.map((entry) => [
      entry.rule,
      entry.tier ?? '—',
      String(entry.occurrences),
      fmtTokens(entry.tokens),
      fmtTokens(entry.perSession),
      entry.payback === null || entry.payback === undefined ? '—' : `${entry.payback.toFixed(1)}x`,
      entry.status,
    ]),
  ]
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  )
  return rows
    .map((row) =>
      row
        .map((cell, column) => String(cell ?? '').padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

/** The hypothesis ledger: empirical claims first, then rules, then proposals. */
export function formatHypotheses(ledger, limit = 25) {
  const kindOrder = { empirical: 0, rule: 1, proposal: 2 }
  const statusOrder = { supported: 0, refuted: 1, inconclusive: 2, unmeasured: 3 }
  const sorted = [...(ledger ?? [])].sort((a, b) => {
    const kind = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
    if (kind !== 0) return kind
    const status = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    return status !== 0 ? status : (b.tokens ?? 0) - (a.tokens ?? 0)
  })
  const entries = sorted.slice(0, limit)
  if (entries.length === 0) return 'No hypotheses measured yet.'
  const lines = entries.map((entry) => {
    const head = `${entry.id} [${entry.status}]`
    const detail =
      entry.kind === 'rule'
        ? `${entry.occurrences} occurrences, ${fmtTokens(entry.tokens)} tokens (${fmtTokens(entry.perSession)}/session)`
        : entry.kind === 'empirical'
          ? `n=${entry.n?.treatment ?? 0}/${entry.n?.control ?? 0}, diff ${fmtTokens(entry.diff)} (${fmtShare(entry.relative)}), median ${fmtTokens(entry.median?.control)} control`
          : `${fmtShare(entry.share)} of output mass`
    return `${head} ${entry.metric}: ${detail} — ${entry.reason}`
  })
  if (sorted.length > entries.length) lines.push(`… ${sorted.length - entries.length} more`)
  return lines.join('\n')
}

/** Per-session table, newest first. */
export function formatSessions(report, limit = 10) {
  if (!report?.ok) return `Telegrapher analysis unavailable: ${report?.reason ?? 'unknown reason'}`
  const sessions = (report.scope?.sessions ?? []).slice(0, Math.max(1, Math.min(limit, 25)))
  if (sessions.length === 0) return 'No sessions scanned.'
  const rows = [
    ['session', 'created', 'model', 'steps', 'output', 'thinking', 'rules'],
    ...sessions.map((session) => [
      session.id,
      new Date(session.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      session.model || '—',
      String(session.messages),
      fmtTokens(session.outputTokens),
      fmtTokens(session.thinkingTokens),
      session.rules ? 'yes' : 'no',
    ]),
  ]
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  )
  return rows
    .map((row) =>
      row
        .map((cell, column) => String(cell ?? '').padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

/** Audit rules by payback: which lean rules underperform and which full rules pay back. */
export function formatAudit(report, ledger, settings = {}) {
  if (!report?.ok) return `Telegrapher analysis unavailable: ${report?.reason ?? 'unknown reason'}`
  const rules = (ledger ?? []).filter((entry) => entry.kind === 'rule' && entry.tier !== null)
  const paying = rules
    .filter((entry) => entry.status === 'supported' && entry.payback !== null && entry.payback >= 1)
    .sort((a, b) => b.payback - a.payback)
  const promote = paying.filter((entry) => entry.tier === 'full')
  const underpaying = rules
    .filter((entry) => entry.tier === 'lean' && (entry.payback === null || entry.payback < 1))
    .sort((a, b) => (a.payback ?? 0) - (b.payback ?? 0))
  const lines = [
    `Audit (${report.scannedSessions} sessions, mode: ${settings.mode ?? 'lean'}):`,
    `Paying back (>=1.0x): ${
      paying.length === 0
        ? 'none yet'
        : paying.map((entry) => `${entry.rule} (${entry.payback.toFixed(1)}x)`).join(', ')
    }`,
  ]
  if (promote.length > 0) {
    lines.push(
      `Full-tier rules that pay back: ${promote
        .map((entry) => `${entry.rule} (${entry.payback.toFixed(1)}x, ${fmtTokens(entry.tokens)})`)
        .join(', ')}`,
    )
  }
  if (underpaying.length > 0) {
    lines.push(
      `Lean-tier rules below 1.0x on this corpus: ${underpaying
        .map((entry) => `${entry.rule} (${entry.payback === null ? '0.0x' : `${entry.payback.toFixed(1)}x`})`)
        .join(', ')}`,
    )
  }
  return lines.join('\n')
}

/** Detailed breakdown of one scanned session. */
export function formatSessionDetail(report, sessionId = '') {
  if (!report?.ok) return `Telegrapher analysis unavailable: ${report?.reason ?? 'unknown reason'}`
  const sessions = report.scope?.sessions ?? []
  if (sessions.length === 0) return 'No sessions scanned.'
  const target =
    typeof sessionId === 'string' && sessionId.trim() !== ''
      ? sessions.find((item) => item.id === sessionId.trim() || item.id.startsWith(sessionId.trim()))
      : sessions[0]
  if (!target) return `Session "${sessionId}" not found in the scanned window.`
  const lines = [
    `Session ${target.id} (${target.model || 'unknown'}, rules: ${target.rules ? 'yes' : 'no'})`,
    `Steps: ${target.messages} | Output: ${fmtTokens(target.outputTokens)} | Thinking: ${fmtTokens(target.thinkingTokens)} | Text: ${fmtTokens(target.textTokens)}${
      Number.isFinite(target.toolTokens) ? ` | Tool args: ${fmtTokens(target.toolTokens)}` : ''
    }`,
  ]
  if (Number.isFinite(target.ruleTokens) && target.ruleTokens > 0) {
    const top = (target.topRules ?? []).map((item) => `${item.rule} ${fmtTokens(item.tokens)}`).join(', ')
    lines.push(`Rule potential in session: ${fmtTokens(target.ruleTokens)}${top ? ` (${top})` : ''}`)
  } else {
    lines.push('Rule potential in session: 0')
  }
  return lines.join('\n')
}

/** Top words and phrases by token mass, with length filters and context fragments. */
export function formatWords(report, options = {}) {
  if (!report?.ok) return `Telegrapher analysis unavailable: ${report?.reason ?? 'unknown reason'}`
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(50, Number(options.limit))) : 15
  const items = filterWords(report.words, {
    minChars: options?.minChars ?? 4,
    maxChars: options?.maxChars ?? 0,
    minTokens: options?.minTokens ?? 1,
    channel: options?.channel ?? 'all',
    scope: options?.scope ?? 'unmatched',
    ngram: options?.ngram ?? 'all',
    onlyCandidates: options?.onlyCandidates ?? false,
    query: options?.query ?? '',
    sort: options?.sort ?? 'totalTokens',
    limit,
  })
  if (items.length === 0) return 'No words matched the filter criteria.'
  const rows = [
    ['word/phrase', 'chars', 'bpe', 'occ', 'sess', 'tokens', 'action'],
    ...items.map((item) => [
      item.term,
      String(item.chars),
      String(item.bpeTokens),
      String(item.activeOccurrences),
      String(item.activeSessions),
      fmtTokens(item.activeTokens),
      item.suggestion ? item.suggestion.action : '—',
    ]),
  ]
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  )
  const table = rows
    .map((row) =>
      row
        .map((cell, column) => String(cell ?? '').padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
  const withContext = items.filter((item) => item.suggestion && item.activeSnippets?.length > 0).slice(0, 3)
  if (withContext.length === 0) return table
  const snippets = withContext.map((item) => {
    const first = item.activeSnippets[0]
    return `• "${item.term}" [${item.suggestion.action}] (${first.channel}, ${first.tokens} tok): ${first.text}`
  })
  return `${table}\n\nContext fragments:\n${snippets.join('\n')}`
}

/** Measure texts or before/after pairs. */
export function formatMeasure(result) {
  const lines = []
  const { texts = [], pairs = [], counts } = result
  for (let index = 0; index < texts.length; index += 1) {
    const snippet = texts[index].replace(/\s+/g, ' ').slice(0, 60)
    lines.push(`"${snippet}": ${counts[index]} tokens`)
  }
  for (let index = 0; index < pairs.length; index += 1) {
    const before = counts[texts.length + index * 2]
    const after = counts[texts.length + index * 2 + 1]
    const delta = before - after
    const relative = before === 0 ? 0 : delta / before
    lines.push(`before ${before} → after ${after}: delta ${delta} (${fmtShare(relative)})`)
  }
  return lines.length === 0 ? 'Nothing to measure: pass texts or pairs.' : lines.join('\n')
}

/** Tool schema: kept short, because it sits in every request. */
const PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['summary', 'rules', 'hypotheses', 'sessions', 'session', 'audit', 'words', 'measure'],
      description:
        'summary: corpus totals and top sinks. rules: measured saving per prompt rule. hypotheses: the ledger with verdicts. sessions: the newest sessions scanned. session: inspect one session. audit: payback recommendations. words: top words/phrases with length filters and context. measure: count given texts and before/after pairs.',
    },
    session: {
      type: 'string',
      description: 'session: id (or prefix) of the scanned session to inspect (defaults to newest).',
    },
    limit: {
      type: 'integer',
      description: 'sessions: how many of the newest scanned sessions to list (default 10, max 25).',
    },
    texts: {
      type: 'array',
      items: { type: 'string' },
      description: 'measure: strings to price with tiktoken (max 50).',
    },
    pairs: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' } },
      description: 'measure: [before, after] rewrite pairs; the answer gives the token delta (max 50).',
    },
  },
  additionalProperties: false,
}

/**
 * Create the tool definition.
 *
 * @param {{
 *   getView: (options?: { force?: boolean }) => Promise<{ report: object, ledger: object[], section?: object | null, sectionTokens?: number | null, settings?: object }>,
 *   measure: (texts: string[]) => Promise<{ counts: number[], exact: boolean }>,
 * }} deps
 */
export function createTelegrapherTool({ getView, measure }) {
  return {
    name: 'telegrapher',
    description:
      'Measure where output and thinking tokens go in stored DSH sessions, and which telegrapher prompt rules the data supports. Read-only; results are estimates of potential savings unless marked empirical.',
    parameters: PARAMETERS,
    output: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      render(_args, value) {
        return [{ type: 'text', text: String(value?.text ?? '') }]
      },
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : 'summary'
      if (action === 'measure') {
        const texts = (Array.isArray(args?.texts) ? args.texts : [])
          .filter((text) => typeof text === 'string')
          .slice(0, 50)
        const pairs = (Array.isArray(args?.pairs) ? args.pairs : [])
          .filter(
            (pair) =>
              Array.isArray(pair) &&
              pair.length === 2 &&
              typeof pair[0] === 'string' &&
              typeof pair[1] === 'string',
          )
          .slice(0, 50)
        if (texts.length === 0 && pairs.length === 0) {
          return { text: 'Nothing to measure: pass texts or pairs.' }
        }
        const flat = [...texts]
        for (const pair of pairs) flat.push(pair[0], pair[1])
        const { counts, exact } = await measure(flat)
        return {
          text: `${formatMeasure({ texts, pairs, counts })}\n(tokenizer ${exact ? 'exact' : 'estimate'})`,
        }
      }
      const { report, ledger, section, sectionTokens, settings } = await getView({ force: false })
      const pricedTokens = section?.tokens ?? sectionTokens ?? null
      if (action === 'rules') return { text: formatRules(ledger) }
      if (action === 'hypotheses') return { text: formatHypotheses(ledger) }
      if (action === 'audit') return { text: formatAudit(report, ledger, settings) }
      if (action === 'words') {
        const limit = Number.isFinite(args?.limit) ? Number(args.limit) : 15
        return { text: formatWords(report, { limit, query: args?.session }) }
      }
      if (action === 'session') return { text: formatSessionDetail(report, args?.session) }
      if (action === 'sessions') {
        const limit = Number.isFinite(args?.limit) ? Number(args.limit) : 10
        return { text: formatSessions(report, limit) }
      }
      return { text: formatSummary(report, ledger, pricedTokens) }
    },
  }
}
