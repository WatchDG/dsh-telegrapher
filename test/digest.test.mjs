// Session log -> digest: accounting, units with context, tool calls.
import test from 'node:test'
import assert from 'node:assert/strict'

import { RULES_HEADING } from '../lib/config.js'
import { buildDigest, parseArguments } from '../lib/digest.js'

/** One assistant message with optional reasoning, text and tool calls. */
function assistant({ turn = 1, step = 1, reasoning = '', text = '', toolCalls = [], usage, model = 'm-1' }) {
  const content = []
  if (reasoning) content.push({ type: 'reasoning', text: reasoning })
  if (text) content.push({ type: 'text', text })
  for (const call of toolCalls) {
    content.push({ type: 'tool-call', id: call.id ?? 'c1', name: call.name, arguments: call.arguments })
  }
  return {
    type: 'assistant/message',
    seq: step,
    data: {
      turn,
      step,
      message: {
        role: 'assistant',
        source: { kind: 'model', provider: 'p-1', model },
        content,
      },
      ...(usage ? { usage } : {}),
      stream: [],
    },
  }
}

const call = (name, args, turn = 1, step = 1) => ({
  type: 'tool/call',
  seq: step,
  data: { turn, step, callId: 'c1', name, arguments: JSON.stringify(args) },
})

const result = (text) => ({
  type: 'tool/result',
  seq: 1,
  data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text }] } },
})

const system = (text) => ({
  type: 'system/message',
  seq: 1,
  data: { turn: 1, step: 1, message: { role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text }] } },
})

test('parseArguments tolerates malformed input', () => {
  assert.deepEqual(parseArguments('{"a":1}'), { a: 1 })
  assert.deepEqual(parseArguments('not json'), {})
  assert.deepEqual(parseArguments('null'), {})
  assert.deepEqual(parseArguments(''), {})
  assert.deepEqual(parseArguments(undefined), {})
})

test('digest sums usage, counts messages and reads the model', () => {
  const digest = buildDigest({
    session: { id: 's1', createdAt: 10, cwd: 'F:\\repo' },
    events: [
      system('prompt'),
      { type: 'turn/start', data: { turn: 1 } },
      assistant({ usage: { outputTokens: 10, inputTokens: 5, cacheReadTokens: 2 } }),
      { type: 'turn/start', data: { turn: 2 } },
      assistant({ turn: 2, usage: { outputTokens: 20, inputTokens: 7 } }),
    ],
  })
  assert.equal(digest.id, 's1')
  assert.equal(digest.cwd, 'F:\\repo')
  assert.equal(digest.turns, 2)
  assert.equal(digest.assistantMessages, 2)
  assert.equal(digest.usage.outputTokens, 30)
  assert.equal(digest.usage.inputTokens, 12)
  assert.equal(digest.usage.cacheReadTokens, 2)
  assert.equal(digest.model, 'm-1')
  assert.equal(digest.provider, 'p-1')
})

test('digest detects the telegrapher section in the system prompt', () => {
  const marked = buildDigest({
    session: { id: 's1' },
    events: [system(`before\n${RULES_HEADING}\n- rule`)],
  })
  assert.equal(marked.telegrapherActive, true)
  assert.ok(marked.systemPromptChars > 0)
  const plain = buildDigest({ session: { id: 's2' }, events: [system('ordinary prompt')] })
  assert.equal(plain.telegrapherActive, false)
})

test('units carry the context a detector needs', () => {
  const units = []
  buildDigest(
    {
      session: { id: 's1', cwd: 'F:\\repo' },
      events: [
        { type: 'turn/start', data: { turn: 1 } },
        assistant({
          reasoning: 'first thought',
          text: 'Let me look.',
          toolCalls: [{ name: 'read', arguments: '{"file_path":"a.ts"}' }],
          usage: { outputTokens: 5 },
        }),
        result('file contents here'),
        assistant({ text: 'The file is empty.', usage: { outputTokens: 5 } }),
      ],
    },
    { onUnit: (unit) => units.push(unit) },
  )
  assert.equal(units.length, 3)
  assert.deepEqual(units.map((unit) => unit.kind), ['thinking', 'text', 'text'])
  assert.equal(units[0].context.hasToolCalls, true)
  assert.equal(units[1].context.hasToolCalls, true)
  assert.equal(units[2].context.hasToolCalls, false)
  assert.equal(units[2].context.previousToolResult, 'file contents here')
  assert.ok(units[2].context.earlierText.includes('first thought'))
  assert.ok(units[2].context.earlierText.includes('Let me look.'))
})

test('calls are parsed, counted, and track the working directory', () => {
  const calls = []
  const digest = buildDigest(
    {
      session: { id: 's1', cwd: 'F:\\repo' },
      events: [
        call('working_directory', { cd: 'F:\\repo\\sub' }),
        call('pwsh', { command: 'git status', description: 'Show status' }),
        call('edit', { file_path: 'a.ts', old_string: 'x', new_string: 'y' }),
        call('edit', { file_path: 'b.ts', old_string: 'x', new_string: 'y' }),
      ],
    },
    { onCall: (value) => calls.push(value) },
  )
  assert.equal(digest.calls.length, 4)
  assert.deepEqual(digest.toolCalls, { working_directory: 1, pwsh: 1, edit: 2 })
  assert.equal(calls[1].cwd, 'F:\\repo\\sub')
  assert.equal(calls[1].args.command, 'git status')
  assert.equal(calls[2].args.old_string, 'x')
})

test('code lines from tool arguments feed reprint detection', () => {
  const units = []
  buildDigest(
    {
      session: { id: 's1' },
      events: [
        call('edit', {
          file_path: 'a.ts',
          old_string: 'const token = await exchange(code)\nreturn token',
          new_string: 'const token = await exchange(code)\nreturn token',
        }),
        assistant({ text: '```js\nconst token = await exchange(code)\nreturn token\n```' }),
      ],
    },
    { onUnit: (unit) => units.push(unit) },
  )
  assert.ok(units[0].context.codeLines.has('const token = await exchange(code)'))
  assert.equal(units[0].context.codeLines.size >= 1, true)
})

test('inherited header fields survive and unknown events are ignored', () => {
  const digest = buildDigest({
    session: { id: 's9', createdAt: 123, cwd: 'F:\\r', origin: 'subagent', agentPreset: 'standard' },
    events: [{ type: 'mystery/event', data: {} }, null, 42],
  })
  assert.equal(digest.createdAt, 123)
  assert.equal(digest.origin, 'subagent')
  assert.equal(digest.preset, 'standard')
  assert.equal(digest.assistantMessages, 0)
})
