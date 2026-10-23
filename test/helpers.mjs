/**
 * Test fixtures: synthetic DSH sessions with the event shapes the real store
 * persists, and a deterministic tokenizer that prices one word as one token.
 */

import { RULES_HEADING } from '../lib/config.js'

/** Deterministic tokenizer: one token per whitespace-separated word. */
export function wordCounter() {
  return {
    count: async (texts) => ({
      counts: texts.map((text) => (typeof text === 'string' && text.trim() !== '' ? text.trim().split(/\s+/).length : 0)),
      exact: true,
    }),
    status: () => ({
      ok: true,
      exact: true,
      version: 'test',
      encoding: 'words',
      python: 'test',
      error: null,
      checkedAt: 0,
    }),
    close() {},
    cacheSize: () => 0,
  }
}

/** A wide edit: seven lines, one changed. */
export function wideEdit(step) {
  const oldLines = ['export function build() {', '  const one = 1', '  const two = 2', '  const three = 3', '  const four = 4', '  return one', '}']
  const newLines = [...oldLines]
  newLines[3] = '  const three = 33'
  return {
    name: 'edit',
    args: { file_path: `src/file-${step}.ts`, old_string: oldLines.join('\n'), new_string: newLines.join('\n') },
  }
}

/**
 * Build one synthetic session snapshot.
 *
 * @param {{
 *   id: string,
 *   createdAt: number,
 *   model?: string,
 *   rules?: boolean,
 *   messages?: number,
 *   outputPerMessage?: number,
 *   reasoningWords?: number,
 *   text?: string,
 *   origin?: 'subagent',
 * }} options
 */
export function makeSession(options) {
  const {
    id,
    createdAt,
    model = 'model-a',
    rules = false,
    messages = 6,
    outputPerMessage = 100,
    reasoningWords = 4,
    text = "Sure! I'd be happy to help. The token count is stable.",
    origin,
  } = options
  const events = []
  let seq = 1
  const push = (type, data) => {
    events.push({ type, seq: seq++, time: createdAt + seq, data })
  }
  if (rules) {
    push('system/message', {
      turn: 0,
      step: 0,
      message: {
        role: 'system',
        source: { kind: 'system-prompt' },
        content: [{ type: 'text', text: `diagnostics\n${RULES_HEADING}\n- rule\n` }],
      },
    })
  }
  push('turn/start', { turn: 1 })
  for (let index = 0; index < messages; index += 1) {
    const step = index + 1
    push('step/start', { turn: 1, step })
    push('assistant/message', {
      turn: 1,
      step,
      message: {
        role: 'assistant',
        source: { kind: 'model', provider: 'provider-a', model },
        content: [
          { type: 'reasoning', text: Array.from({ length: reasoningWords }, () => 'reason').join(' ') },
          { type: 'text', text },
          { type: 'tool-call', id: `call-${step}`, name: 'edit', arguments: JSON.stringify(wideEdit(step).args) },
        ],
      },
      usage: { inputTokens: 10, outputTokens: outputPerMessage, cacheReadTokens: 0 },
      stream: [],
    })
    const edit = wideEdit(step)
    push('tool/call', { turn: 1, step, callId: `call-${step}`, name: 'edit', arguments: JSON.stringify(edit.args) })
    push('tool/result', {
      turn: 1,
      step,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId: `call-${step}` },
        content: [{ type: 'text', text: 'ok' }],
      },
    })
    push('step/end', { turn: 1, step })
  }
  push('turn/end', { turn: 1, reason: { kind: 'completed' } })

  const header = {
    version: 4,
    id,
    createdAt,
    cwd: 'F:\\repo',
    isSeeded: false,
    ...(origin ? { origin } : {}),
  }
  return { session: header, inheritedEventCount: 0, events }
}

/**
 * Fake `sessionQuery`: records what a real one stores and counts reads.
 *
 * @param {object[]} sessions snapshots from `makeSession`
 * @param {{ sizes?: Map<string, number> }} [options]
 */
export function fakeSessionQuery(sessions, options = {}) {
  const byId = new Map(sessions.map((snapshot) => [snapshot.session.id, snapshot]))
  const state = { listCalls: 0, readCalls: 0 }
  return {
    state,
    listSessions: async () => {
      state.listCalls += 1
      return sessions.map((snapshot) => ({
        header: snapshot.session,
        live: false,
        persisted: true,
        formatStatus: 'current',
      }))
    },
    readSession: async (id) => {
      state.readCalls += 1
      const snapshot = byId.get(id)
      if (!snapshot) throw new Error(`unknown session ${id}`)
      return snapshot
    },
    sizes: options.sizes,
  }
}

/** Fake `sessionPersistence` exposing sizes and formats only. */
export function fakeSessionPersistence(sessions, sizes = new Map()) {
  return {
    list: async () =>
      sessions.map((snapshot) => ({
        header: snapshot.session,
        revision: 1,
        eventCount: snapshot.events.length,
        sizeBytes: sizes.get(snapshot.session.id) ?? 1024,
        formatStatus: 'current',
      })),
  }
}

/** A response object good enough for the route handlers. */
export function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code
      Object.assign(this.headers, headers ?? {})
    },
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      if (body !== undefined) this.body = String(body)
    },
    json() {
      return JSON.parse(this.body)
    },
  }
}
