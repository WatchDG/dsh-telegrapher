/**
 * dsh-telegrapher — plugin mounting.
 *
 * Kept separate from `index.js` so the wiring can be unit-tested with a fake
 * plugin context, a fake session store and a fake tokenizer, without a running
 * Harness.
 *
 * Three contributions, all owned by this plugin's context:
 *
 *   1. **Rules** — one system-prompt section (`telegrapher:rules`) compiled
 *      from the catalogue for the current mode.
 *   2. **Analysis** — authenticated `/telegrapher/*` routes that scan the
 *      newest stored sessions, price every rule rewrite with tiktoken and
 *      compare sessions that carried the rules with sessions that did not.
 *   3. **Tool** — one bounded `telegrapher` tool so an agent can read the same
 *      numbers and price a candidate rewrite itself.
 *
 * Config is read live: `snapshot()` unwraps volatile references on every use,
 * so the Settings page can switch mode, thinking rules, scan depth or the
 * tokenizer without remounting the plugin.
 */

import { RULES, RENDERED } from './catalogue.js'
import { RULES_SECTION, snapshot } from './config.js'
import { createAnalysisService } from './analysis.js'
import { buildLedger } from './hypotheses.js'
import { activeRules, rulesOrder, rulesText } from './rules.js'
import { createTelegrapherTool } from './tool.js'

/** Authenticated HTTP route with the live configuration and section price. */
export const STATUS_PATH = '/telegrapher/status'

/** Authenticated HTTP route with the measured report and hypothesis ledger. */
export const REPORT_PATH = '/telegrapher/report'

/** Authenticated HTTP route that drops the cache and rescans. */
export const SCAN_PATH = '/telegrapher/scan'

/** Browser-trust rejection, then method check. */
function gate(child, req, res, methods) {
  const rejection = child.connection.requestRejection(req)
  if (rejection !== undefined) {
    res.statusCode = rejection
    res.end()
    return true
  }
  if (!methods.includes(req.method)) {
    res.statusCode = 405
    res.setHeader('allow', methods.join(', '))
    res.end()
    return true
  }
  return false
}

/** Send a JSON payload with no-store caching. */
function json(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/**
 * Mount the plugin.
 *
 * @param {{
 *   logger?: { warn: (message: string) => void },
 *   systemPrompt: { section: (section: unknown) => unknown, getSectionOrder?: (name: string) => number | undefined },
 *   get?: (name: string) => unknown,
 *   effect?: (callback: () => () => unknown, label: string) => unknown,
 *   inject?: (deps: string[], callback: (child: any) => unknown) => unknown,
 * }} ctx
 * @param {unknown} rawConfig Bundle row config, possibly with volatile references.
 * @param {{ createCounter: (options: object) => object }} deps
 */
export function mount(ctx, rawConfig, deps) {
  /** Live snapshot: the Settings page may replace a field at any moment. */
  const readSettings = () => snapshot(rawConfig)
  const initial = readSettings()

  /** The tokenizer follows `python` and `encoding`; replacing it re-prices. */
  let counter = null
  let counterKey = null
  let sectionPrice = null

  const getCounter = () => {
    const settings = readSettings()
    const key = `${settings.python}\u0000${settings.encoding}`
    if (counter !== null && counterKey === key) return counter
    if (counter !== null) {
      try {
        counter.close?.()
      } catch {
        // The bridge may already be gone.
      }
    }
    counter = deps.createCounter({
      python: settings.python,
      encoding: settings.encoding,
      logger: ctx.logger,
    })
    counterKey = key
    sectionPrice = null
    analysis?.invalidate()
    return counter
  }

  const analysis = createAnalysisService({
    getSettings: readSettings,
    getSessionQuery: () => (typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined),
    getSessionPersistence: () => (typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : undefined),
    counter: {
      count: (texts) => getCounter().count(texts),
      status: () => getCounter().status(),
    },
    logger: ctx.logger,
  })

  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        try {
          counter?.close?.()
        } catch {
          // Nothing left to close.
        }
      },
      'dsh-telegrapher: tokenizer',
    )
  }

  let sectionRegistered = false
  let supportedRuleIds = null

  const ensureSection = (settings) => {
    if (sectionRegistered || settings.mode === 'off') return
    sectionRegistered = true
    ctx.systemPrompt.section({
      name: RULES_SECTION,
      order: rulesOrder(ctx.systemPrompt),
      text: () => rulesText(readSettings(), supportedRuleIds),
    })
  }

  ensureSection(initial)

  /** Price the section and every rule line once per mode/tokenizer change. */
  async function priceRules() {
    const settings = readSettings()
    ensureSection(settings)
    const disabledKey = (settings.disabled ?? []).join(',')
    const autoKey = supportedRuleIds ? [...supportedRuleIds].sort().join(',') : ''
    const key = `${settings.mode}|${settings.thinking}|${settings.encoding}|${disabledKey}|${autoKey}`
    if (sectionPrice !== null && sectionPrice.key === key) return sectionPrice.value
    const instance = getCounter()
    const lines = RENDERED.map((rule) => `- ${rule.text}`)
    const text = rulesText(settings, supportedRuleIds)
    const measured = await instance.count([text, ...lines])
    const perRule = {}
    for (let index = 0; index < RENDERED.length; index += 1) {
      perRule[RENDERED[index].id] = measured.counts[index + 1] ?? 0
    }
    const value = {
      tokens: measured.counts[0] ?? 0,
      perRule,
      exact: measured.exact,
      text,
      lines: activeRules(settings, supportedRuleIds).length,
    }
    sectionPrice = { key, value }
    return value
  }

  /**
   * The report and the ledger the routes and the tool both serve.
   *
   * @param {{ force?: boolean }} [options]
   */
  async function getView({ force = false } = {}) {
    const settings = readSettings()
    ensureSection(settings)
    const report = await analysis.report({ force })
    let ledger = []
    let section = null
    try {
      const price = await priceRules()
      section = price
      if (report.ok) {
        const stats = {}
        for (const rule of RULES) {
          const hit = report.rules?.[rule.id] ?? {
            occurrences: 0,
            sessions: 0,
            tokens: 0,
            examples: [],
            exact: true,
          }
          stats[rule.id] = {
            ...hit,
            inputCost: price.perRule[rule.id] ?? null,
            exact: hit.exact !== false && price.exact,
          }
        }
        ledger = buildLedger({ ...report, rules: stats }, RULES)
        const nextSupported = new Set(
          ledger
            .filter(
              (entry) =>
                entry.kind === 'rule' &&
                entry.status === 'supported' &&
                (entry.payback === null || entry.payback === undefined || entry.payback >= 1),
            )
            .map((entry) => entry.rule),
        )
        const prevKey = supportedRuleIds ? [...supportedRuleIds].sort().join(',') : ''
        const nextKey = [...nextSupported].sort().join(',')
        supportedRuleIds = nextSupported
        if (settings.mode === 'auto' && prevKey !== nextKey) {
          section = await priceRules()
        }
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-telegrapher: pricing failed: ${String(error?.message ?? error)}`)
    }
    return { report, ledger, section, sectionTokens: section?.tokens ?? null, settings }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer', 'connection'], (child) => {
      const routes = [
        {
          path: STATUS_PATH,
          methods: ['GET'],
          handler: async (req, res) => {
            const settings = readSettings()
            ensureSection(settings)
            let price = null
            try {
              price = await priceRules()
            } catch (error) {
              ctx.logger?.warn?.(`dsh-telegrapher: pricing failed: ${String(error?.message ?? error)}`)
            }
            json(res, 200, {
              mode: settings.mode,
              thinking: settings.thinking,
              analysis: settings.analysis,
              sessions: settings.sessions,
              encoding: settings.encoding,
              python: settings.python,
              disabled: settings.disabled,
              rules: {
                name: RULES_SECTION,
                active: settings.mode !== 'off',
                tokens: price?.tokens ?? null,
                exact: price?.exact ?? false,
                lines: price?.lines ?? activeRules(settings, supportedRuleIds).length,
                text: price?.text ?? '',
              },
              tiktoken: getCounter().status(),
              scan: analysis.cacheInfo(),
              tool: 'telegrapher',
            })
          },
        },
        {
          path: REPORT_PATH,
          methods: ['GET'],
          handler: async (req, res) => {
            const url = new URL(req.url, 'http://localhost')
            const before = url.searchParams.get('before')
            const after = url.searchParams.get('after')
            if (typeof before === 'string' && typeof after === 'string') {
              const ruleText = url.searchParams.get('ruleText') ?? ''
              const batch = ruleText ? [before, after, ruleText] : [before, after]
              const measured = await getCounter().count(batch)
              const beforeTokens = measured.counts[0] ?? 0
              const afterTokens = measured.counts[1] ?? 0
              const ruleTokens = ruleText ? (measured.counts[2] ?? 0) : null
              json(res, 200, {
                ok: true,
                rewrite: {
                  before,
                  after,
                  beforeTokens,
                  afterTokens,
                  delta: beforeTokens - afterTokens,
                  ruleTokens,
                  exact: measured.exact,
                },
              })
              return
            }
            const view = await getView({ force: url.searchParams.get('force') === '1' })
            json(res, 200, {
              ok: view.report.ok,
              reason: view.report.reason ?? null,
              report: view.report,
              ledger: view.ledger,
              section: view.section,
            })
          },
        },
        {
          path: SCAN_PATH,
          methods: ['POST'],
          handler: async (req, res) => {
            analysis.invalidate()
            const view = await getView({ force: true })
            json(res, 200, {
              ok: view.report.ok,
              reason: view.report.reason ?? null,
              report: view.report,
              ledger: view.ledger,
              section: view.section,
            })
          },
        },
      ]
      for (const route of routes) {
        child.effect(
          () =>
            child.webServer.register({
              kind: 'exact',
              path: route.path,
              handler: async (req, res) => {
                if (gate(child, req, res, route.methods)) return
                await route.handler(req, res)
              },
            }),
          `dsh-telegrapher: ${route.methods.join('/')} ${route.path}`,
        )
      }
    })

    ctx.inject(['tools'], (child) => {
      child.effect(
        () =>
          child.tools.register(
            createTelegrapherTool({
              getView,
              measure: (texts) => getCounter().count(texts),
            }),
          ),
        'dsh-telegrapher: tool',
      )
    })
  }

  return { getView, priceRules }
}
