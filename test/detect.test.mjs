// Detectors: every rewrite the rules ask for, and nothing else.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DETECTORS_BY_ID,
  basename,
  normalize,
  proseOnly,
  sentences,
  splitFences,
} from '../lib/detect.js'

const textUnit = (text, context = {}) => ({ kind: 'text', text, context })
const thinkingUnit = (text, context = {}) => ({ kind: 'thinking', text, context })
const toolUnit = (name, args, context = {}) => ({
  kind: 'tool',
  call: { name, args, raw: JSON.stringify(args) },
  context,
})

/** Apply one detector and assert it produced a hit. */
function hit(id, unit) {
  const detector = DETECTORS_BY_ID.get(id)
  assert.ok(detector, `unknown detector ${id}`)
  const result = detector.apply(unit)
  assert.ok(result, `${id} produced no hit`)
  return Array.isArray(result) ? result[0] : result
}

/** Assert the detector stays silent. */
function miss(id, unit) {
  const detector = DETECTORS_BY_ID.get(id)
  const result = detector.apply(unit)
  assert.equal(result ?? null, null, `${id} should not fire`)
}

test('text helpers keep fences intact', () => {
  const text = 'before\n```js\nconst x = 1\n```\nafter'
  const parts = splitFences(text)
  assert.equal(parts.map((part) => part.fence).join(','), 'false,true,false')
  assert.equal(proseOnly(text).includes('const x'), false)
  assert.equal(normalize('  a\n\tb  '), 'a b')
  assert.deepEqual(sentences('One. Two! Three?'), ['One.', 'Two!', 'Three?'])
  assert.equal(basename('C:\\work\\repo\\lib\\plugin.js'), 'plugin.js')
  assert.equal(basename('https://example.com/docs/index.html'), 'index.html')
})

test('filler: drops pleasantries and never touches code', () => {
  const unit = textUnit("Sure! I'd be happy to help. The bug is in auth.")
  const result = hit('filler', unit)
  assert.equal(result.after, 'The bug is in auth.')
  miss('filler', textUnit('```\nSure! I would be happy to help.\n```'))
  miss('filler', textUnit('The bug is in auth.'))
})

test('recap: drops a trailing summary block', () => {
  const answer =
    'The cache is stale because the key ignores the workspace path. ' +
    'Restarting the host clears it, and the next request rebuilds the key.\n\n' +
    '## Summary\n- stale key\n- restart fixes it\n'
  const result = hit('recap', textUnit(answer))
  assert.equal(result.after.includes('Summary'), false)
  assert.ok(result.after.includes('cache is stale'))
  miss('recap', textUnit('## Summary\nshort answer only\n'))
})

test('offer: drops the closing offer', () => {
  const result = hit('offer', textUnit('Fix applied in auth.ts:42.\n\nLet me know if you need anything else.'))
  assert.equal(result.after, 'Fix applied in auth.ts:42.')
})

test('restate: drops the restated question', () => {
  const result = hit('restate', textUnit("You're asking why the build fails.\n\nThe cache is stale."))
  assert.equal(result.after, 'The cache is stale.')
})

test('next-steps: drops a trailing plan', () => {
  const text = `${'The build is clean and the tests pass. '.repeat(4)}\n\n## Next steps\n1. commit\n2. push\n`
  const result = hit('next-steps', textUnit(text))
  assert.equal(result.after.includes('Next steps'), false)
  miss('next-steps', textUnit('## Next steps\n1. commit\n'))
})

test('markup: strips markers outside fences', () => {
  const result = hit('markup', textUnit('**Done** 🎉 — 3/3 pass'))
  assert.equal(result.after, 'Done — 3/3 pass')
  const fenced = hit('markup', textUnit('**Done**\n```\n**keep this**\n```'))
  assert.ok(fenced.after.includes('**keep this**'))
})

test('table: rows become inline lists', () => {
  const result = hit('table', textUnit('| name | value |\n|---|---|\n| a | 1 |\n| b | 2 |'))
  assert.equal(result.after, 'name, value\na, 1\nb, 2')
})

test('terminal-period: only a one-line fragment loses its period', () => {
  assert.equal(hit('terminal-period', textUnit('Done.')).after, 'Done')
  miss('terminal-period', textUnit('Read lib/plugin.js.'))
  miss('terminal-period', textUnit('line one\nline two.'))
})

test('fence-lang: log fences lose their language tag', () => {
  const result = hit('fence-lang', textUnit('```text\nnpm error 404\n```'))
  assert.equal(result.after, '```\nnpm error 404\n```')
  miss('fence-lang', textUnit('```ts\nconst x = 1\n```'))
})

test('comma-path: enumerated paths separate with spaces', () => {
  assert.equal(hit('comma-path', textUnit('touch a.py, b.py')).after, 'touch a.py b.py')
})

test('wrapper: drops the sentence that introduces a value', () => {
  const result = hit('wrapper', textUnit('The version is 1.2.3.\nUse the pinned one.'))
  assert.equal(result.after, 'Use the pinned one.')
})

test('narration: a status line before a tool call disappears', () => {
  const status = hit('narration', textUnit('Let me check the config first.', { hasToolCalls: true }))
  assert.equal(status.after, '')
  const lead = hit('narration', textUnit('Let me check the config first.', { hasToolCalls: false }))
  assert.equal(lead.after, 'check the config first.')
})

test('tool-echo: lines copied from the tool result are dropped', () => {
  const line = 'error TS2345: Argument of type string is not assignable to parameter of type number'
  const result = hit('tool-echo', textUnit(`${line}\nThe type is wrong.`, { previousToolResult: line }))
  assert.equal(result.after, 'The type is wrong.')
  miss('tool-echo', textUnit('The type is wrong.', { previousToolResult: line }))
})

test('command-quote: a command the turn already ran loses its backticks', () => {
  const result = hit('command-quote', textUnit('Then run `git status` again.', { turnCommands: ['git status'] }))
  assert.equal(result.after, 'Then run git status again.')
  miss('command-quote', textUnit('Then run `npm test` again.', { turnCommands: ['git status'] }))
})

test('reprint: a fence copied from an earlier edit is removed', () => {
  const codeLines = new Set(['const token = await exchange(code)', 'return token'])
  const text = 'Fixed expiry:\n```js\nconst token = await exchange(code)\nreturn token\n```\nDone.'
  const result = hit('reprint', textUnit(text, { codeLines }))
  assert.equal(result.after.includes('const token'), false)
  assert.ok(result.after.includes('Fixed expiry:'))
  miss('reprint', textUnit('```js\nconst other = 1\nconst second = 2\n```', { codeLines }))
})

test('before-after: the first of two identical fences is dropped', () => {
  const block = '```js\nconst a = compute(one)\nconst b = compute(two)\n```'
  const text = `Before:\n${block}\nAfter:\n${block}`
  const result = hit('before-after', textUnit(text))
  assert.equal(result.after.split('```').length, 3)
})

test('blank-lines: list spacing normalises', () => {
  const result = hit('blank-lines', textUnit('- one\n\n- two\n\n- three'))
  assert.equal(result.after, '- one\n- two\n- three')
})

test('invented-abbrev: abbreviations expand', () => {
  assert.equal(hit('invented-abbrev', textUnit('the cfg is loaded')).after, 'the configuration is loaded')
})

test('causal-arrow: the arrow becomes a period, whitespace untouched', () => {
  const result = hit('causal-arrow', textUnit('Cache miss → slower start.'))
  assert.equal(result.after, 'Cache miss . slower start.')
})

test('edit-anchor: a wide anchor shrinks to the changed line plus context', () => {
  const oldLines = ['one', 'two', 'three', 'four changed', 'five', 'six', 'seven']
  const newLines = ['one', 'two', 'three', 'four edited', 'five', 'six', 'seven']
  const result = hit(
    'edit-anchor',
    toolUnit('edit', { file_path: 'a.ts', old_string: oldLines.join('\n'), new_string: newLines.join('\n') }),
  )
  assert.equal(result.after, 'three\nfour changed\nfive')
  miss(
    'edit-anchor',
    toolUnit('edit', { file_path: 'a.ts', old_string: 'one\ntwo', new_string: 'one\nthree' }),
  )
  miss(
    'edit-anchor',
    toolUnit('edit', {
      file_path: 'a.ts',
      old_string: 'one\ntwo',
      new_string: 'one\ntwo\nthree',
    }),
  )
})

test('repeat-write: a second small write is a job for edit', () => {
  const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`)
  const before = lines.join('\n')
  const after = [...lines.slice(0, 5), 'line 5 changed', ...lines.slice(6)].join('\n')
  const detector = DETECTORS_BY_ID.get('repeat-write')
  const hits = detector.apply({
    calls: [
      { name: 'write', args: { file_path: 'a.ts', content: before }, raw: '{}' },
      { name: 'write', args: { file_path: 'a.ts', content: after }, raw: '{}' },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
  assert.ok(hits[0].after.includes('line 5 changed'))
  assert.ok(hits[0].after.length < hits[0].before.length)

  const rewritten = lines.map((line, index) => (index % 2 === 0 ? `${line} x` : line)).join('\n')
  const none = detector.apply({
    calls: [
      { name: 'write', args: { file_path: 'a.ts', content: before }, raw: '{}' },
      { name: 'write', args: { file_path: 'a.ts', content: rewritten }, raw: '{}' },
    ],
    texts: [],
  })
  assert.equal(none, null)
})

test('identical-edits: repeats collapse into one call', () => {
  const args = { file_path: 'a.ts', old_string: 'const x = 1', new_string: 'const x = 2' }
  const raw = JSON.stringify(args)
  const hits = DETECTORS_BY_ID.get('identical-edits').apply({
    calls: [
      { name: 'edit', args, raw },
      { name: 'edit', args, raw },
      { name: 'edit', args, raw },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].units, 2)
})

test('cd-prefix: a cd into the current directory is waste', () => {
  const result = hit('cd-prefix', toolUnit('pwsh', { command: 'cd F:\\repo && git status' }, { cwd: 'f:\\repo' }))
  assert.equal(result.after, '')
  miss('cd-prefix', toolUnit('pwsh', { command: 'cd F:\\other && git status' }, { cwd: 'F:\\repo' }))
  miss('cd-prefix', toolUnit('pwsh', { command: 'git status' }, { cwd: 'F:\\repo' }))
})

test('tool-description: long shell descriptions shrink to five words', () => {
  const result = hit(
    'tool-description',
    toolUnit('pwsh', { command: 'git status', description: 'List all files that changed in the working tree' }),
  )
  assert.equal(result.after, 'List all files that changed')
})

test('hot-command: a long command repeated three times is hoisted', () => {
  const command = `node scripts/check.mjs --config ${'x'.repeat(40)} --strict`
  const hits = DETECTORS_BY_ID.get('hot-command').apply({
    calls: [
      { name: 'pwsh', args: { command }, raw: '{}' },
      { name: 'pwsh', args: { command }, raw: '{}' },
      { name: 'pwsh', args: { command }, raw: '{}' },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].units, 1)
})

test('path-repeat: a long path repeated three times gets an alias', () => {
  const long = 'C:\\work\\acme-platform\\src\\packages\\catalogue.js'
  const hits = DETECTORS_BY_ID.get('path-repeat').apply({
    calls: [],
    texts: [`see ${long}`, `${long} is long`, `again ${long}`],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].units, 2)
  assert.equal(hits[0].after, 'catalogue.js')
})

test('thinking-echo: reasoning that quotes the tool result is dropped', () => {
  const sentence = 'The build prints three errors about missing type declarations in the auth module.'
  const result = hit('thinking-echo', thinkingUnit(`${sentence} So the types are missing.`, {
    previousToolResult: `stdout:\n${sentence}\n`,
  }))
  assert.ok(result.after.includes('So the types are missing.'))
  assert.equal(result.after.includes(sentence), false)
})

test('thinking-rederive: reasoning that repeats an earlier conclusion is dropped', () => {
  const sentence = 'The cache key ignores the workspace path, which is why two projects share entries.'
  const earlier = `x ${'filler '.repeat(40)}\n${sentence}`
  const result = hit('thinking-rederive', thinkingUnit(`${sentence} Now the config.`, { earlierText: earlier }))
  assert.equal(result.after.includes(sentence), false)
})

test('repeat-paragraph: a paragraph repeated from an earlier turn is dropped', () => {
  const paragraph =
    'The plugin loads a system-prompt section and three authenticated routes; the routes are read-only and never modify profile state.'
  const earlier = `intro ${'text '.repeat(60)}\n${paragraph}`
  const result = hit('repeat-paragraph', textUnit(`New fact.\n\n${paragraph}`, { earlierText: earlier }))
  assert.equal(result.after, 'New fact.')
})

test('detectors never fire on empty input', () => {
  for (const [id, detector] of DETECTORS_BY_ID) {
    if (detector.scope !== 'unit') continue
    const unit = detector.kind === 'tool'
      ? toolUnit('unknown', {})
      : { kind: detector.kind, text: '', context: {} }
    assert.equal(detector.apply(unit) ?? null, null, `${id} fired on empty input`)
  }
})
