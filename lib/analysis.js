/**
 * dsh-telegrapher — session analysis.
 *
 * The pipeline, once per report:
 *
 *   1. list stored sessions, take the newest N that fit the size bound;
 *   2. read each log through `sessionQuery.readSession` and digest it;
 *   3. run every detector whose channel the digest can feed;
 *   4. price every rewrite and every unit — replies, reasoning, tool
 *      arguments — with tiktoken in one batch;
 *   5. aggregate per rule, per channel, per tool;
 *   6. compare sessions that carried the rules with sessions that did not.
 *
 * Nothing here guesses a number: a detector either produced a rewrite the
 * rule really asks for, or it produced nothing.
 */

import { RULES, RULES_BY_ID } from './catalogue.js'
import { buildDigest } from './digest.js'
import { DETECTORS } from './detect.js'
import { MAX_SESSION_BYTES } from './config.js'
import { MIN_MESSAGES, compareGroups } from './hypotheses.js'
import { estimateTokens } from './tiktoken.js'

/** A report stays cached for this long. */
export const REPORT_TTL_MS = 5 * 60_000

/** Tools whose argument cost the catalogue already targets with a rule. */
const COVERED_TOOLS = new Set(['edit', 'write', 'pwsh', 'bash', 'shell', 'exec', 'run'])

/** Detector id → the rule that owns it. */
const RULE_BY_DETECTOR = new Map()
for (const rule of RULES) {
  for (const detector of rule.detectors) RULE_BY_DETECTOR.set(detector, rule.id)
}

/** Run every unit-scope detector that matches the unit's channel. */
function runUnitDetectors(detectors, unit, errors) {
  const hits = []
  for (const detector of detectors) {
    if (detector.scope !== 'unit' || detector.kind !== unit.kind) continue
    let result
    try {
      result = detector.apply(unit)
    } catch (error) {
      errors.push({ detector: detector.id, error: String(error?.message ?? error) })
      continue
    }
    if (!result) continue
    for (const hit of Array.isArray(result) ? result : [result]) {
      if (!hit || typeof hit.before !== 'string' || typeof hit.after !== 'string') continue
      hits.push({ ...hit, detector: detector.id, kind: unit.kind })
    }
  }
  return hits
}

/** Run every session-scope detector. */
function runSessionDetectors(detectors, session, errors) {
  const hits = []
  for (const detector of detectors) {
    if (detector.scope !== 'session') continue
    let result
    try {
      result = detector.apply(session)
    } catch (error) {
      errors.push({ detector: detector.id, error: String(error?.message ?? error) })
      continue
    }
    if (!result) continue
    for (const hit of Array.isArray(result) ? result : [result]) {
      if (!hit || typeof hit.before !== 'string' || typeof hit.after !== 'string') continue
      hits.push({ ...hit, detector: detector.id, kind: detector.kind })
    }
  }
  return hits
}

/** Incremental de-duplicated string index for one measurement batch. */
function createStringPool() {
  const list = []
  const index = new Map()
  return {
    add(text) {
      const value = typeof text === 'string' ? text : ''
      const existing = index.get(value)
      if (existing !== undefined) return existing
      const position = list.length
      index.set(value, position)
      list.push(value)
      return position
    },
    values: () => list,
  }
}

/**
 * Create the analysis service used by the plugin routes and the agent tool.
 *
 * @param {{
 *   getSettings: () => object,
 *   sessionQuery?: object,
 *   sessionPersistence?: object,
 *   getSessionQuery?: () => object | undefined,
 *   getSessionPersistence?: () => object | undefined,
 *   counter: { count: (texts: string[]) => Promise<{counts: number[], exact: boolean}>, status: () => object },
 *   logger?: { warn: (message: string) => void },
 *   now?: () => number,
 *   readSessionTimeoutMs?: number,
 * }} options
 */
export function createAnalysisService(options) {
  const getSettings = options.getSettings
  const getSessionQuery =
    typeof options.getSessionQuery === 'function'
      ? options.getSessionQuery
      : () => options.sessionQuery
  const getSessionPersistence =
    typeof options.getSessionPersistence === 'function'
      ? options.getSessionPersistence
      : () => options.sessionPersistence
  const counter = options.counter
  const logger = options.logger
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const readTimeoutMs = Number.isFinite(options.readSessionTimeoutMs)
    ? options.readSessionTimeoutMs
    : 60_000

  let cached = null
  let cachedAt = 0
  let inFlight = null

  const unavailable = (reason) => ({
    ok: false,
    reason,
    generatedAt: now(),
    scannedSessions: 0,
    requestedSessions: 0,
    rules: {},
    signals: [],
    comparison: null,
    measure: { ...counter.status() },
    notes: [],
    errors: [],
  })

  /** Ask the persistence layer for sizes, when it is available. */
  async function snapshotsById(sessionPersistence) {
    if (!sessionPersistence || typeof sessionPersistence.list !== 'function') return null
    try {
      const snapshots = await sessionPersistence.list()
      const map = new Map()
      for (const snapshot of snapshots) {
        const id = snapshot?.header?.id
        if (typeof id === 'string') map.set(id, snapshot)
      }
      return map
    } catch {
      return null
    }
  }

  /** Read one session with a timeout; a stalled backend must not stall the page. */
  function readWithTimeout(sessionQuery, id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`read timed out after ${readTimeoutMs} ms`)),
        readTimeoutMs,
      )
      Promise.resolve()
        .then(() => sessionQuery.readSession(id))
        .then(
          (value) => {
            clearTimeout(timer)
            resolve(value)
          },
          (error) => {
            clearTimeout(timer)
            reject(error)
          },
        )
    })
  }

  /** Read one session and collect its digest, units, texts, calls and hits. */
  async function scanSession(sessionQuery, record, detectors, errors) {
    const id = record?.header?.id
    if (typeof id !== 'string' || id === '') throw new Error('session record without an id')
    const snapshot = await readWithTimeout(sessionQuery, id)
    /** @type {{kind: string, text: string}[]} */
    const units = []
    /** @type {string[]} */
    const texts = []
    /** @type {object[]} */
    const hits = []
    const digest = buildDigest(snapshot, {
      onUnit(unit) {
        units.push({ kind: unit.kind, text: unit.text })
        if (unit.kind === 'text') texts.push(unit.text)
        for (const hit of runUnitDetectors(detectors, unit, errors)) hits.push(hit)
      },
      onCall(call) {
        for (const hit of runUnitDetectors(
          detectors,
          { kind: 'tool', call, context: { cwd: call.cwd } },
          errors,
        )) {
          hits.push(hit)
        }
      },
    })
    for (const hit of runSessionDetectors(detectors, { calls: digest.calls, texts, cwd: digest.cwd }, errors)) {
      hits.push(hit)
    }
    for (const hit of hits) hit.session = digest.id
    return { digest, units, hits }
  }

  /** Run one scan and build the report. */
  async function scan() {
    const startedAt = now()
    const sessionQuery = getSessionQuery()
    if (
      !sessionQuery ||
      typeof sessionQuery.listSessions !== 'function' ||
      typeof sessionQuery.readSession !== 'function'
    ) {
      return unavailable('sessionQuery is not available on this Host')
    }
    const settings = getSettings()
    const limit = Math.max(1, Number(settings.sessions) || 1)

    /** @type {object[]} */
    let records
    try {
      records = await sessionQuery.listSessions()
    } catch (error) {
      return unavailable(`session listing failed: ${String(error?.message ?? error)}`)
    }
    const ordered = [...records]
      .filter((record) => record?.header?.id)
      .sort((a, b) => Number(b.header.createdAt ?? 0) - Number(a.header.createdAt ?? 0))
    const sizes = await snapshotsById(getSessionPersistence())

    const selected = []
    const skipped = []
    for (const record of ordered) {
      if (selected.length >= limit) break
      const id = record.header.id
      const snapshot = sizes?.get(id)
      if (snapshot?.formatStatus === 'migration-required') {
        skipped.push({ id, reason: 'older session format' })
        continue
      }
      if (snapshot && Number.isFinite(snapshot.sizeBytes) && snapshot.sizeBytes > MAX_SESSION_BYTES) {
        skipped.push({ id, reason: `larger than ${Math.round(MAX_SESSION_BYTES / 1024 / 1024)} MB` })
        continue
      }
      selected.push(record)
    }

    const detectors = DETECTORS.filter((detector) => RULE_BY_DETECTOR.has(detector.id))
    const errors = []
    const sessions = []
    for (const record of selected) {
      try {
        sessions.push(await scanSession(sessionQuery, record, detectors, errors))
      } catch (error) {
        skipped.push({ id: record.header.id, reason: String(error?.message ?? error) })
        logger?.warn?.(
          `dsh-telegrapher: skipped ${record.header.id}: ${String(error?.message ?? error)}`,
        )
      }
    }

    // ---- price every measured string once --------------------------------
    const pool = createStringPool()
    for (const session of sessions) {
      session.hitIndexes = session.hits.map((hit) => ({
        before: pool.add(hit.before),
        after: pool.add(hit.after),
      }))
      session.unitIndexes = session.units.map((unit) => pool.add(unit.text))
      session.callIndexes = session.digest.calls.map((call) => pool.add(call.raw))
    }
    const measured = await counter.count(pool.values())
    const counts = measured.counts

    // ---- aggregate per rule ----------------------------------------------
    /** @type {Record<string, { occurrences: number, sessions: Set<string>, tokens: number, examples: object[], exact: boolean }>} */
    const rules = {}
    for (const session of sessions) {
      for (let index = 0; index < session.hits.length; index += 1) {
        const hit = session.hits[index]
        const ruleId = RULE_BY_DETECTOR.get(hit.detector)
        if (ruleId === undefined) continue
        const before = counts[session.hitIndexes[index].before] ?? 0
        const after = counts[session.hitIndexes[index].after] ?? 0
        const units = Number.isFinite(hit.units) ? hit.units : 1
        const delta = (before - after) * units
        const entry = rules[ruleId] ?? {
          occurrences: 0,
          sessions: new Set(),
          tokens: 0,
          examples: [],
          exact: true,
        }
        entry.occurrences += 1
        entry.tokens += delta
        entry.sessions.add(hit.session)
        entry.exact = entry.exact && measured.exact
        for (const match of hit.matches ?? []) {
          if (entry.examples.length < 3 && match?.snippet) {
            entry.examples.push({
              note: String(match.note ?? ''),
              snippet: String(match.snippet).slice(0, 160),
            })
          }
        }
        rules[ruleId] = entry
      }
    }

    // ---- mass, per-session stats, per-tool totals ------------------------
    let textMass = 0
    let thinkingMass = 0
    let toolMass = 0
    const toolMassByName = new Map()
    for (const session of sessions) {
      const digest = session.digest
      let textTokens = 0
      let thinkingTokens = 0
      for (let index = 0; index < session.units.length; index += 1) {
        const unit = session.units[index]
        const tokens = counts[session.unitIndexes[index]] ?? 0
        if (unit.kind === 'thinking') thinkingTokens += tokens
        else textTokens += tokens
      }
      let toolTokens = 0
      for (let index = 0; index < digest.calls.length; index += 1) {
        const call = digest.calls[index]
        const tokens = counts[session.callIndexes[index]] ?? 0
        toolTokens += tokens
        const previous = toolMassByName.get(call.name) ?? { tokens: 0, calls: 0 }
        toolMassByName.set(call.name, { tokens: previous.tokens + tokens, calls: previous.calls + 1 })
      }
      textMass += textTokens
      thinkingMass += thinkingTokens
      toolMass += toolTokens
      const messages = Math.max(1, digest.assistantMessages)
      digest.stats = {
        textTokens,
        thinkingTokens,
        toolTokens,
        outputTokensPerMessage: digest.usage.outputTokens / messages,
        reasoningTokensPerMessage: thinkingTokens / messages,
        textTokensPerMessage: textTokens / messages,
      }
    }

    const massTotal = textMass + thinkingMass + toolMass
    const share = (value) => (massTotal === 0 ? 0 : value / massTotal)

    const totals = sessions.reduce(
      (sum, { digest }) => ({
        outputTokens: sum.outputTokens + digest.usage.outputTokens,
        inputTokens: sum.inputTokens + digest.usage.inputTokens,
        cacheReadTokens: sum.cacheReadTokens + digest.usage.cacheReadTokens,
        cacheWriteTokens: sum.cacheWriteTokens + digest.usage.cacheWriteTokens,
        assistantMessages: sum.assistantMessages + digest.assistantMessages,
        turns: sum.turns + digest.turns,
      }),
      {
        outputTokens: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        assistantMessages: 0,
        turns: 0,
      },
    )

    const models = {}
    const presets = {}
    for (const { digest } of sessions) {
      const model = digest.model || 'unknown'
      models[model] = (models[model] ?? 0) + 1
      const preset = digest.preset || 'unknown'
      presets[preset] = (presets[preset] ?? 0) + 1
    }

    const comparison = compareCorpus(sessions.map((session) => session.digest))

    const rulesView = {}
    for (const [ruleId, entry] of Object.entries(rules)) {
      rulesView[ruleId] = {
        occurrences: entry.occurrences,
        sessions: entry.sessions.size,
        tokens: Math.round(entry.tokens),
        examples: entry.examples,
        exact: entry.exact,
      }
    }

    const tools = [...toolMassByName.entries()]
      .map(([name, value]) => ({
        name,
        tokens: value.tokens,
        calls: value.calls,
        share: share(value.tokens),
      }))
      .sort((a, b) => b.tokens - a.tokens)

    const signals = []
    for (const tool of tools) {
      if (tool.share < 0.05) continue
      if (COVERED_TOOLS.has(tool.name)) continue
      signals.push({
        id: `sink:${tool.name}`,
        channel: 'tool',
        tokens: tool.tokens,
        share: tool.share,
        claim: `\`${tool.name}\` arguments are ${Math.round(tool.share * 100)}% of measured output tokens; no rule covers this sink yet.`,
      })
      if (signals.length >= 3) break
    }

    const notes = [
      'Attribution allocates recorded output tokens by the BPE mass of reply text, reasoning and tool arguments.',
      'Reasoning is measured from the stored reasoning blocks; the recorded usage has no separate reasoning-token field.',
      'Rule savings price the rewrite on replies that were actually written; they are potential, not a controlled experiment.',
    ]
    if (!measured.exact) {
      notes.unshift(
        'Token counts are estimates: the tiktoken bridge is unavailable. Install it with `py -3 -m pip install tiktoken==0.13.0`.',
      )
    }

    return {
      ok: true,
      generatedAt: now(),
      scanMs: now() - startedAt,
      requestedSessions: limit,
      scannedSessions: sessions.length,
      skipped,
      errors,
      measure: { ...counter.status(), exact: measured.exact },
      scope: {
        models,
        presets,
        sessions: sessions.map(({ digest }) => ({
          id: digest.id,
          createdAt: digest.createdAt,
          model: digest.model,
          preset: digest.preset,
          rules: digest.telegrapherActive,
          messages: digest.assistantMessages,
          outputTokens: digest.usage.outputTokens,
          thinkingTokens: Math.round(digest.stats.thinkingTokens),
          textTokens: Math.round(digest.stats.textTokens),
        })),
      },
      totals,
      mass: { text: textMass, thinking: thinkingMass, tool: toolMass, total: massTotal },
      attribution: {
        text: share(textMass),
        thinking: share(thinkingMass),
        tool: share(toolMass),
        outputTokens: {
          text: Math.round(share(textMass) * totals.outputTokens),
          thinking: Math.round(share(thinkingMass) * totals.outputTokens),
          tool: Math.round(share(toolMass) * totals.outputTokens),
        },
      },
      tools,
      rules: rulesView,
      comparison,
      signals,
      notes,
    }
  }

  /** Public report with caching, so a page reload does not rescan. */
  async function report({ force = false } = {}) {
    const settings = getSettings()
    if (settings.analysis === false) {
      return unavailable('analysis is disabled in the plugin configuration')
    }
    const stamp = now()
    if (!force && cached !== null && stamp - cachedAt < REPORT_TTL_MS) return cached
    if (inFlight !== null) return inFlight
    inFlight = scan()
      .then((result) => {
        if (result.ok) {
          cached = result
          cachedAt = now()
        }
        return result
      })
      .catch((error) => {
        logger?.warn?.(`dsh-telegrapher: scan failed: ${String(error?.message ?? error)}`)
        return unavailable(`scan failed: ${String(error?.message ?? error)}`)
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    report,
    measure: (texts) => counter.count(texts),
    estimate: estimateTokens,
    invalidate() {
      cached = null
      cachedAt = 0
    },
    cacheInfo: () => ({
      cachedAt,
      age: cached === null ? null : now() - cachedAt,
      scanMs: cached?.scanMs ?? null,
      scannedSessions: cached?.scannedSessions ?? 0,
      errors: cached?.errors?.length ?? 0,
    }),
  }
}

/**
 * Compare per-step usage between sessions with and without the rules.
 *
 * Only one model is compared at a time: a corpus that mixes models cannot
 * separate the rules from the model. Subagent sessions stay out of the
 * comparison because their prompts are composed differently.
 *
 * @param {object[]} digests
 * @returns {object}
 */
export function compareCorpus(digests) {
  const eligible = digests.filter(
    (digest) =>
      digest.origin !== 'subagent' &&
      digest.assistantMessages >= MIN_MESSAGES &&
      digest.model !== '' &&
      digest.stats !== undefined,
  )
  const byModel = new Map()
  for (const digest of eligible) {
    const group = byModel.get(digest.model) ?? []
    group.push(digest)
    byModel.set(digest.model, group)
  }
  // Prefer a model with both groups; then the model that carries the rules
  // (the user's current work); then the largest corpus.
  const candidates = [...byModel].map(([name, group]) => {
    const treatment = group.filter((digest) => digest.telegrapherActive).length
    const control = group.length - treatment
    return {
      model: name,
      group,
      treatment,
      control,
      score: Math.min(treatment, control),
      newest: Math.max(...group.map((digest) => Number(digest.createdAt) || 0)),
    }
  })
  const both = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.group.length - a.group.length)
  const treated = candidates
    .filter((candidate) => candidate.treatment > 0)
    .sort((a, b) => b.newest - a.newest)
  const largest = [...candidates].sort((a, b) => b.group.length - a.group.length)
  const best = both[0] ?? treated[0] ?? largest[0] ?? null
  const model = best?.model ?? ''

  const group = best?.group ?? []
  const treatment = group.filter((digest) => digest.telegrapherActive)
  const control = group.filter((digest) => !digest.telegrapherActive)

  const reason = () => {
    if (model === '') return 'no session had enough assistant messages to compare'
    if (treatment.length === 0) return `no session of ${model} carried the rules yet`
    if (control.length === 0) return `every ${model} session carried the rules; no control group`
    return `needs at least 3 sessions per group and ${MIN_MESSAGES} assistant messages each`
  }

  const output = compareGroups({
    treatment: treatment.map((digest) => digest.stats.outputTokensPerMessage),
    control: control.map((digest) => digest.stats.outputTokensPerMessage),
    model,
  })
  const thinking = compareGroups({
    treatment: treatment.map((digest) => digest.stats.reasoningTokensPerMessage),
    control: control.map((digest) => digest.stats.reasoningTokensPerMessage),
    model,
  })
  for (const entry of [output, thinking]) {
    if (entry.status === 'unmeasured') entry.reason = reason()
  }
  return { output, thinking, model, eligibleSessions: group.length }
}
