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
  const russian = hit('filler', textUnit('Конечно! Я помогу. Ошибка в модуле авторизации, на самом деле всё просто.'))
  assert.equal(russian.after, 'Ошибка в модуле авторизации, всё просто.')
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
  assert.equal(hit('terminal-period', textUnit('Готово, всё.')).after, 'Готово, всё')
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
  const typo = hit('narration', textUnit('Lets me check the config first.', { hasToolCalls: false }))
  assert.equal(typo.after, 'check the config first.')
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

test('verbose-done: one-sentence mechanical completion collapses to Done', () => {
  assert.equal(
    hit('verbose-done', textUnit('I have successfully updated the configuration file.')).after,
    'Done.',
  )
  assert.equal(
    hit('verbose-done', textUnit('Я успешно обновил конфигурационный файл.')).after,
    'Готово.',
  )
  miss('verbose-done', textUnit('Updated auth.ts:42 to check the token expiry.'))
})

test('apology: strips self-blame before the fix', () => {
  const result = hit('apology', textUnit('Sorry about that! The path is lib/index.js.'))
  assert.equal(result.after, 'The path is lib/index.js.')
  const oops = hit('apology', textUnit('Oops, the path is lib/index.js.'))
  assert.equal(oops.after, 'the path is lib/index.js.')
  const ru = hit('apology', textUnit('Извините за путаницу. Путь: lib/index.js.'))
  assert.equal(ru.after, 'Путь: lib/index.js.')
})

test('short-list: two short items become inline', () => {
  const result = hit('short-list', textUnit('Changed:\n- added tests\n- updated docs'))
  assert.equal(result.after, 'Changed:\nadded tests; updated docs')
  miss('short-list', textUnit('- one\n- two\n- three'))
})

test('plain-backticks: removes backticks around conversational words', () => {
  const result = hit('plain-backticks', textUnit('Status is `clean` and `done`.'))
  assert.equal(result.after, 'Status is clean and done.')
  miss('plain-backticks', textUnit('Call `buildDigest` in `lib/digest.js`.'))
})

test('duplicate-url-link: collapses [url](url) to bare url', () => {
  const result = hit('duplicate-url-link', textUnit('See [https://example.com/a](https://example.com/a).'))
  assert.equal(result.after, 'See https://example.com/a.')
  miss('duplicate-url-link', textUnit('See [docs](https://example.com/a).'))
})

test('em-dash: replaces em-dash with hyphen outside fences', () => {
  const result = hit('em-dash', textUnit('One — two'))
  assert.equal(result.after, 'One - two')
  miss('em-dash', textUnit('```\nOne — two\n```'))
})

test('thinking-code-draft: drops code drafted in thinking before a write/edit', () => {
  const stepCodeLines = new Set(['export const x = compute(1)', 'export const y = compute(2)'])
  const result = hit(
    'thinking-code-draft',
    thinkingUnit('Plan:\n```js\nexport const x = compute(1)\nexport const y = compute(2)\n```\nNow write.', {
      stepCodeLines,
    }),
  )
  assert.equal(result.after.includes('export const x'), false)
  assert.ok(result.after.includes('Now write.'))
})

test('thinking-narration: strips intent lead-ins and tool-call announcements in reasoning', () => {
  const lead = hit(
    'thinking-narration',
    thinkingUnit('First, let me check the schema. Lets me verify the port.'),
  )
  assert.equal(lead.after, 'check the schema. verify the port.')
  const trailing = hit(
    'thinking-narration',
    thinkingUnit('The schema is missing a field.\nLet me read lib/config.js first.', { hasToolCalls: true }),
  )
  assert.equal(trailing.after, 'The schema is missing a field.')
  const pure = hit('thinking-narration', thinkingUnit('Let me read lib/config.js.', { hasToolCalls: true }))
  assert.equal(pure.after, '')
})

test('thinking-filler: strips conversational self-talk and interjections in reasoning', () => {
  const result = hit(
    'thinking-filler',
    thinkingUnit("Okay, let's see what we have here. The cache key misses the port."),
  )
  assert.equal(result.after, 'The cache key misses the port.')
  const pivots = hit(
    'thinking-filler',
    thinkingUnit('Wait — the token is null. Hmm, check the header. Oops: wrong offset.'),
  )
  assert.equal(pivots.after, 'the token is null. check the header. wrong offset.')
  miss('thinking-filler', thinkingUnit('Wait for the child process to exit before closing.'))
})

test('thinking-plan: drops plan steps already written earlier', () => {
  const step1 = 'Update the configuration schema with the new mode option'
  const step2 = 'Add unit tests covering the fallback behavior and routes'
  const earlier = `Here is the plan:\n1. ${step1}\n2. ${step2}\n${'context '.repeat(20)}`
  const result = hit(
    'thinking-plan',
    thinkingUnit(`1. ${step1}\n2. ${step2}\nNow executing step 1.`, { earlierText: earlier }),
  )
  assert.equal(result.after, 'Now executing step 1.')
})

test('adjacent-edits: consecutive edits to the same file in one turn are flagged', () => {
  const hits = DETECTORS_BY_ID.get('adjacent-edits').apply({
    calls: [
      { turn: 1, name: 'edit', args: { file_path: 'a.ts', old_string: 'a', new_string: 'b' }, raw: '{"1":1}' },
      { turn: 1, name: 'edit', args: { file_path: 'a.ts', old_string: 'c', new_string: 'd' }, raw: '{"2":2}' },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].units, 1)
})

test('banner-comments: strips ASCII divider comments from new code', () => {
  const result = hit(
    'banner-comments',
    toolUnit('write', { file_path: 'a.js', content: '// ============\nconst x = 1\n' }),
  )
  assert.equal(result.after, 'const x = 1\n')
})

test('shell-separators: strips decorative echo dividers in shell commands', () => {
  const result = hit(
    'shell-separators',
    toolUnit('pwsh', { command: 'npm test; echo "========"; git status' }),
  )
  assert.equal(result.after.includes('===='), false)
  assert.ok(result.after.includes('npm test'))
})

test('repeat-read: flags re-reading an unchanged file', () => {
  const raw = JSON.stringify({ file_path: 'a.ts' })
  const hits = DETECTORS_BY_ID.get('repeat-read').apply({
    calls: [
      { name: 'read', args: { file_path: 'a.ts' }, raw },
      { name: 'read', args: { file_path: 'a.ts' }, raw },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
})

test('template-writes: flags three similar file writes in one session', () => {
  const base = Array.from({ length: 8 }, (_, i) => `export const line${i} = ${i}`).join('\n')
  const hits = DETECTORS_BY_ID.get('template-writes').apply({
    calls: [
      { name: 'write', args: { file_path: 'a.js', content: `${base}\nexport const id = "a"` }, raw: '{}' },
      { name: 'write', args: { file_path: 'b.js', content: `${base}\nexport const id = "b"` }, raw: '{}' },
      { name: 'write', args: { file_path: 'c.js', content: `${base}\nexport const id = "c"` }, raw: '{}' },
    ],
    texts: [],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].units, 2)
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
