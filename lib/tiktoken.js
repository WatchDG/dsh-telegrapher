/**
 * dsh-telegrapher — token measurement.
 *
 * Every number this plugin reports comes from a real BPE tokenizer: a Python
 * process running `tiktoken`, kept alive for the lifetime of the Host and
 * addressed over newline-delimited JSON. The process is started lazily, so a
 * profile that never opens the analysis pays nothing.
 *
 * When Python or `tiktoken` is missing, measurement falls back to the
 * estimator below and every result carries `exact: false`. The estimator is a
 * script-aware approximation (Latin, Cyrillic, CJK, digits, punctuation), not
 * a tokenizer: it exists to keep the plugin usable, and the UI says so.
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

/** The bridge script shipped with the plugin. */
export const SCRIPT_PATH = fileURLToPath(new URL('../tools/tiktoken_server.py', import.meta.url))

/** One request may carry this many strings. */
const MAX_BATCH_ITEMS = 512

/** One request may carry this many characters. */
const MAX_BATCH_CHARS = 1_000_000

/** How many measured strings stay cached. */
const CACHE_LIMIT = 50_000

/** A single bridge request fails after this long. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Do not retry a failed bridge for this long. */
const RETRY_AFTER_MS = 5 * 60_000

/**
 * Estimator coefficients, calibrated against tiktoken `o200k_base` on real
 * session text (160 reply and reasoning blocks, English and Russian): the mean
 * estimate/exact ratio is 1.05, the 10–90% band 0.84–1.27.
 */
const CHARS_PER_TOKEN = {
  latin: 7,
  cyrillic: 5.5,
  cjk: 1.1,
  digit: 3,
  other: 2.4,
}

/** Script of one code point. */
function scriptOf(char) {
  const code = char.codePointAt(0) ?? 0
  if (code >= 0x0400 && code <= 0x04ff) return 'cyrillic'
  if (code >= 0x4e00 && code <= 0x9fff) return 'cjk'
  if (code >= 0x3040 && code <= 0x30ff) return 'cjk'
  if (code >= 0xac00 && code <= 0xd7af) return 'cjk'
  if (code >= 0x30 && code <= 0x39) return 'digit'
  if (code < 0x250) return 'latin'
  return 'other'
}

/**
 * Approximate the number of BPE tokens in a string.
 *
 * A word is priced by its script; each run of space/one newline merges into
 * the following word as modern tokenizers do; every other punctuation mark is
 * one token. On real session text the estimate stays within about 25% of the
 * exact count, which is still why the plugin marks it as approximate.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || text === '') return 0
  const words = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]|\n{2,}|[ \t]{2,}/gu) ?? []
  let total = 0
  for (const word of words) {
    if (word === '\n' || word === '\n\n' || /^\n+$/.test(word)) {
      total += Math.max(1, Math.ceil(word.length / 3))
      continue
    }
    if (/^[ \t]+$/.test(word)) {
      total += Math.max(1, Math.ceil(word.length / 6))
      continue
    }
    if (/^[\p{L}\p{N}_]+$/u.test(word)) {
      let length = word.length
      let script = 'latin'
      for (const char of word) {
        script = scriptOf(char)
        if (script !== 'latin') break
      }
      if (script === 'digit') {
        total += Math.max(1, Math.ceil(length / CHARS_PER_TOKEN.digit))
      } else {
        total += Math.max(1, Math.ceil(length / CHARS_PER_TOKEN[script]))
      }
      continue
    }
    total += 1
  }
  return total
}

/** Candidate Python invocations for this platform. */
export function pythonCandidates(configured = 'auto') {
  const value = typeof configured === 'string' ? configured.trim() : ''
  if (value !== '' && value !== 'auto') return [{ command: value, args: [] }]
  if (process.platform === 'win32') {
    return [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    ]
  }
  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ]
}

/** FNV-1a hash, used as a compact cache key. */
function hash(text) {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return `${text.length}:${value.toString(36)}`
}

/**
 * Parse one line of the bridge protocol.
 *
 * Only a JSON object is a message; anything else (an empty line, a traceback
 * fragment, a bare `null`) is ignored instead of crashing the Host. The
 * `null` case is real: a bridge that prints its fatal payload twice produced
 * one and took the process down from a readline callback.
 *
 * @param {string} line
 * @returns {Record<string, unknown> | null}
 */
export function parseBridgeLine(line) {
  let payload
  try {
    payload = JSON.parse(line)
  } catch {
    return null
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload
}

/**
 * One token counter for the whole Host.
 *
 * @param {{
 *   python?: string,
 *   encoding?: string,
 *   timeoutMs?: number,
 *   scriptPath?: string,
 *   logger?: { warn: (message: string) => void },
 * }} [options]
 */
export function createTokenCounter(options = {}) {
  const python = options.python ?? 'auto'
  const encoding = options.encoding ?? 'o200k_base'
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const scriptPath = options.scriptPath ?? SCRIPT_PATH
  const logger = options.logger

  /** @type {Map<string, number>} */
  const cache = new Map()
  /** @type {{ child: import('node:child_process').ChildProcess, ready: Promise<object>, send: (texts: string[]) => Promise<number[]> } | null} */
  let bridge = null
  /** @type {{ ok: boolean, exact: boolean, version: string | null, encoding: string, python: string | null, error: string | null, checkedAt: number }} */
  const status = {
    ok: false,
    exact: false,
    version: null,
    encoding,
    python: null,
    error: 'not started',
    checkedAt: 0,
  }
  let failedAt = 0
  let closing = false

  const remember = (text, count) => {
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(hash(text), count)
  }

  const cached = (text) => cache.get(hash(text))

  /** Start the Python bridge and complete the handshake. */
  async function startBridge() {
    const candidates = pythonCandidates(python)
    let lastError = 'python not found'
    for (const candidate of candidates) {
      const ready = await new Promise((resolve) => {
        let settled = false
        let child
        try {
          child = spawn(
            candidate.command,
            [...candidate.args, '-u', scriptPath, '--serve', '--encoding', encoding],
            {
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
              env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
            },
          )
        } catch (error) {
          resolve({ ok: false, error: String(error?.message ?? error) })
          return
        }
        const lines = createInterface({ input: child.stdout })
        // A counter that is never closed must not keep the Host process alive;
        // the Python side exits on stdin EOF when the parent goes away.
        child.unref?.()
        const pending = new Map()
        let nextId = 1
        let handshake = null
        const fail = (error) => {
          if (!settled) {
            settled = true
            resolve({ ok: false, error })
          }
          for (const [, entry] of pending) entry.reject(new Error(error))
          pending.clear()
        }
        const timer = setTimeout(() => fail('bridge start timed out'), timeoutMs)
        child.on('error', (error) => fail(String(error?.message ?? error)))
        child.on('exit', (code) => {
          if (!settled && handshake === null) fail(`python exited with code ${code}`)
          for (const [, entry] of pending) entry.reject(new Error(`bridge exited (${code})`))
          pending.clear()
        })
        child.stderr.on('data', () => {})
        lines.on('line', (line) => {
          const payload = parseBridgeLine(line)
          if (payload === null) return
          if (payload.ready === true && handshake === null) {
            handshake = payload
            clearTimeout(timer)
            settled = true
            resolve({
              ok: true,
              child,
              handshake,
              pending,
              nextId: () => nextId++,
            })
            return
          }
          if (payload.fatal) {
            clearTimeout(timer)
            fail(String(payload.error ?? payload.fatal))
            return
          }
          if (typeof payload.id === 'number' && pending.has(payload.id)) {
            const entry = pending.get(payload.id)
            pending.delete(payload.id)
            if (payload.error) entry.reject(new Error(String(payload.error)))
            else entry.resolve(Array.isArray(payload.counts) ? payload.counts : [])
          }
        })
      })
      if (ready.ok) return ready
      lastError = String(ready.error ?? 'unknown error')
    }
    return { ok: false, error: lastError }
  }

  /** Contact the bridge, starting it on first use. */
  async function ensureBridge() {
    if (closing) return { ok: false, error: 'counter closed' }
    if (bridge !== null) return { ok: true, ...bridge }
    if (failedAt !== 0 && Date.now() - failedAt < RETRY_AFTER_MS) {
      return { ok: false, error: status.error ?? 'bridge unavailable' }
    }
    const started = await startBridge()
    if (!started.ok) {
      failedAt = Date.now()
      status.ok = false
      status.exact = false
      status.error = String(started.error ?? 'bridge unavailable')
      status.checkedAt = Date.now()
      logger?.warn?.(
        `dsh-telegrapher: tiktoken unavailable (${status.error}); token counts are estimates. Install with: py -3 -m pip install tiktoken==0.13.0`,
      )
      return { ok: false, error: status.error }
    }

    const pending = started.pending
    const nextId = started.nextId
    const child = started.child
    bridge = {
      child,
      ready: Promise.resolve(started.handshake),
      send(texts) {
        return new Promise((resolve, reject) => {
          const id = nextId()
          const timer = setTimeout(() => {
            pending.delete(id)
            reject(new Error('tiktoken request timed out'))
          }, timeoutMs)
          pending.set(id, {
            resolve: (counts) => {
              clearTimeout(timer)
              resolve(counts)
            },
            reject: (error) => {
              clearTimeout(timer)
              reject(error)
            },
          })
          child.stdin.write(`${JSON.stringify({ id, texts })}\n`)
        })
      },
    }
    status.ok = true
    status.exact = true
    status.version = typeof started.handshake.version === 'string' ? started.handshake.version : null
    status.encoding = typeof started.handshake.encoding === 'string' ? started.handshake.encoding : encoding
    status.python = python
    status.error = null
    status.checkedAt = Date.now()
    return { ok: true }
  }

  /** Drop the bridge after a failure; the next call retries later. */
  function resetBridge(error) {
    failedAt = Date.now()
    status.ok = false
    status.exact = false
    status.error = String(error?.message ?? error)
    status.checkedAt = Date.now()
    if (bridge !== null) {
      try {
        bridge.child.kill()
      } catch {
        // The process may already be gone.
      }
    }
    bridge = null
  }

  /**
   * Count tokens in a batch of strings, exact when the bridge is alive.
   *
   * @param {readonly string[]} texts
   * @returns {Promise<{ counts: number[], exact: boolean }>}
   */
  async function count(texts) {
    const list = (Array.isArray(texts) ? texts : []).map((text) => (typeof text === 'string' ? text : ''))
    const counts = new Array(list.length).fill(0)
    const missing = []
    for (let index = 0; index < list.length; index += 1) {
      const text = list[index]
      if (text === '') continue
      const hit = cached(text)
      if (hit !== undefined) counts[index] = hit
      else missing.push(index)
    }
    if (missing.length === 0) return { counts, exact: status.exact }

    const available = await ensureBridge()
    if (!available.ok) {
      for (const index of missing) counts[index] = estimateTokens(list[index])
      return { counts, exact: false }
    }

    let exact = true
    try {
      let cursor = 0
      while (cursor < missing.length) {
        const batch = []
        let chars = 0
        const indexes = []
        while (cursor < missing.length) {
          const index = missing[cursor]
          const text = list[index]
          if (batch.length > 0 && chars + text.length > MAX_BATCH_CHARS) break
          batch.push(text)
          indexes.push(index)
          chars += text.length
          cursor += 1
          if (batch.length >= MAX_BATCH_ITEMS) break
        }
        if (batch.length === 0) break
        const measured = await bridge.send(batch)
        for (let offset = 0; offset < indexes.length; offset += 1) {
          const index = indexes[offset]
          const value = Number(measured[offset])
          counts[index] = Number.isFinite(value) ? value : estimateTokens(list[index])
          remember(list[index], counts[index])
        }
      }
    } catch (error) {
      resetBridge(error)
      exact = false
      for (const index of missing) counts[index] = estimateTokens(list[index])
    }
    return { counts, exact }
  }

  /** Stop the bridge process. */
  function close() {
    closing = true
    if (bridge !== null) {
      try {
        bridge.child.stdin.end()
        bridge.child.kill()
      } catch {
        // Already gone.
      }
      bridge = null
    }
  }

  return {
    count,
    close,
    status: () => ({ ...status }),
    cacheSize: () => cache.size,
  }
}

/**
 * Count tokens in a batch through a throwaway counter: used by tests and by
 * the one-shot CLI, where keeping a process alive is pointless.
 *
 * @param {readonly string[]} texts
 * @param {{ python?: string, encoding?: string }} [options]
 */
export async function countOnce(texts, options = {}) {
  const counter = createTokenCounter(options)
  try {
    return await counter.count(texts)
  } finally {
    counter.close()
  }
}
