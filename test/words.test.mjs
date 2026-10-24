// Word and phrase frequency analysis, length filtering, context snippets, and rewrites.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyTermRewrite,
  cleanProseForWords,
  extractWordCandidates,
  filterWords,
  finalizeWords,
  registerWordStrings,
  suggestForTerm,
} from '../lib/words.js'

test('cleanProseForWords strips code fences, inline code, URLs and paths', () => {
  const input = [
    'Соответственно проверим `const x = 1` в файле F:\\git\\repo\\lib\\config.js.',
    '```js',
    'function implementation() { return essentially }',
    '```',
    'See [docs](https://example.com/a/b) and https://example.com/raw or src/index.ts.',
  ].join('\n')
  const cleaned = cleanProseForWords(input)
  assert.ok(cleaned.includes('Соответственно проверим'))
  assert.ok(cleaned.includes('docs'))
  assert.equal(cleaned.includes('const x'), false)
  assert.equal(cleaned.includes('implementation'), false)
  assert.equal(cleaned.includes('config.js'), false)
  assert.equal(cleaned.includes('example.com'), false)
  assert.equal(cleaned.includes('src/index.ts'), false)
})

test('extractWordCandidates and finalizeWords rank words, phrases and context fragments', () => {
  const sessions = [
    {
      digest: { id: 's1' },
      units: [
        {
          kind: 'text',
          text: 'Соответственно мы проверим конфигурацию. Для того чтобы запустить тест, нужно время.',
          unmatchedText: 'Соответственно мы проверим конфигурацию. Для того чтобы запустить тест, нужно время.',
        },
        {
          kind: 'thinking',
          text: 'Actually we should check in order to verify the result.',
          unmatchedText: 'Actually we should check in order to verify the result.',
        },
      ],
    },
    {
      digest: { id: 's2' },
      units: [
        {
          kind: 'text',
          text: 'Соответственно результат готов. Непосредственно перед запуском проверим параметры.',
          unmatchedText: 'Соответственно результат готов. Непосредственно перед запуском проверим параметры.',
        },
        {
          kind: 'thinking',
          text: 'Actually let us verify in order to be sure.',
          unmatchedText: 'Actually let us verify in order to be sure.',
        },
      ],
    },
  ]

  const pool = []
  const poolAdapter = {
    add(str) {
      const idx = pool.length
      pool.push(str)
      return idx
    },
  }
  const extracted = extractWordCandidates(sessions)
  const indexes = registerWordStrings(extracted, poolAdapter)
  // Simulate BPE where Cyrillic words > 10 chars cost 4 tokens and English words cost 1 token per word
  const counts = pool.map((str) => {
    const trimmed = str.trim()
    if (trimmed === 'соответственно' || trimmed === 'непосредственно') return 4
    return trimmed.split(/\s+/).filter(Boolean).length
  })
  const words = finalizeWords(extracted, indexes, counts)

  assert.ok(words.totalUnique > 5)
  assert.ok(words.items.length > 0)

  const sootv = words.items.find((item) => item.term === 'соответственно')
  assert.ok(sootv, 'found соответственно')
  assert.equal(sootv.chars, 14)
  assert.equal(sootv.bpeTokens, 4)
  assert.equal(sootv.occurrences, 2)
  assert.equal(sootv.sessions, 2)
  assert.equal(sootv.totalTokens, 8)
  assert.equal(sootv.suggestion?.action, 'exclude')
  assert.ok(sootv.snippets.length >= 2)
  assert.ok(sootv.snippets[0].text.includes('Соответственно'))

  const inOrderTo = words.items.find((item) => item.term === 'in order to')
  assert.ok(inOrderTo, 'found 3-gram "in order to"')
  assert.equal(inOrderTo.ngram, 3)
  assert.equal(inOrderTo.suggestion?.action, 'shorten')
  assert.equal(inOrderTo.suggestion?.replacement, 'to')

  // Test length and candidate filters
  const longOnly = filterWords(words, { minChars: 12, maxChars: 16, minTokens: 2 })
  assert.ok(longOnly.some((item) => item.term === 'соответственно'))
  assert.ok(longOnly.every((item) => item.chars >= 12 && item.chars <= 16 && item.bpeTokens >= 2))

  const thinkingCandidates = filterWords(words, { channel: 'thinking', onlyCandidates: true })
  assert.ok(thinkingCandidates.some((item) => item.term === 'actually'))
  assert.equal(thinkingCandidates.some((item) => item.term === 'соответственно'), false)
})

test('applyTermRewrite excludes or shortens a target word in context cleanly', () => {
  assert.equal(
    applyTermRewrite('Соответственно, мы проверим модуль.', 'соответственно', 'exclude'),
    'Мы проверим модуль.',
  )
  assert.equal(
    applyTermRewrite('Мы, соответственно, обновили код.', 'соответственно', 'exclude'),
    'Мы, обновили код.',
  )
  assert.equal(
    applyTermRewrite('We run this in order to verify state.', 'in order to', 'shorten', 'to'),
    'We run this to verify state.',
  )
  assert.equal(
    applyTermRewrite('Для того чтобы собрать проект, запустите тест.', 'для того чтобы', 'shorten', 'чтобы'),
    'Чтобы собрать проект, запустите тест.',
  )
})

test('suggestForTerm flags heuristic long nominalizations as rephrase candidates', () => {
  const hint = suggestForTerm('конфигурирование', 1, 16, 4)
  assert.equal(hint?.action, 'rephrase')
  assert.equal(suggestForTerm('file', 1, 4, 1), null)
})
