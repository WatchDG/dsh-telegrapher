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
 * @param {{ mode: 'lean' | 'full' | 'off', thinking: boolean }} settings
 * @returns {import('./catalogue.js').Rule[]}
 */
export function activeRules(settings) {
  if (settings.mode === 'off') return []
  return RENDERED.filter((rule) => settings.mode === 'full' || rule.tier === 'lean').filter(
    (rule) => settings.thinking || rule.section !== 'thinking',
  )
}

/**
 * Compile the system-prompt section.
 *
 * @param {{ mode: 'lean' | 'full' | 'off', thinking: boolean }} settings
 * @returns {string} empty string when the section is disabled
 */
export function rulesText(settings) {
  const rules = activeRules(settings)
  if (rules.length === 0) return ''

  const lines = [RULES_HEADING, '', INTRO]
  if (settings.mode === 'lean') {
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
