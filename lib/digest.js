/**
 * dsh-telegrapher — session log to digest.
 *
 * One pass over the events a DSH session stores, producing:
 *   - accounting: usage totals, models, turns, assistant messages;
 *   - units: every visible text block and reasoning block with the context a
 *     detector needs (the tool result that preceded it, earlier text, code
 *     lines already written, the turn's commands, whether the message called
 *     tools);
 *   - calls: every tool call with its parsed arguments;
 *   - whether the telegrapher section was in the session's system prompt.
 *
 * Detection runs through the optional `onUnit`/`onCall` callbacks while the
 * context is still exact, so a detector never sees code lines written after
 * the message it inspects.
 */

import { RULES_HEADING } from './config.js'

/** Earlier text kept for repetition detection, in characters. */
const EARLIER_TEXT_LIMIT = 400_000

/** Code lines kept for reprint detection. */
const CODE_LINE_LIMIT = 30_000

/** Characters of one tool result kept for echo detection. */
const TOOL_RESULT_LIMIT = 20_000

/** Text content of a message's blocks. */
function blockText(blocks, type) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block && block.type === type && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** Parse a tool call's arguments; unparseable arguments read as `{}`. */
export function parseArguments(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const value = JSON.parse(raw)
    return value !== null && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/**
 * Build a digest of one session log.
 *
 * @param {{ session?: object, header?: object, events?: object[] }} snapshot
 * @param {{
 *   onUnit?: (unit: object) => void,
 *   onCall?: (call: object) => void,
 * }} [hooks]
 * @returns {object} digest
 */
export function buildDigest(snapshot, hooks = {}) {
  const header = snapshot?.session ?? snapshot?.header ?? {}
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []

  /** @type {object} */
  const digest = {
    id: String(header.id ?? ''),
    createdAt: Number(header.createdAt ?? 0),
    cwd: typeof header.cwd === 'string' ? header.cwd : '',
    preset: typeof header.agentPreset === 'string' ? header.agentPreset : '',
    origin: header.origin === 'subagent' ? 'subagent' : 'root',
    model: '',
    provider: '',
    telegrapherActive: false,
    systemPromptChars: 0,
    turns: 0,
    assistantMessages: 0,
    usage: { outputTokens: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    /** @type {{ kind: string, turn: number, step: number, chars: number }[]} */
    units: [],
    /** @type {object[]} */
    calls: [],
    toolCalls: {},
  }

  let earlierText = ''
  let previousToolResult = ''
  let codeLines = new Set()
  let codeLineCount = 0
  let turnCommands = []
  let turn = 0
  let step = 0
  let cwd = digest.cwd

  const rememberCodeLines = (text) => {
    if (typeof text !== 'string' || text === '') return
    for (const line of text.split('\n')) {
      const normalized = line.replace(/\s+/g, ' ').trim()
      if (normalized.length < 8 || codeLines.has(normalized)) continue
      codeLines.add(normalized)
      codeLineCount += 1
    }
    if (codeLineCount > CODE_LINE_LIMIT) {
      const trimmed = new Set()
      let kept = 0
      for (const line of codeLines) {
        if (kept >= CODE_LINE_LIMIT) break
        trimmed.add(line)
        kept += 1
      }
      codeLines = trimmed
      codeLineCount = kept
    }
  }

  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    const data = event.data ?? {}

    if (event.type === 'turn/start') {
      turn = Number(data.turn ?? turn + 1)
      turnCommands = []
      digest.turns += 1
      continue
    }
    if (event.type === 'step/start') {
      step = Number(data.step ?? step + 1)
      continue
    }
    if (event.type === 'user/message') {
      turnCommands = []
      continue
    }
    if (event.type === 'system/message') {
      const text = blockText(data.message?.content, 'text')
      if (text !== '') {
        digest.systemPromptChars += text.length
        if (text.includes(RULES_HEADING)) digest.telegrapherActive = true
      }
      continue
    }
    if (event.type === 'tool/call') {
      const name = String(data.name ?? '')
      const raw = typeof data.arguments === 'string' ? data.arguments : ''
      const args = parseArguments(raw)
      const call = {
        turn: Number(data.turn ?? turn),
        step: Number(data.step ?? step),
        name,
        args,
        raw,
        cwd,
      }
      digest.calls.push(call)
      digest.toolCalls[name] = (digest.toolCalls[name] ?? 0) + 1
      if (typeof args.command === 'string') turnCommands.push(args.command)
      if (name === 'working_directory' && typeof args.cd === 'string' && args.cd !== '') cwd = args.cd
      rememberCodeLines(typeof args.content === 'string' ? args.content : '')
      rememberCodeLines(typeof args.old_string === 'string' ? args.old_string : '')
      rememberCodeLines(typeof args.new_string === 'string' ? args.new_string : '')
      if (typeof hooks.onCall === 'function') hooks.onCall(call)
      continue
    }
    if (event.type === 'tool/result') {
      const text = blockText(data.message?.content, 'text')
      if (text !== '') previousToolResult = text.slice(-TOOL_RESULT_LIMIT)
      continue
    }
    if (event.type === 'assistant/message') {
      const message = data.message ?? {}
      const blocks = Array.isArray(message.content) ? message.content : []
      const usage = data.usage ?? {}
      if (Number.isFinite(usage.outputTokens)) {
        digest.assistantMessages += 1
        digest.usage.outputTokens += Number(usage.outputTokens) || 0
        digest.usage.inputTokens += Number(usage.inputTokens) || 0
        digest.usage.cacheReadTokens += Number(usage.cacheReadTokens) || 0
        digest.usage.cacheWriteTokens += Number(usage.cacheWriteTokens) || 0
      }
      if (message.source && typeof message.source.model === 'string') digest.model = message.source.model
      if (message.source && typeof message.source.provider === 'string') {
        digest.provider = message.source.provider
      }
      const hasToolCalls = blocks.some((block) => block && block.type === 'tool-call')
      const messageTurn = Number(data.turn ?? turn)
      const messageStep = Number(data.step ?? step)

      for (const block of blocks) {
        if (!block || typeof block.text !== 'string' || block.text.trim() === '') continue
        const kind = block.type === 'reasoning' ? 'thinking' : block.type === 'text' ? 'text' : null
        if (kind === null) continue
        const unit = {
          kind,
          text: block.text,
          turn: messageTurn,
          step: messageStep,
          context: {
            hasToolCalls,
            turnCommands: [...turnCommands],
            previousToolResult,
            earlierText,
            codeLines,
            cwd,
          },
        }
        digest.units.push({ kind, turn: messageTurn, step: messageStep, chars: block.text.length })
        if (typeof hooks.onUnit === 'function') hooks.onUnit(unit)
        earlierText += `${block.text}\n`
        if (earlierText.length > EARLIER_TEXT_LIMIT) {
          earlierText = earlierText.slice(earlierText.length - EARLIER_TEXT_LIMIT)
        }
      }
      continue
    }
  }

  digest.assistantMessages = Math.max(digest.assistantMessages, 0)
  return digest
}
