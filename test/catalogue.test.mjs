// Rule catalogue and prompt-section compilation.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DETECTOR_IDS,
  RENDERED,
  RULES,
  RULES_BY_ID,
  SECTIONS,
} from '../lib/catalogue.js'
import { DETECTORS_BY_ID } from '../lib/detect.js'
import { RULES_HEADING, activeRules, rulesOrder, rulesText } from '../lib/rules.js'

const lean = { mode: 'lean', thinking: true }
const full = { mode: 'full', thinking: true }
const noThinking = { mode: 'full', thinking: false }

test('rule ids are unique and sections are declared', () => {
  const ids = new Set()
  for (const rule of RULES) {
    assert.equal(ids.has(rule.id), false, `duplicate rule id ${rule.id}`)
    ids.add(rule.id)
    assert.ok(SECTIONS.some((section) => section.id === rule.section), `${rule.id} has an unknown section`)
  }
})

test('every detector belongs to one rule and exists', () => {
  const owners = new Map()
  for (const id of DETECTOR_IDS) {
    assert.ok(DETECTORS_BY_ID.has(id), `detector ${id} is not implemented`)
    assert.equal(owners.has(id), false, `detector ${id} is claimed by two rules`)
    owners.set(id, true)
  }
  for (const [id, detector] of DETECTORS_BY_ID) {
    const rule = RULES.find((candidate) => candidate.detectors.includes(id))
    assert.ok(rule, `detector ${id} has no rule`)
    assert.equal(detector.scope === 'unit' || detector.scope === 'session', true)
    assert.ok(['text', 'thinking', 'tool'].includes(detector.kind), `${id} kind`)
  }
})

test('rendered rules carry a prompt line; rejected controls never do', () => {
  for (const rule of RULES) {
    if (rule.status === 'rejected') {
      assert.equal(rule.text, null, `${rule.id} must not render`)
      assert.equal(typeof rule.why, 'string', `${rule.id} needs the evidence that rejected it`)
    } else {
      assert.equal(typeof rule.text, 'string', `${rule.id} text`)
      assert.ok(rule.text.length > 0 && rule.text.length <= 200, `${rule.id} is not a prompt line`)
      assert.equal(rule.text.includes('\n'), false, `${rule.id} must be one line`)
    }
  }
})

test('lean mode renders the section without headings', () => {
  const text = rulesText(lean)
  assert.ok(text.startsWith(RULES_HEADING), 'stable marker first')
  assert.equal(text.includes('\n### '), false, 'lean mode has no section headings')
  const rules = activeRules(lean)
  assert.ok(rules.length >= 10, 'lean mode keeps the highest-value rules')
  assert.equal(rules.every((rule) => rule.tier === 'lean'), true)
  for (const rule of rules) assert.ok(text.includes(rule.text), `${rule.id} missing from the section`)
})

test('full mode adds section headings and the full tier', () => {
  const text = rulesText(full)
  assert.ok(text.includes('\n### Core\n'), 'full mode groups by section')
  const leanRules = activeRules(lean).map((rule) => rule.id)
  const fullRules = activeRules(full).map((rule) => rule.id)
  assert.ok(fullRules.length > leanRules.length, 'full mode is larger')
  for (const id of leanRules) assert.ok(fullRules.includes(id), `${id} survives full mode`)
  for (const rule of activeRules(full)) assert.ok(text.includes(rule.text), `${rule.id} missing`)
})

test('thinking rules follow the thinking switch', () => {
  const withThinking = rulesText(full)
  const without = rulesText(noThinking)
  const thinkingRules = RULES.filter((rule) => rule.section === 'thinking' && rule.text !== null)
  assert.ok(thinkingRules.length >= 2)
  for (const rule of thinkingRules) {
    assert.ok(withThinking.includes(rule.text), `${rule.id} must be in the section`)
    assert.equal(without.includes(rule.text), false, `${rule.id} must leave with thinking: false`)
  }
  assert.equal(without.includes('### Thinking'), false)
})

test('off mode emits no section at all', () => {
  assert.equal(rulesText({ mode: 'off', thinking: true }), '')
  assert.deepEqual(activeRules({ mode: 'off', thinking: true }), [])
})

test('placement follows the shell tools section', () => {
  const prompt = { getSectionOrder: (name) => (name === 'TOOL_PWSH' ? 1400 : undefined) }
  assert.equal(rulesOrder(prompt), 1405)
  assert.equal(rulesOrder(undefined), 1215)
  assert.equal(rulesOrder({ getSectionOrder: () => undefined }), 1215)
})

test('language routing leads the lean section', () => {
  const text = rulesText(lean)
  const userLanguage = RULES_BY_ID.get('core-language-user')
  const internalLanguage = RULES_BY_ID.get('core-language-internal')
  assert.equal(userLanguage.tier, 'lean')
  assert.equal(internalLanguage.tier, 'lean')
  for (const rule of [userLanguage, internalLanguage]) {
    assert.ok(text.includes(rule.text), `${rule.id} must be in the lean section`)
    assert.ok(activeRules(noThinking).some((active) => active.id === rule.id), 'language survives thinking: false')
  }
  assert.match(userLanguage.text, /user's language/)
  assert.match(userLanguage.text, /plan you ask them to approve/)
  assert.match(userLanguage.text, /questions and their answer options/)
  assert.match(internalLanguage.text, /thinking, tool calls/)
  const firstEconomy = text.indexOf('No filler')
  assert.ok(text.indexOf('user\'s language') < firstEconomy, 'language routing comes first')
  assert.ok(text.indexOf('Everything else is English') < firstEconomy, 'internal language comes first')
})

test('every rendered rule is unique text and not duplicated', () => {
  const seen = new Map()
  for (const rule of RENDERED) {
    assert.equal(seen.has(rule.text), false, `duplicate prompt line: ${rule.text}`)
    seen.set(rule.text, rule.id)
    assert.equal(RULES_BY_ID.get(rule.id)?.id, rule.id)
  }
})

test('auto mode keeps lean guards plus supported rules and respects disabled rules', () => {
  const autoFallback = activeRules({ mode: 'auto', thinking: true })
  assert.deepEqual(autoFallback.map((r) => r.id), activeRules(lean).map((r) => r.id))

  const supported = new Set(['tools-edit-anchor', 'core-alias'])
  const autoMeasured = activeRules({ mode: 'auto', thinking: true }, supported)
  const autoIds = autoMeasured.map((r) => r.id)
  assert.ok(autoIds.includes('core-language-user'), 'keeps lean guards')
  assert.ok(autoIds.includes('tools-edit-anchor'), 'keeps supported lean rule')
  assert.ok(autoIds.includes('core-alias'), 'promotes supported full rule')
  assert.equal(autoIds.includes('core-filler'), false, 'drops unsupported lean rule')

  const withDisabled = activeRules({ mode: 'lean', thinking: true, disabled: ['core-filler'] })
  assert.equal(withDisabled.some((r) => r.id === 'core-filler'), false)
})
