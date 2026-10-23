/**
 * dsh-telegrapher — configuration normalization and the settings schema.
 *
 * The bundle row's `config` is user-authored YAML, so every field is optional
 * and validated here, at activation, instead of at each use.
 *
 * Every mutable field is `.volatile()`: the settings service exposes only
 * volatile fields, so the Settings page can rewrite them while the plugin
 * stays loaded, and the rule compiler, the analysis routes and the tool read
 * the current value on every use via `snapshot()`.
 */

import z from '@deepseek-ai/schemastery'

/** System-prompt section name owned by this plugin. */
export const RULES_SECTION = 'telegrapher:rules'

/** Stable heading that marks a session whose prompt carried these rules. */
export const RULES_HEADING = '## Token economy (telegrapher)'

/** Prompt modes. `off` removes the section entirely. */
export const MODES = ['lean', 'full', 'off']

/** Reference BPE encoding used by tiktoken for every measurement. */
export const DEFAULT_ENCODING = 'o200k_base'

/** Encodings the Settings page offers. Any tiktoken encoding name is accepted. */
export const KNOWN_ENCODINGS = ['o200k_base', 'cl100k_base', 'p50k_base']

/** Default number of newest sessions one report scans. */
export const DEFAULT_SESSIONS = 20

/** Hard bound on `sessions`: one report must stay interactive. */
export const MAX_SESSIONS = 100

/** Per-session ceiling for a full-log read; larger sessions are skipped and reported. */
export const MAX_SESSION_BYTES = 24 * 1024 * 1024

/**
 * Runtime configuration.
 *
 * `.volatile()` is what makes the Settings page work: the settings service
 * exposes only volatile fields, and a write replaces the reference in place
 * instead of remounting the plugin.
 */
export const Config = z.object({
  mode: z.union(MODES).default('lean').volatile(),
  thinking: z.boolean().default(true).volatile(),
  analysis: z.boolean().default(true).volatile(),
  sessions: z.number().default(DEFAULT_SESSIONS).volatile(),
  encoding: z.string().default(DEFAULT_ENCODING).volatile(),
  python: z.string().default('auto').volatile(),
})

/**
 * Read one Config field, tolerating a plain value when the schema is parsed
 * without the volatile wrapper (tests, older readers).
 *
 * @param {unknown} value Stored field value or volatile reference.
 * @param {unknown} fallback Value when nothing usable is stored.
 * @returns {unknown} the stored choice.
 */
function live(value, fallback) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    try {
      const current = value.get()
      return current === undefined ? fallback : current
    } catch {
      return fallback
    }
  }
  return value === undefined ? fallback : value
}

/**
 * Unwrap volatile Config references into a plain object `normalizeConfig`
 * accepts, then normalize. Call it on every use, not once at activation.
 *
 * @param {unknown} raw Plugin Config with optional volatile references.
 * @returns {{
 *   mode: 'lean' | 'full' | 'off',
 *   thinking: boolean,
 *   analysis: boolean,
 *   sessions: number,
 *   encoding: string,
 *   python: string,
 * }}
 */
export function snapshot(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  return normalizeConfig({
    mode: live(source.mode, 'lean'),
    thinking: live(source.thinking, true),
    analysis: live(source.analysis, true),
    sessions: live(source.sessions, DEFAULT_SESSIONS),
    encoding: live(source.encoding, DEFAULT_ENCODING),
    python: live(source.python, 'auto'),
  })
}

/**
 * Normalize the loader row's config.
 *
 * @param {unknown} raw Value from the bundle row (`config` in the patch layer).
 * @returns {{
 *   mode: 'lean' | 'full' | 'off',
 *   thinking: boolean,
 *   analysis: boolean,
 *   sessions: number,
 *   encoding: string,
 *   python: string,
 * }}
 */
export function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const mode = MODES.includes(source.mode) ? source.mode : 'lean'
  const sessions =
    Number.isFinite(source.sessions) && source.sessions > 0
      ? Math.min(Math.floor(source.sessions), MAX_SESSIONS)
      : DEFAULT_SESSIONS
  const encoding =
    typeof source.encoding === 'string' && source.encoding.trim() !== ''
      ? source.encoding.trim()
      : DEFAULT_ENCODING
  const python =
    typeof source.python === 'string' && source.python.trim() !== '' ? source.python.trim() : 'auto'
  return {
    mode,
    thinking: source.thinking !== false,
    analysis: source.analysis !== false,
    sessions,
    encoding,
    python,
  }
}
