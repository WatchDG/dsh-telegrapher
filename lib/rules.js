/**
 * dsh-telegrapher — prompt-section compilation.
 *
 * The section is compiled from the catalogue and the live settings, so it
 * never advertises a mode the user turned off, and never carries a rule that
 * the measurement side does not know about.
 *
 * Placement: right after the shell tools' guidance, where the model reads how
 * to act, not as a separate policy block at the end.
 */

import { RULES_HEADING, RULES_SECTION } from './config.js'
import { RENDERED, SECTIONS } from './catalogue.js'

export { RULES_HEADING, RULES_SECTION }

/** One-line framing; the language rules are catalogue entries, not framing. */
const INTRO = 'These rules govern the text you write and never override correctness.'

/**
 * Rules active for the current settings, in catalogue order.
 *
 * In `mode: 'auto'`, once a corpus measurement has identified rules that pay
 * back (`supportedIds` non-empty), the section keeps the lean guards plus every
 * rule in `supportedIds` (whether `lean` or `full`). Before the first scan,
 * `auto` falls back to `lean`.
 *
 * @param {{ mode: 'lean' | 'full' | 'auto' | 'off', thinking: boolean, disabled?: string[] }} settings
 * @param {Iterable<string> | null} [supportedIds]
 * @returns {import('./catalogue.js').Rule[]}
 */
export function activeRules(settings, supportedIds = null) {
  if (!settings || settings.mode === 'off') return []
  const disabled = new Set(Array.isArray(settings.disabled) ? settings.disabled : [])
  const supported =
    supportedIds instanceof Set
      ? supportedIds
      : Array.isArray(supportedIds)
        ? new Set(supportedIds)
        : null
  const useAuto = settings.mode === 'auto' && supported !== null && supported.size > 0
  return RENDERED.filter((rule) => {
    if (disabled.has(rule.id)) return false
    if (!settings.thinking && rule.section === 'thinking') return false
    if (settings.mode === 'full') return true
    if (useAuto) return (rule.detectors.length === 0 && rule.tier === 'lean') || supported.has(rule.id)
    return rule.tier === 'lean'
  })
}

/**
 * Compile the system-prompt section.
 *
 * @param {{ mode: 'lean' | 'full' | 'auto' | 'off', thinking: boolean, disabled?: string[] }} settings
 * @param {Iterable<string> | null} [supportedIds]
 * @returns {string} empty string when the section is disabled
 */
export function rulesText(settings, supportedIds = null) {
  const rules = activeRules(settings, supportedIds)
  if (rules.length === 0) return ''

  const lines = [RULES_HEADING, '', INTRO]
  if (settings.mode === 'lean' || settings.mode === 'auto') {
    for (const rule of rules) lines.push(`- ${rule.text}`)
    return lines.join('\n')
  }

  for (const section of SECTIONS) {
    const texts = rules.filter((rule) => rule.section === section.id)
    if (texts.length === 0) continue
    lines.push('', `### ${section.title}`)
    for (const rule of texts) lines.push(`- ${rule.text}`)
  }
  return lines.join('\n')
}

/**
 * Place the section right after the shell tools' guidance.
 *
 * @param {{ getSectionOrder?: (name: string) => number | undefined } | undefined} systemPrompt
 * @returns {number}
 */
export function rulesOrder(systemPrompt) {
  for (const name of ['TOOL_PWSH', 'TOOL_BASH', 'TOOL_SHELL']) {
    const order = systemPrompt?.getSectionOrder?.(name)
    if (Number.isFinite(order)) return order + 5
  }
  return 1215
}
