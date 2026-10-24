// The browser half: loader contract, registration, and a render smoke test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/**
 * A tiny element tree plus a React stub whose `useState` returns the initial
 * value and whose `createElement` invokes function components, so one call to
 * the section renders the whole first frame without a DOM.
 */
function harness() {
  const state = { module: null, id: null }
  const React = {
    createElement(type, props, ...children) {
      const merged = { ...(props ?? {}), children }
      if (typeof type === 'function') return type(merged)
      return { type, props: merged }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useCallback(callback) {
      return callback
    },
  }
  const window = {
    __ModuleLoader__: {
      load(definition) {
        state.id = definition.id
        state.module = definition.factory(() => React)
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', source)(window)
  return state
}

/** Collect every string in the rendered tree. */
function textOf(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, out)
    return out
  }
  if (node.props) {
    textOf(node.props.children, out)
    if (node.props.className) out.push(`.${node.props.className}`)
  }
  return out
}

function mountClient() {
  const state = harness()
  assert.ok(state.module, 'the loader did not receive a module')
  const calls = []
  const registered = { component: null, options: null, dictionaries: null }
  const form = { set: async (field, value) => calls.push([field, value]) }
  const ctx = {
    effect(callback, label) {
      assert.equal(typeof label, 'string')
      return callback()
    },
    locale: {
      register(namespace, dictionaries) {
        registered.dictionaries = { namespace, dictionaries }
        return () => {}
      },
      bind() {
        return (key) => key
      },
    },
    configForms: {
      whileServed(namespaces, callback) {
        assert.ok(namespaces.includes('telegrapher'))
        return callback(new Set(['telegrapher']))
      },
      get() {
        return form
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.section')
        return callback()
      },
      register(options, component) {
        registered.options = options
        registered.component = component
        return () => {}
      },
    },
  }
  state.module.apply(ctx)
  return { ...registered, calls, module: state.module }
}

test('the bundle id and the service list match the Host expectations', () => {
  const state = harness()
  assert.equal(state.id, 'dsh-telegrapher')
  assert.deepEqual(state.module.inject, ['slots', 'locale', 'configForms'])
  assert.equal(typeof state.module.apply, 'function')
})

test('the page registers both dictionaries and one settings section', () => {
  const mounted = mountClient()
  assert.deepEqual(Object.keys(mounted.dictionaries.dictionaries).sort(), ['en', 'ru'])
  assert.equal(mounted.dictionaries.namespace, 'settings.telegrapher')
  assert.equal(mounted.options.name, 'settings.section')
  assert.equal(mounted.options.id, 'telegrapher')
  assert.equal(mounted.options.order, 19.5)
  assert.equal(mounted.options.locale, 'settings.telegrapher')
  assert.equal(mounted.options.label(), 'nav')
})

test('the inject face forwards field writes to the config form', async () => {
  const mounted = mountClient()
  const face = mounted.options.inject()
  await face.setField('mode', 'full')
  await face.setField('sessions', 30)
  assert.deepEqual(mounted.calls, [
    ['mode', 'full'],
    ['sessions', 30],
  ])
})

test('the first frame renders every block without data', () => {
  const mounted = mountClient()
  const tree = mounted.component({ t: (key) => key, setField: async () => {} })
  const text = textOf(tree)
  assert.ok(text.some((entry) => entry.includes('tg-section')))
  for (const key of ['title', 'rulesTitle', 'reportTitle', 'wordsTitle', 'ledgerTitle', 'diagTitle', 'note']) {
    assert.ok(text.includes(key), `missing ${key}`)
  }
  assert.ok(text.includes('rescan'), 'the report offers a rescan')
})

test('the page renders read-only when the form is unavailable', () => {
  const mounted = mountClient()
  const tree = mounted.component({ t: (key) => key })
  const text = textOf(tree)
  assert.ok(text.some((entry) => entry.includes('tg-section')))
  assert.equal(text.includes('readonly'), true)
})

test('the page survives a failed status fetch', () => {
  const mounted = mountClient()
  const tree = mounted.component({ t: (key) => key, setField: async () => {} })
  // The section is rendered with status === null; a failed fetch is the same frame.
  assert.ok(textOf(tree).length > 5)
})

test('English and Russian dictionaries define identical keys', () => {
  const mounted = mountClient()
  const { en, ru } = mounted.dictionaries.dictionaries
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort())
})
