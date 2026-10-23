// Packaging and display metadata for the plugin bundle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (relative) => readFileSync(path.join(root, relative), 'utf8')

const pkg = JSON.parse(read('package.json'))

const REQUIRED_FILES = [
  'index.js',
  'client.js',
  'lib/analysis.js',
  'lib/catalogue.js',
  'lib/config.js',
  'lib/detect.js',
  'lib/digest.js',
  'lib/hypotheses.js',
  'lib/plugin.js',
  'lib/rules.js',
  'lib/tiktoken.js',
  'lib/tool.js',
  'tools/tiktoken_server.py',
  'scripts/analyze-sessions.mjs',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/ru.json',
  'icon.svg',
  'README.md',
  'README.ru.md',
  'docs/README.md',
  'docs/language.md',
  'docs/rules.md',
  'docs/measurement.md',
  'docs/architecture.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'NOTICE',
  '.gitignore',
]

test('manifest declares a DSH bundle', () => {
  assert.equal(pkg.name, 'dsh-telegrapher')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.license, 'Apache-2.0')
  assert.deepEqual(pkg.dsh.bundle, { patch: './cordis.patch.yml' })
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.equal(pkg.exports['./icon'], './icon.svg')
})

test('every runtime file is shipped by npm', () => {
  assert.ok(pkg.files.includes('index.js'))
  assert.ok(pkg.files.includes('client.js'))
  assert.ok(pkg.files.includes('lib/*.js'))
  assert.ok(pkg.files.includes('tools/*.py'), 'the tiktoken bridge must ship')
  assert.ok(pkg.files.includes('docs/*.md'), 'the documentation the READMEs link must ship')
  assert.ok(pkg.files.includes('scripts/*.mjs'), 'the offline analysis script must ship')
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.includes('locale/*.json'))
  assert.ok(pkg.files.includes('icon.svg'))
  assert.ok(!pkg.files.includes('node_modules'), 'dependencies install from the registry')
  assert.ok(!pkg.files.includes('test/*'), 'tests stay out of the package')
})

test('the settings schema library is a declared dependency', () => {
  assert.ok(pkg.dependencies['@deepseek-ai/schemastery'], 'Config needs schemastery')
})

test('every required file exists and lib/ ships only runtime modules', () => {
  for (const relative of REQUIRED_FILES) {
    assert.ok(statSync(path.join(root, relative)).isFile(), `${relative} is missing`)
  }
  for (const entry of readdirSync(path.join(root, 'lib'))) {
    assert.ok(entry.endsWith('.js'), `unexpected file in lib/: ${entry}`)
    assert.ok(pkg.files.includes('lib/*.js'), `lib/${entry} is not covered by package files`)
  }
  assert.deepEqual(
    readdirSync(path.join(root, 'tools')).filter((entry) => !entry.endsWith('.py')),
    [],
    'tools/ holds the Python bridges only',
  )
})

test('the bundle patch inserts the telegrapher row by package name', () => {
  const patch = read('cordis.patch.yml')
  assert.match(patch, /^-\s+insert:/m)
  assert.match(patch, /^\s+-\s+id:\s+telegrapher$/m)
  assert.match(patch, new RegExp(`^\\s+name:\\s+${pkg.name}$`, 'm'))
})

test('locale resources carry display metadata', () => {
  for (const locale of ['en', 'ru']) {
    const meta = JSON.parse(read(`locale/${locale}.json`)).meta
    assert.equal(typeof meta.title, 'string', `${locale} title`)
    assert.ok(meta.title.length > 0, `${locale} title is empty`)
    assert.equal(typeof meta.description, 'string', `${locale} description`)
    assert.ok(meta.description.length > 0, `${locale} description is empty`)
    assert.equal(meta.description.includes('<'), false, 'display HTML stays out of metadata')
  }
})

test('the license names the copyright holder and leaves no placeholder', () => {
  const license = read('LICENSE')
  assert.match(license, /Apache License/)
  assert.match(license, /Copyright 2026 Baranov Grigoriy Vladimirovich/)
  assert.equal(license.includes('[yyyy]'), false, 'the appendix placeholder is filled in')
  assert.match(read('NOTICE'), /Copyright 2026 Baranov Grigoriy Vladimirovich/)
})

test('the icon is an original SVG below the display size limit', () => {
  const icon = read('icon.svg')
  assert.match(icon, /^<svg[\s>]/)
  assert.ok(Buffer.byteLength(icon) < 256 * 1024, 'icon exceeds 256 KiB')
  assert.equal(/<image\b/.test(icon), false, 'the icon must be vector, not an embedded raster')
  assert.equal(/href=|url\(/.test(icon), false, 'no external references')
})

test('documentation links DeepSeek Harness and tiktoken', () => {
  for (const doc of ['README.md', 'README.ru.md']) {
    const text = read(doc)
    assert.match(text, /https:\/\/www\.deepseek\.com\/en\/harness\//, `${doc} links DeepSeek Harness`)
    assert.match(text, /tiktoken/, `${doc} names tiktoken`)
    assert.match(text, /pip install tiktoken/, `${doc} explains how to install tiktoken`)
  }
})

test('the language policy is documented from the catalogue and linked', async () => {
  const { RULES_BY_ID } = await import('../lib/catalogue.js')
  const doc = read('docs/language.md')
  for (const id of ['core-language-user', 'core-language-internal']) {
    const rule = RULES_BY_ID.get(id)
    assert.ok(rule, `${id} is missing from the catalogue`)
    assert.ok(doc.includes(rule.text), `docs/language.md must quote ${id} verbatim`)
  }
  assert.match(doc, /plans? .*approv/i, 'the plan rule is documented')
  assert.match(doc, /answer options/i, 'the question rule is documented')
  for (const doc of ['README.md', 'README.ru.md']) {
    assert.match(read(doc), /docs\/language\.md/, `${doc} links the language policy`)
  }
})

test('the changelog documents the current version', () => {
  assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${pkg.version.replaceAll('.', '\\.')}\\]`))
})

test('the plugin entry point exports the Host plugin contract', async () => {
  const module = await import('../index.js')
  assert.equal(typeof module.apply, 'function')
  assert.equal(module.name, 'telegrapher')
  assert.deepEqual(module.inject, ['systemPrompt'])
  assert.equal(module.Config?.type, 'object', 'the settings service reads Config')
})

test('the Python bridge declares its protocol', () => {
  const script = read('tools/tiktoken_server.py')
  assert.match(script, /tiktoken/)
  assert.match(script, /--serve/)
  assert.match(script, /--probe/)
  assert.match(script, /disallowed_special/)
})
