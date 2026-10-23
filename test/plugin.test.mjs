// Plugin wiring: prompt section, routes, tool, configuration.
import test from 'node:test'
import assert from 'node:assert/strict'

import { REPORT_PATH, SCAN_PATH, STATUS_PATH, mount } from '../lib/plugin.js'
import { RULES_HEADING } from '../lib/config.js'
import { fakeResponse, fakeSessionQuery, makeSession, wordCounter } from './helpers.mjs'

function createCtx({ rejection = undefined } = {}) {
  const state = {
    sections: [],
    routes: [],
    tools: [],
    effects: [],
    injections: [],
  }
  const base = {
    logger: { warn: () => {} },
    systemPrompt: {
      section(section) {
        state.sections.push(section)
        return () => {}
      },
      getSectionOrder: (name) => (name === 'TOOL_PWSH' ? 100 : undefined),
    },
    get: (name) => (name === 'sessionQuery' ? state.sessionQuery : undefined),
    effect(callback, label) {
      state.effects.push(label)
      return callback?.()
    },
    inject(deps, callback) {
      state.injections.push(deps)
      const child = {
        ...base,
        webServer: {
          register(route) {
            state.routes.push(route)
            return () => {}
          },
        },
        connection: {
          requestRejection: () => rejection,
        },
        tools: {
          register(tool) {
            state.tools.push(tool)
            return () => {}
          },
        },
      }
      callback(child)
      return () => {}
    },
  }
  state.ctx = base
  return state
}

const sessions = () => [
  makeSession({ id: 's1', createdAt: 1 }),
  makeSession({ id: 's2', createdAt: 2 }),
  makeSession({ id: 's3', createdAt: 3 }),
]

function setup(config = {}, options = {}) {
  const state = createCtx(options)
  state.sessionQuery = fakeSessionQuery(sessions())
  const api = mount(state.ctx, config, { createCounter: () => wordCounter() })
  return { state, api }
}

const callRoute = async (route, { method = 'GET', url = route.path } = {}) => {
  const res = fakeResponse()
  await route.handler({ method, url }, res)
  return res
}

test('lean mode registers the section after the shell tools', () => {
  const { state } = setup({})
  assert.equal(state.sections.length, 1)
  const section = state.sections[0]
  assert.equal(section.name, 'telegrapher:rules')
  assert.equal(section.order, 105)
  const text = section.text()
  assert.ok(text.startsWith(RULES_HEADING))
  assert.ok(text.includes('No filler, hedging or pleasantries'))
})

test('off mode registers no section at all', () => {
  const { state } = setup({ mode: 'off' })
  assert.equal(state.sections.length, 0)
})

test('full mode renders section headings through the live config', () => {
  const { state } = setup({ mode: 'full' })
  const text = state.sections[0].text()
  assert.ok(text.includes('\n### Core\n'))
  assert.ok(text.includes('\n### Thinking\n'))
})

test('the settings routes are registered once', () => {
  const { state } = setup({})
  const paths = state.routes.map((route) => route.path).sort()
  assert.deepEqual(paths, [REPORT_PATH, SCAN_PATH, STATUS_PATH].sort())
  for (const route of state.routes) assert.equal(route.kind, 'exact')
})

test('the status route reports config, section price and tokenizer', async () => {
  const { state } = setup({})
  const route = state.routes.find((item) => item.path === STATUS_PATH)
  const res = await callRoute(route)
  assert.equal(res.statusCode, 200)
  const payload = res.json()
  assert.equal(payload.mode, 'lean')
  assert.equal(payload.thinking, true)
  assert.equal(payload.analysis, true)
  assert.equal(payload.sessions, 20)
  assert.equal(payload.rules.active, true)
  assert.ok(payload.rules.tokens > 50, 'the section has a price')
  assert.ok(payload.rules.text.startsWith(RULES_HEADING))
  assert.equal(payload.tiktoken.exact, true)
  assert.equal(payload.tool, 'telegrapher')
})

test('the report route serves the report and the ledger', async () => {
  const { state } = setup({})
  const route = state.routes.find((item) => item.path === REPORT_PATH)
  const res = await callRoute(route)
  const payload = res.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.report.scannedSessions, 3)
  assert.ok(payload.ledger.length > 0)
  assert.ok(payload.ledger.every((entry) => typeof entry.status === 'string'))
  assert.ok(payload.report.rules['core-filler'].tokens > 0)
  assert.ok(payload.section.tokens > 0)
})

test('the scan route drops the cache and rescans', async () => {
  const { state } = setup({})
  const report = state.routes.find((item) => item.path === REPORT_PATH)
  await callRoute(report)
  assert.equal(state.sessionQuery.state.listCalls, 1)
  await callRoute(report)
  assert.equal(state.sessionQuery.state.listCalls, 1, 'cached')
  const scan = state.routes.find((item) => item.path === SCAN_PATH)
  await callRoute(scan, { method: 'POST' })
  assert.equal(state.sessionQuery.state.listCalls, 2)
})

test('a rejected browser request never reaches the handler', async () => {
  const { state } = setup({}, { rejection: 403 })
  const route = state.routes.find((item) => item.path === STATUS_PATH)
  const res = await callRoute(route)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body, '')
})

test('a wrong method is answered with 405', async () => {
  const { state } = setup({})
  const route = state.routes.find((item) => item.path === STATUS_PATH)
  const res = await callRoute(route, { method: 'POST' })
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})

test('the tool is registered and measures text on demand', async () => {
  const { state } = setup({})
  assert.equal(state.tools.length, 1)
  const tool = state.tools[0]
  assert.equal(tool.name, 'telegrapher')
  const measured = await tool.execute({ action: 'measure', texts: ['one two three'], pairs: [['four five', 'six']] })
  assert.match(measured.text, /"one two three": 3 tokens/)
  assert.match(measured.text, /before 2 → after 1: delta 1/)
  assert.match(measured.text, /tokenizer exact/)
})

test('the tool summarises the corpus and lists rules', async () => {
  const { state } = setup({})
  const tool = state.tools[0]
  const summary = await tool.execute({ action: 'summary' })
  assert.match(summary.text, /Telegrapher — 3 sessions/)
  assert.match(summary.text, /Mass: tool args/)
  assert.match(summary.text, /Prompt section: \d+ tokens per request/)
  const rules = await tool.execute({ action: 'rules' })
  assert.match(rules.text, /rule\s+tier\s+occ/)
  const hypotheses = await tool.execute({ action: 'hypotheses' })
  assert.match(hypotheses.text, /H1/)
  const audit = await tool.execute({ action: 'audit' })
  assert.match(audit.text, /Audit \(3 sessions/)
  const sessionDetail = await tool.execute({ action: 'session', session: 's3' })
  assert.match(sessionDetail.text, /Session s3/)
  const sessionsView = await tool.execute({ action: 'sessions', limit: 2 })
  assert.match(sessionsView.text, /session\s+created/)
  assert.equal(sessionsView.text.split('\n').length, 3)
})

test('the report says why it is unavailable instead of failing', async () => {
  const state = createCtx()
  state.sessionQuery = undefined
  mount(state.ctx, {}, { createCounter: () => wordCounter() })
  const route = state.routes.find((item) => item.path === REPORT_PATH)
  const res = await callRoute(route)
  const payload = res.json()
  assert.equal(payload.ok, false)
  assert.match(payload.reason, /sessionQuery/)
  assert.deepEqual(payload.ledger, [])
})
