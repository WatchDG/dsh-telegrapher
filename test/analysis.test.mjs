// Analysis: scan, aggregate, attribute, compare, cache.
import test from 'node:test'
import assert from 'node:assert/strict'

import { createAnalysisService } from '../lib/analysis.js'
import { MAX_SESSION_BYTES } from '../lib/config.js'
import { buildLedger } from '../lib/hypotheses.js'
import { RULES } from '../lib/catalogue.js'
import {
  fakeSessionPersistence,
  fakeSessionQuery,
  makeSession,
  wordCounter,
} from './helpers.mjs'

const settings = (overrides = {}) => ({
  mode: 'lean',
  thinking: true,
  analysis: true,
  sessions: 10,
  encoding: 'words',
  python: 'auto',
  ...overrides,
})

function serviceFor(sessions, { overrides = {}, sizes = new Map(), persistence = true } = {}) {
  const query = fakeSessionQuery(sessions)
  const counter = wordCounter()
  const service = createAnalysisService({
    getSettings: () => settings(overrides),
    sessionQuery: query,
    sessionPersistence: persistence ? fakeSessionPersistence(sessions, sizes) : undefined,
    counter,
    now: () => 1_000_000,
  })
  return { service, query, counter }
}

const controlSessions = () => [
  makeSession({ id: 's1', createdAt: 1, outputPerMessage: 100 }),
  makeSession({ id: 's2', createdAt: 2, outputPerMessage: 100 }),
  makeSession({ id: 's3', createdAt: 3, outputPerMessage: 100 }),
]

test('report aggregates rules, mass, tools and attribution', async () => {
  const { service } = serviceFor(controlSessions())
  const report = await service.report({ force: true })
  assert.equal(report.ok, true)
  assert.equal(report.scannedSessions, 3)
  assert.equal(report.totals.assistantMessages, 18)
  assert.equal(report.totals.outputTokens, 1800)
  assert.equal(report.measure.exact, true)

  const filler = report.rules['core-filler']
  assert.equal(filler.occurrences, 18)
  assert.equal(filler.sessions, 3)
  assert.ok(filler.tokens > 0, 'filler must measure a saving')

  const anchor = report.rules['tools-edit-anchor']
  assert.equal(anchor.occurrences, 18)
  assert.ok(anchor.tokens > 0)

  assert.ok(report.mass.tool > report.mass.text)
  assert.ok(report.mass.thinking > 0)
  const shares = report.attribution
  assert.ok(Math.abs(shares.text + shares.thinking + shares.tool - 1) < 1e-9)
  assert.equal(report.tools[0].name, 'edit')
  assert.ok(report.tools[0].share > 0.5)
  assert.deepEqual(report.scope.models, { 'model-a': 3 })
})

test('an all-control corpus leaves the comparison unmeasured', async () => {
  const { service } = serviceFor(controlSessions())
  const report = await service.report({ force: true })
  assert.equal(report.comparison.output.status, 'unmeasured')
  assert.match(report.comparison.output.reason, /no session of model-a carried the rules/)
  assert.equal(report.comparison.thinking.status, 'unmeasured')
})

test('treatment sessions with lower usage support H1 and H2', async () => {
  const sessions = [
    ...controlSessions(),
    makeSession({ id: 't1', createdAt: 4, rules: true, outputPerMessage: 50, reasoningWords: 2 }),
    makeSession({ id: 't2', createdAt: 5, rules: true, outputPerMessage: 50, reasoningWords: 2 }),
    makeSession({ id: 't3', createdAt: 6, rules: true, outputPerMessage: 50, reasoningWords: 2 }),
  ]
  const { service } = serviceFor(sessions)
  const report = await service.report({ force: true })
  assert.equal(report.comparison.model, 'model-a')
  assert.equal(report.comparison.output.status, 'supported')
  assert.equal(report.comparison.output.n.treatment, 3)
  assert.equal(report.comparison.output.n.control, 3)
  assert.ok(report.comparison.output.diff < 0)
  assert.equal(report.comparison.thinking.status, 'supported')
  assert.ok(report.comparison.thinking.diff < 0)
})

test('the ledger prices rules against their own prompt line', async () => {
  const { service } = serviceFor(controlSessions())
  const report = await service.report({ force: true })
  const stats = {}
  for (const rule of RULES) {
    stats[rule.id] = {
      ...(report.rules[rule.id] ?? { occurrences: 0, sessions: 0, tokens: 0, examples: [] }),
      inputCost: 10,
    }
  }
  const ledger = buildLedger({ ...report, rules: stats }, RULES)
  const entry = ledger.find((item) => item.id === 'rule:core-filler')
  assert.equal(entry.status, 'supported')
  assert.equal(entry.inputCost, 10)
  assert.ok(entry.payback > 0)
  assert.equal(entry.exact, true)
  const anchor = ledger.find((item) => item.id === 'rule:tools-edit-anchor')
  assert.equal(anchor.status, 'supported')
  assert.equal(anchor.confidence, 'potential')
  assert.equal(ledger.filter((item) => item.kind === 'empirical').length, 2)
})

test('blank-line removal is measured as a refuted control', async () => {
  const sessions = [
    makeSession({ id: 'b1', createdAt: 1, text: '- one\n\n- two\n\n- three' }),
    makeSession({ id: 'b2', createdAt: 2, text: '- one\n\n- two\n\n- three' }),
    makeSession({ id: 'b3', createdAt: 3, text: '- one\n\n- two\n\n- three' }),
  ]
  const { service } = serviceFor(sessions)
  const report = await service.report({ force: true })
  assert.ok(report.rules['control-blank-lines'].occurrences >= 3)
  assert.equal(report.rules['control-blank-lines'].tokens, 0)
  const stats = { 'control-blank-lines': report.rules['control-blank-lines'] }
  const ledger = buildLedger({ ...report, rules: stats }, RULES)
  const entry = ledger.find((item) => item.id === 'rule:control-blank-lines')
  assert.equal(entry.status, 'refuted')
})

test('reports are cached until forced', async () => {
  const { service, query } = serviceFor(controlSessions())
  await service.report({ force: true })
  await service.report()
  assert.equal(query.state.listCalls, 1)
  await service.report({ force: true })
  assert.equal(query.state.listCalls, 2)
  service.invalidate()
  await service.report()
  assert.equal(query.state.listCalls, 3)
})

test('sessions above the size ceiling are skipped with a reason', async () => {
  const sessions = controlSessions()
  const sizes = new Map([['s1', MAX_SESSION_BYTES + 1]])
  const { service } = serviceFor(sessions, { sizes })
  const report = await service.report({ force: true })
  assert.equal(report.scannedSessions, 2)
  assert.deepEqual(report.skipped, [{ id: 's1', reason: 'larger than 24 MB' }])
})

test('a failing read is skipped, not fatal', async () => {
  const sessions = controlSessions()
  const query = {
    listSessions: async () =>
      sessions.map((snapshot) => ({ header: snapshot.session, live: false, persisted: true })),
    readSession: async (id) => {
      if (id === 's2') throw new Error('corrupt tail')
      return sessions.find((snapshot) => snapshot.session.id === id)
    },
  }
  const service = createAnalysisService({
    getSettings: () => settings(),
    sessionQuery: query,
    counter: wordCounter(),
    logger: { warn: () => {} },
  })
  const report = await service.report({ force: true })
  assert.equal(report.ok, true)
  assert.equal(report.scannedSessions, 2)
  assert.deepEqual(report.skipped, [{ id: 's2', reason: 'corrupt tail' }])
})

test('missing or disabled analysis returns a reason', async () => {
  const disabled = createAnalysisService({
    getSettings: () => settings({ analysis: false }),
    sessionQuery: fakeSessionQuery(controlSessions()),
    counter: wordCounter(),
  })
  const first = await disabled.report()
  assert.equal(first.ok, false)
  assert.match(first.reason, /disabled/)

  const missing = createAnalysisService({
    getSettings: () => settings(),
    counter: wordCounter(),
  })
  const second = await missing.report()
  assert.equal(second.ok, false)
  assert.match(second.reason, /sessionQuery/)
})

test('compareCorpus never mixes models', async () => {
  const sessions = [
    makeSession({ id: 'a1', createdAt: 1, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'a2', createdAt: 2, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'a3', createdAt: 3, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'b1', createdAt: 4, model: 'model-b', rules: true, outputPerMessage: 40 }),
    makeSession({ id: 'b2', createdAt: 5, model: 'model-b', rules: true, outputPerMessage: 40 }),
    makeSession({ id: 'b3', createdAt: 6, model: 'model-b', rules: true, outputPerMessage: 40 }),
  ]
  const { service } = serviceFor(sessions)
  const report = await service.report({ force: true })
  // The model the user works in now is preferred over an older all-control corpus.
  assert.equal(report.comparison.model, 'model-b')
  assert.equal(report.comparison.eligibleSessions, 3)
  assert.equal(report.comparison.output.status, 'unmeasured')
  assert.match(report.comparison.output.reason, /no control group/)
})

test('a model with both groups wins over a newer treated-only model', async () => {
  const sessions = [
    makeSession({ id: 'a1', createdAt: 1, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'a2', createdAt: 2, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'a3', createdAt: 3, model: 'model-a', outputPerMessage: 100 }),
    makeSession({ id: 'a4', createdAt: 4, model: 'model-a', rules: true, outputPerMessage: 60 }),
    makeSession({ id: 'a5', createdAt: 5, model: 'model-a', rules: true, outputPerMessage: 60 }),
    makeSession({ id: 'a6', createdAt: 6, model: 'model-a', rules: true, outputPerMessage: 60 }),
    makeSession({ id: 'b1', createdAt: 7, model: 'model-b', rules: true, outputPerMessage: 40 }),
  ]
  const { service } = serviceFor(sessions)
  const report = await service.report({ force: true })
  assert.equal(report.comparison.model, 'model-a')
  assert.equal(report.comparison.output.status, 'supported')
  assert.equal(report.comparison.output.n.treatment, 3)
  assert.equal(report.comparison.output.n.control, 3)
})
