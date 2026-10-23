// Tool output: bounded text views over the report and the ledger.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fmtShare,
  fmtTokens,
  formatAudit,
  formatHypotheses,
  formatMeasure,
  formatRules,
  formatSessionDetail,
  formatSessions,
  formatSummary,
} from '../lib/tool.js'

const report = {
  ok: true,
  scannedSessions: 3,
  requestedSessions: 3,
  scanMs: 1200,
  totals: { assistantMessages: 90, outputTokens: 50000 },
  mass: { text: 5000, thinking: 5000, tool: 40000, total: 50000 },
  attribution: { text: 0.1, thinking: 0.1, tool: 0.8 },
  tools: [
    { name: 'edit', share: 0.6, tokens: 30000, calls: 40 },
    { name: 'write', share: 0.2, tokens: 10000, calls: 10 },
  ],
  skipped: [{ id: 's1', reason: 'larger than 24 MB' }, { id: 's2', reason: 'larger than 24 MB' }],
  notes: [],
  scope: {
    sessions: [
      {
        id: 'session-1',
        createdAt: 1760000000000,
        model: 'model-a',
        messages: 30,
        outputTokens: 20000,
        thinkingTokens: 2000,
        rules: true,
      },
    ],
  },
}

const ledger = [
  {
    id: 'rule:tools-edit-anchor',
    kind: 'rule',
    rule: 'tools-edit-anchor',
    tier: 'lean',
    occurrences: 40,
    sessions: 3,
    tokens: 9000,
    perSession: 3000,
    payback: 4.5,
    status: 'supported',
    metric: 'tool-argument tokens',
    reason: 'measured',
    claim: 'wide anchors waste tokens',
  },
  {
    id: 'rule:markdown-markup',
    kind: 'rule',
    rule: 'markdown-markup',
    tier: 'lean',
    occurrences: 4,
    sessions: 1,
    tokens: 40,
    perSession: 13,
    payback: 0.4,
    status: 'inconclusive',
    metric: 'output tokens',
    reason: 'measured in 1 session; needs 3 before it counts',
    claim: 'markup costs tokens',
  },
  {
    id: 'H1',
    kind: 'empirical',
    status: 'unmeasured',
    metric: 'output tokens per assistant step',
    n: { treatment: 0, control: 3 },
    median: { treatment: 0, control: 480 },
    diff: null,
    relative: null,
    reason: 'no session of model-a carried the rules yet',
  },
]

test('counts and shares format compactly', () => {
  assert.equal(fmtTokens(950), '950')
  assert.equal(fmtTokens(1500), '1.5K')
  assert.equal(fmtTokens(1_500_000), '1.5M')
  assert.equal(fmtTokens(undefined), '—')
  assert.equal(fmtShare(0.796), '80%')
  assert.equal(fmtShare(undefined), '—')
})

test('the summary names the scan, the sinks, the hypotheses and the skips', () => {
  const text = formatSummary(report, ledger, 286)
  assert.match(text, /3 sessions, 90 steps, 50\.0K output tokens/)
  assert.match(text, /Mass: tool args 80%/)
  assert.match(text, /Top tools: edit 60% \| write 20%/)
  assert.match(text, /Rule potential \(sum, rules may overlap\): 9\.0K tokens/)
  assert.match(text, /H1 output tokens per assistant step: unmeasured/)
  assert.match(text, /Skipped: 2× larger than 24 MB/)
  assert.match(text, /Prompt section: 286 tokens/)
})

test('an unavailable report states the reason', () => {
  const text = formatSummary({ ok: false, reason: 'sessionQuery is not available' }, [])
  assert.match(text, /unavailable: sessionQuery is not available/)
  assert.match(text, /Settings/)
})

test('the rule table leads with supported rules', () => {
  const text = formatRules(ledger)
  const lines = text.split('\n')
  assert.match(lines[0], /^rule\s+tier\s+occ/)
  assert.match(lines[1], /^tools-edit-anchor/)
  assert.match(lines[2], /^markdown-markup/)
  assert.match(text, /4\.5x/)
  assert.match(text, /0\.4x/)
})

test('the ledger view puts empirical claims first', () => {
  const text = formatHypotheses(ledger, 10)
  assert.match(text.split('\n')[0], /^H1/)
  assert.match(text, /n=0\/3/)
  assert.match(text, /tools-edit-anchor/)
})

test('the sessions view is bounded', () => {
  const text = formatSessions(report, 1)
  assert.equal(text.split('\n').length, 2)
  assert.match(text, /session-1/)
  assert.match(text, /yes$/)
})

test('measure prints texts and pairs', () => {
  const text = formatMeasure({
    texts: ['one two three'],
    pairs: [['four five', 'six']],
    counts: [3, 2, 1],
  })
  assert.match(text, /"one two three": 3 tokens/)
  assert.match(text, /before 2 → after 1: delta 1 \(50%\)/)
  assert.equal(formatMeasure({}), 'Nothing to measure: pass texts or pairs.')
})

test('audit and session views report payback recommendations and per-session detail', () => {
  const audit = formatAudit(report, ledger, { mode: 'lean' })
  assert.match(audit, /Paying back \(>=1\.0x\): tools-edit-anchor \(4\.5x\)/)
  assert.match(audit, /Lean-tier rules below 1\.0x on this corpus: markdown-markup \(0\.4x\)/)

  const detail = formatSessionDetail(report, 'session-1')
  assert.match(detail, /Session session-1/)
  assert.match(detail, /Steps: 30/)
})
