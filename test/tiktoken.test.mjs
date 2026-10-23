// Token measurement: the tiktoken bridge and its estimator fallback.
import test from 'node:test'
import assert from 'node:assert/strict'

import { countOnce, createTokenCounter, estimateTokens, pythonCandidates } from '../lib/tiktoken.js'

test('python candidates follow the platform and the configuration', () => {
  const auto = pythonCandidates('auto')
  assert.ok(auto.length > 0)
  assert.ok(auto.every((candidate) => typeof candidate.command === 'string'))
  const explicit = pythonCandidates('C:\\Python313\\python.exe')
  assert.deepEqual(explicit, [{ command: 'C:\\Python313\\python.exe', args: [] }])
})

test('the estimator is monotone and script-aware', () => {
  assert.equal(estimateTokens(''), 0)
  const short = estimateTokens('one two three')
  const long = estimateTokens('one two three four five six seven eight nine ten')
  assert.ok(long > short)
  const cyrillic = estimateTokens('телеграфист экономит токены ответа')
  const latin = estimateTokens('telegrapher saves answer tokens here')
  assert.ok(cyrillic > 0 && latin > 0)
  assert.ok(estimateTokens('1234567890') > 0)
  assert.ok(estimateTokens('```js\nconst x = 1\n```') >= 5)
})

test('a counter starts unusable and reports why', () => {
  const counter = createTokenCounter({ python: 'definitely-not-python-xyz' })
  const status = counter.status()
  assert.equal(status.ok, false)
  assert.equal(status.exact, false)
  counter.close()
})

test('tiktoken prices real strings exactly', async (t) => {
  const counter = createTokenCounter({ encoding: 'o200k_base' })
  try {
    const probe = await counter.count(['hello world'])
    if (probe.exact !== true) {
      t.skip('tiktoken is not installed on this machine')
      return
    }
    assert.equal(probe.counts[0], 2)
    assert.equal(counter.status().ok, true)
    assert.equal(counter.status().encoding, 'o200k_base')

    const arrows = await counter.count(['→', '.', 'a → b', 'a. b'])
    assert.equal(arrows.counts[0], 1, 'the arrow is one token in o200k')
    assert.equal(arrows.counts[1], 1)
    assert.equal(arrows.counts[2] - arrows.counts[3], 0, 'a period saves nothing over an arrow')

    const cyrillic = await counter.count([
      'все 47 тестов прошли успешно',
      '47/47 pass',
    ])
    assert.ok(cyrillic.counts[0] > cyrillic.counts[1], 'a Latin template beats the Cyrillic sentence')

    const cached = await counter.count(['hello world'])
    assert.equal(cached.exact, true)
    assert.equal(cached.counts[0], 2)
  } finally {
    counter.close()
  }
})

test('the bridge batches large inputs', async (t) => {
  const probe = await countOnce(['x'])
  if (!probe.exact) {
    t.skip('tiktoken is not installed on this machine')
    return
  }
  const texts = Array.from({ length: 700 }, (_, index) => `line ${index} of the batch`)
  const result = await countOnce(texts)
  assert.equal(result.counts.length, texts.length)
  assert.ok(result.counts.every((count) => count > 0))
})

test('the estimator stays in the same order of magnitude as tiktoken', async (t) => {
  const sample = [
    'The cache is stale because the key ignores the workspace path. Restarting the host clears it.',
    'Кэш устарел: ключ не учитывает путь рабочей области. Перезапуск хоста очищает его.',
    'The function returns a list of token counts for the given encoding.',
    'Функция возвращает список количества токенов для заданной кодировки.',
  ]
  const result = await countOnce(sample)
  if (!result.exact) {
    t.skip('tiktoken is not installed on this machine')
    return
  }
  for (let index = 0; index < sample.length; index += 1) {
    const estimate = estimateTokens(sample[index])
    const exact = result.counts[index]
    const ratio = estimate / exact
    assert.ok(ratio > 0.5 && ratio < 1.7, `estimate ${estimate} vs exact ${exact} for ${sample[index].slice(0, 30)}`)
  }
})
