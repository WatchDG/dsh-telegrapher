/**
 * dsh-telegrapher — the hypothesis ledger.
 *
 * Two kinds of evidence, kept apart on purpose:
 *
 *   - **Attributable** (`kind: 'rule'`): the rule's own rewrite applied to the
 *     replies that were actually written, priced with the tokenizer. It answers
 *     "how much would this rule have saved on the last N sessions", not "did
 *     the rule work".
 *   - **Empirical** (`kind: 'empirical'`): real usage from sessions whose
 *     system prompt carried the rules versus sessions without them. It answers
 *     "did behaviour change", and it is observational: the ledger says so, and
 *     refuses to claim a result below the sample threshold.
 *
 * A rule is only worth its prompt line if it saves more than the line costs.
 * The ledger therefore prices every rendered rule's own text and compares it
 * with the measured saving per session.
 */

/** Minimum occurrences before a rule's measurement counts. */
export const MIN_OCCURRENCES = 3

/** Minimum sessions before an empirical comparison counts. */
export const MIN_SESSIONS = 3

/** Minimum assistant messages per session for the empirical comparison. */
export const MIN_MESSAGES = 5

export const STATUS = {
  supported: 'supported',
  refuted: 'refuted',
  inconclusive: 'inconclusive',
  unmeasured: 'unmeasured',
}

/** The empirical hypotheses the corpus can test. */
export const EMPIRICAL_HYPOTHESES = [
  {
    id: 'H1',
    metric: 'output tokens per assistant step',
    claim: 'Sessions whose prompt carried the rules emit fewer output tokens per assistant step than sessions without them.',
  },
  {
    id: 'H2',
    metric: 'reasoning tokens per assistant step',
    claim: 'The thinking rules shorten reasoning per assistant step without shortening the reply.',
  },
]

/** Deterministic PRNG so a report is reproducible. */
function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Median of a numeric array. */
export function median(values) {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (list.length === 0) return 0
  const middle = Math.floor(list.length / 2)
  return list.length % 2 === 0 ? (list[middle - 1] + list[middle]) / 2 : list[middle]
}

/** Draw one bootstrap sample and return its median. */
function sampleMedian(list, random) {
  const drawn = new Array(list.length)
  for (let index = 0; index < list.length; index += 1) {
    drawn[index] = list[Math.floor(random() * list.length)]
  }
  return median(drawn)
}

/**
 * Bootstrap confidence interval for the difference of two medians.
 *
 * @param {number[]} treatment
 * @param {number[]} control
 * @param {{ iterations?: number, seed?: number, alpha?: number }} [options]
 * @returns {{ diff: number, ci: [number, number], relative: number, iterations: number } | null}
 */
export function bootstrapMedianDiff(treatment, control, options = {}) {
  const a = treatment.filter((value) => Number.isFinite(value))
  const b = control.filter((value) => Number.isFinite(value))
  if (a.length < MIN_SESSIONS || b.length < MIN_SESSIONS) return null
  const iterations = Number.isFinite(options.iterations) ? Math.max(200, options.iterations) : 2000
  const alpha = Number.isFinite(options.alpha) ? options.alpha : 0.05
  const random = mulberry32(Number.isFinite(options.seed) ? options.seed : 42)
  const treatmentMedian = median(a)
  const controlMedian = median(b)
  const diffs = new Array(iterations)
  for (let index = 0; index < iterations; index += 1) {
    diffs[index] = sampleMedian(a, random) - sampleMedian(b, random)
  }
  diffs.sort((x, y) => x - y)
  const low = diffs[Math.floor((alpha / 2) * iterations)]
  const high = diffs[Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations) - 1)]
  return {
    diff: treatmentMedian - controlMedian,
    ci: [low, high],
    relative: controlMedian === 0 ? 0 : (treatmentMedian - controlMedian) / controlMedian,
    iterations,
  }
}

/**
 * Compare two groups of session metrics.
 *
 * `better: 'lower'` states the direction of the claim: fewer tokens is the
 * improvement, so a confidence interval below zero supports the hypothesis.
 *
 * @param {{ treatment: number[], control: number[], model?: string, better?: 'lower' | 'higher' }} input
 * @returns {object} comparison with a status
 */
export function compareGroups({ treatment, control, model = '', better = 'lower' }) {
  const test = bootstrapMedianDiff(treatment, control)
  const cleanTreatment = treatment.filter((value) => Number.isFinite(value))
  const cleanControl = control.filter((value) => Number.isFinite(value))
  const base = {
    model,
    better,
    n: { treatment: cleanTreatment.length, control: cleanControl.length },
    median: { treatment: median(cleanTreatment), control: median(cleanControl) },
    diff: null,
    ci: null,
    relative: null,
    status: STATUS.unmeasured,
    reason: '',
  }
  if (test === null) {
    base.reason = `needs at least ${MIN_SESSIONS} sessions per group`
    return base
  }
  Object.assign(base, { diff: test.diff, ci: test.ci, relative: test.relative })
  const improvement = better === 'lower' ? -test.relative : test.relative
  const supported = better === 'lower' ? test.ci[1] < 0 : test.ci[0] > 0
  const worse = better === 'lower' ? test.ci[0] > 0 : test.ci[1] < 0
  if (supported && improvement >= 0.05) {
    base.status = STATUS.supported
    base.reason = `the 95% interval of the difference excludes zero in the expected direction (${Math.round(improvement * 100)}% better)`
  } else if (worse && improvement <= -0.05) {
    base.status = STATUS.refuted
    base.reason = `the 95% interval of the difference excludes zero in the opposite direction (${Math.round(-improvement * 100)}% worse)`
  } else {
    base.status = STATUS.inconclusive
    base.reason = 'the 95% interval of the difference spans zero'
  }
  return base
}

/**
 * Turn one rule's measured statistics into a ledger entry.
 *
 * @param {import('./catalogue.js').Rule} rule
 * @param {{
 *   occurrences: number,
 *   sessions: number,
 *   tokens: number,
 *   examples?: object[],
 *   exact?: boolean,
 *   inputCost?: number,
 * }} stats
 * @param {{ scannedSessions: number }} context
 * @returns {object}
 */
export function ruleEvidence(rule, stats, context) {
  const occurrences = Math.max(0, Number(stats.occurrences ?? 0))
  const sessions = Math.max(0, Number(stats.sessions ?? 0))
  const tokens = Number.isFinite(stats.tokens) ? stats.tokens : 0
  const perOccurrence = occurrences === 0 ? 0 : tokens / occurrences
  const scanned = Math.max(1, Number(context.scannedSessions ?? 1))
  const perSession = tokens / scanned
  const inputCost = Number.isFinite(stats.inputCost) ? stats.inputCost : null
  const payback = inputCost !== null && inputCost > 0 && perSession > 0 ? perSession / inputCost : null

  let status = STATUS.unmeasured
  let reason = 'not enough occurrences in the scanned corpus'

  if (rule.status === 'rejected') {
    if (sessions >= MIN_SESSIONS || occurrences >= MIN_OCCURRENCES) {
      if (Math.abs(perOccurrence) < 1) {
        status = STATUS.refuted
        reason = `the move saves ${perOccurrence.toFixed(1)} tokens per occurrence — measured as no saving`
      } else {
        status = STATUS.supported
        reason = `the move saves ${perOccurrence.toFixed(1)} tokens per occurrence`
      }
    }
  } else if (occurrences >= MIN_OCCURRENCES && sessions >= 1) {
    if (sessions < MIN_SESSIONS) {
      status = STATUS.inconclusive
      reason = `measured in ${sessions} session${sessions === 1 ? '' : 's'}; needs ${MIN_SESSIONS} before it counts`
    } else if (perOccurrence >= 1 && tokens >= 20) {
      status = STATUS.supported
      reason = `${perOccurrence.toFixed(1)} tokens per occurrence over ${sessions} sessions`
    } else if (perOccurrence <= 0) {
      status = STATUS.refuted
      reason = 'the rewrite measured no saving on the occurrences found'
    } else {
      status = STATUS.inconclusive
      reason = `${perOccurrence.toFixed(1)} tokens per occurrence is below the support threshold`
    }
  }

  return {
    id: `rule:${rule.id}`,
    kind: 'rule',
    rule: rule.id,
    claim: rule.claim,
    tier: rule.tier,
    channel: rule.channel,
    confidence: rule.confidence,
    metric:
      rule.channel === 'thinking'
        ? 'thinking tokens'
        : rule.channel === 'tool'
          ? 'tool-argument tokens'
          : 'output tokens',
    method: 'the rule rewrite applied to the replies that were actually written, priced with tiktoken',
    occurrences,
    sessions,
    tokens,
    perOccurrence,
    perSession,
    inputCost,
    payback,
    exact: stats.exact !== false,
    status,
    reason,
    examples: Array.isArray(stats.examples) ? stats.examples.slice(0, 3) : [],
  }
}

/**
 * Turn an empirical comparison into a ledger entry.
 *
 * @param {{ id: string, claim: string, metric: string }} hypothesis
 * @param {object} comparison
 * @returns {object}
 */
export function empiricalEvidence(hypothesis, comparison) {
  return {
    id: hypothesis.id,
    kind: 'empirical',
    rule: null,
    claim: hypothesis.claim,
    tier: null,
    channel: 'output',
    confidence: 'observational',
    metric: hypothesis.metric,
    method:
      'median per-step usage of sessions whose system prompt carried the section versus sessions without it; 95% bootstrap interval, newest sessions of one model',
    n: comparison.n,
    diff: comparison.diff,
    ci: comparison.ci,
    relative: comparison.relative,
    median: comparison.median,
    model: comparison.model,
    status: comparison.status,
    reason: comparison.reason,
    examples: [],
  }
}

/** A proposal the corpus suggests but no rule measures yet. */
export function proposal(signal) {
  return {
    id: `proposal:${signal.id}`,
    kind: 'proposal',
    rule: null,
    claim: signal.claim,
    tier: null,
    channel: signal.channel,
    confidence: 'observational',
    metric: 'output tokens',
    method: 'share of measured output attributed to one sink; no rule covers it yet',
    tokens: signal.tokens,
    share: signal.share,
    status: STATUS.unmeasured,
    reason: 'no rule in the catalogue addresses this sink',
    examples: [],
  }
}

/**
 * Build the whole ledger from a measured report.
 *
 * @param {{ rules: Record<string, object>, comparison: object|null, signals: object[], scannedSessions: number }} report
 * @param {import('./catalogue.js').Rule[]} rules
 * @returns {object[]}
 */
export function buildLedger(report, rules) {
  const entries = []
  for (const rule of rules) {
    if (rule.detectors.length === 0 && rule.status !== 'rejected') continue
    const stats = report.rules?.[rule.id] ?? { occurrences: 0, sessions: 0, tokens: 0 }
    entries.push(ruleEvidence(rule, stats, { scannedSessions: report.scannedSessions }))
  }
  if (report.comparison?.output) {
    entries.push(empiricalEvidence(EMPIRICAL_HYPOTHESES[0], report.comparison.output))
  }
  if (report.comparison?.thinking) {
    entries.push(empiricalEvidence(EMPIRICAL_HYPOTHESES[1], report.comparison.thinking))
  }
  for (const signal of report.signals ?? []) entries.push(proposal(signal))
  return entries
}
