// Hypothesis evaluation: thresholds, direction, bootstrap determinism.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPIRICAL_HYPOTHESES,
  MIN_SESSIONS,
  STATUS,
  bootstrapMedianDiff,
  buildLedger,
  compareGroups,
  empiricalEvidence,
  median,
  ruleEvidence,
} from '../lib/hypotheses.js'
import { RULES } from '../lib/catalogue.js'

const ruleById = (id) => RULES.find((rule) => rule.id === id)

test('median handles odd and even samples', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([]), 0)
  assert.equal(median([5]), 5)
})

test('bootstrap is deterministic for a seed', () => {
  const treatment = [10, 12, 14, 16]
  const control = [30, 32, 34, 36]
  const first = bootstrapMedianDiff(treatment, control, { seed: 7 })
  const second = bootstrapMedianDiff(treatment, control, { seed: 7 })
  assert.deepEqual(first, second)
  assert.ok(first.diff < 0)
  assert.ok(first.ci[1] < 0, 'the interval sits below zero')
  assert.equal(first.diff, -20)
  assert.ok(Math.abs(first.relative - first.diff / 33) < 1e-9)
})

test('bootstrap refuses samples below the session threshold', () => {
  assert.equal(bootstrapMedianDiff([1, 2], [3, 4, 5]), null)
})

test('lower is better for the token hypotheses', () => {
  const better = compareGroups({ treatment: [10, 11, 12], control: [30, 31, 32] })
  assert.equal(better.status, STATUS.supported)
  assert.equal(better.better, 'lower')
  assert.ok(better.diff < 0)

  const worse = compareGroups({ treatment: [30, 31, 32], control: [10, 11, 12] })
  assert.equal(worse.status, STATUS.refuted)
  assert.ok(worse.diff > 0)

  const flat = compareGroups({ treatment: [10, 10, 10], control: [10, 10, 10] })
  assert.equal(flat.status, STATUS.inconclusive)
})

test('compareGroups reports the sample size it lacked', () => {
  const result = compareGroups({ treatment: [1, 2], control: [3, 4, 5] })
  assert.equal(result.status, STATUS.unmeasured)
  assert.match(result.reason, new RegExp(`at least ${MIN_SESSIONS}`))
})

test('a measured rule needs occurrences and sessions', () => {
  const rule = ruleById('core-filler')
  const unmeasured = ruleEvidence(rule, { occurrences: 2, sessions: 1, tokens: 40 }, { scannedSessions: 5 })
  assert.equal(unmeasured.status, STATUS.unmeasured)

  const oneSession = ruleEvidence(rule, { occurrences: 10, sessions: 1, tokens: 100 }, { scannedSessions: 5 })
  assert.equal(oneSession.status, STATUS.inconclusive)
  assert.match(oneSession.reason, /needs 3/)

  const supported = ruleEvidence(rule, { occurrences: 10, sessions: 4, tokens: 100 }, { scannedSessions: 5 })
  assert.equal(supported.status, STATUS.supported)
  assert.equal(supported.perOccurrence, 10)
  assert.equal(supported.perSession, 20)

  const zero = ruleEvidence(rule, { occurrences: 10, sessions: 4, tokens: 0, inputCost: 8 }, { scannedSessions: 5 })
  assert.equal(zero.status, STATUS.refuted)
  assert.equal(zero.payback, null, 'no saving, no payback')
})

test('payback compares the saving with the prompt line', () => {
  const rule = ruleById('tools-edit-anchor')
  const entry = ruleEvidence(
    rule,
    { occurrences: 100, sessions: 5, tokens: 5000, inputCost: 10 },
    { scannedSessions: 5 },
  )
  assert.equal(entry.payback, 100)
  assert.equal(entry.confidence, 'potential')
  assert.equal(entry.channel, 'tool')
  assert.equal(entry.metric, 'tool-argument tokens')
})

test('rejected controls are refuted by measurement, not by declaration', () => {
  const control = ruleById('control-blank-lines')
  const refuted = ruleEvidence(control, { occurrences: 9, sessions: 4, tokens: 0 }, { scannedSessions: 5 })
  assert.equal(refuted.status, STATUS.refuted)
  assert.match(refuted.reason, /no saving/)
  const survived = ruleEvidence(control, { occurrences: 9, sessions: 4, tokens: 90 }, { scannedSessions: 5 })
  assert.equal(survived.status, STATUS.supported)
})

test('empirical evidence carries n, interval and method', () => {
  const comparison = compareGroups({ treatment: [1, 2, 3], control: [9, 9, 9], model: 'm' })
  const entry = empiricalEvidence(EMPIRICAL_HYPOTHESES[0], comparison)
  assert.equal(entry.kind, 'empirical')
  assert.equal(entry.id, 'H1')
  assert.equal(entry.n.treatment, 3)
  assert.equal(entry.model, 'm')
  assert.ok(Array.isArray(entry.ci))
  assert.match(entry.method, /bootstrap/)
})

test('the ledger skips guards and includes proposals', () => {
  const report = {
    scannedSessions: 3,
    rules: { 'core-filler': { occurrences: 6, sessions: 3, tokens: 60, examples: [], exact: true } },
    comparison: {
      output: compareGroups({ treatment: [1, 2, 3], control: [9, 9, 9] }),
      thinking: compareGroups({ treatment: [1, 2, 3], control: [3, 3, 3] }),
    },
    signals: [
      {
        id: 'sink:todo_write',
        channel: 'tool',
        tokens: 500,
        share: 0.2,
        claim: 'todo_write is 20% of output',
      },
    ],
  }
  const ledger = buildLedger(report, RULES)
  const ids = ledger.map((entry) => entry.id)
  assert.ok(ids.includes('rule:core-filler'))
  assert.ok(ids.includes('H1') && ids.includes('H2'))
  assert.ok(ids.includes('proposal:sink:todo_write'))
  assert.equal(ids.includes('rule:core-substance'), false, 'guards have no hypothesis')
  assert.equal(ledger.find((entry) => entry.id === 'proposal:sink:todo_write').status, STATUS.unmeasured)
})
