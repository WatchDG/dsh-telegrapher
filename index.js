/**
 * dsh-telegrapher — Telegrapher token economy for DeepSeek Harness.
 *
 * Three contributions, all owned by this plugin's context:
 *
 * 1. **Rules** — one system-prompt section (`telegrapher:rules`) compiled from
 *    the rule catalogue for the configured mode. The lean mode is the default:
 *    output and thinking rules that pay for their own prompt line.
 * 2. **Analysis** — scans the newest stored DSH sessions, prices every rule
 *    rewrite with tiktoken (`o200k_base` by default) and compares sessions that
 *    carried the rules with sessions that did not.
 * 3. **Tool** — one bounded `telegrapher` tool so an agent can read the report,
 *    the hypothesis ledger, or price a candidate rewrite itself.
 *
 * Config (all optional, read from the bundle row, editable live from the
 * Settings page thanks to volatile fields):
 *
 *   mode       'lean' | 'full' | 'off'  prompt rules (default 'lean')
 *   thinking   boolean                  include the thinking rules (default true)
 *   analysis   boolean                  session analysis routes and tool (default true)
 *   sessions   number                   newest sessions per report (default 20, max 100)
 *   encoding   string                   tiktoken encoding (default 'o200k_base')
 *   python     'auto' | path            Python executable for tiktoken (default 'auto')
 *
 * `tiktoken` is an optional prerequisite: without it the plugin still loads,
 * the rules still apply, and every measured number is marked as an estimate.
 * Install with `py -3 -m pip install tiktoken==0.13.0`.
 */

import { Config } from './lib/config.js'
import { mount } from './lib/plugin.js'
import { createTokenCounter } from './lib/tiktoken.js'

/**
 * Activate the plugin for one profile context.
 *
 * @param {object} ctx Plugin context supplied by the DSH loader.
 * @param {unknown} config Bundle row config.
 */
export function apply(ctx, config) {
  mount(ctx, config, { createCounter: createTokenCounter })
}

export { Config }
export const name = 'telegrapher'
export const inject = ['systemPrompt']
