# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-10-23

### Added

- **New tool, thinking and output rules and detectors** — `tools-merge-edits`
  (`adjacent-edits`, 29.4K tokens saved on the 50-session corpus),
  `thinking-no-code-draft` (`thinking-code-draft`, 3.8K tokens),
  `tools-no-shell-sep` (`shell-separators`, 1.1K tokens),
  `tools-no-banner-comments` (`banner-comments`), `thinking-no-meta`
  (`thinking-filler`), `response-no-apology` (`apology`), `markdown-bare-url`
  (`duplicate-url-link`), plus detectors for `tools-read-scope` (`repeat-read`),
  `tools-generator` (`template-writes`), `thinking-plan`, `markdown-lists`
  (`short-list`), `markdown-backticks` (`plain-backticks`) and `response-done`
  (`verbose-done`).
- **Em-dash control (`control-em-dash`)** — a fourth measurement-only control,
  refuted on 524 corpus occurrences (`0.0` tokens saved per occurrence in
  `o200k_base`).
- **Adaptive `mode: auto` and per-rule `disabled` list** — `auto` compiles the
  lean guards plus only the rules whose measured `payback >= 1×` on the
  profile's corpus; `disabled` excludes specific rule ids live from Settings or
  YAML.
- **Cascaded net potential and `audit`/`session` tool actions** — `analysis`
  computes non-overlapping cascaded unit savings alongside per-rule sums; the
  `telegrapher` tool adds `action: 'audit'` (payback recommendations) and
  `action: 'session'` (per-session rule breakdown), and the Settings page
  renders rule examples and per-rule toggles.

### Changed

- **Rebalanced `lean` tier** — promoted `tools-replace-all` (13.6× payback) and
  `tools-description` (1.5× payback) into `lean`, and tightened the `core-hoist`
  prompt line.

### Fixed

- **Cyrillic word boundaries in `filler` and `terminal-period`** — JavaScript's
  `\b` only matches ASCII word characters, so Russian filler phrases never
  matched and `ё`/`Ё` before a terminal period was skipped. Replaced with
  Unicode-aware boundaries (`(?![\p{L}\p{N}_])` and `/[\p{L})]\.$/u`).
- **Section token price in `telegrapher` tool summary** — `lib/tool.js` now reads
  `section.tokens` from `getView()`, and switching out of `mode: 'off'` live in
  Settings registers the prompt section without a Host restart.
- **Same-step code lines for `reprint` and `thinking-code-draft`** —
  `lib/digest.js` extracts code lines from inline `tool-call` blocks in
  `assistant/message` before inspecting the message's text and reasoning units.

## [1.0.1] — 2026-10-23

### Fixed

- **The tiktoken bridge printed its fatal payload twice.** The Python bridge
  printed the failure object and then `null`, and the second line crashed the
  readline handler with `Cannot read properties of null (reading 'ready')` on
  any Host without tiktoken — including a CI job that runs the tests without
  installing it. The failure is printed once now, exits with code 2, and the
  Node side ignores any line that is not a JSON object instead of trusting the
  tokenizer process to be well-behaved.

- **The fatal path is covered.** A test runs the bridge with an unknown encoding
  and asserts exactly one JSON line; a unit test feeds `null`, arrays, numbers
  and garbage to the line parser.

## [1.0.0] — 2026-10-23

First release.

### Added

- **Language policy** — the first two rules of the section fix the language:
  the reply, a plan presented for approval, and a question with its answer
  options are written in the user's language; thinking, tool calls and their
  descriptions, status lines and internal notes are English. Documented in
  `docs/language.md`.
- **Documentation** — `docs/` with the language policy, the rule catalogue,
  the measurement methodology and the architecture.
- **Prompt rules** — one `telegrapher:rules` system-prompt section compiled
  from a rule catalogue: `lean` (318 tokens), `full` (764 tokens), or `off`,
  with a separate switch for the thinking rules and a substance guard that keeps
  code, paths, commands, identifiers, error strings and numbers exact.
- **Measured report** — scans the newest stored sessions through
  `sessionQuery`, extracts reply, reasoning and tool-argument units, and prices
  every rule rewrite with tiktoken (`o200k_base` by default). Attribution by BPE
  mass, per-tool argument totals, per-rule occurrences and tokens.
- **Hypothesis ledger** — per-rule verdicts (`supported`, `refuted`,
  `inconclusive`, `unmeasured`), payback against the rule's own prompt line,
  empirical H1/H2 comparisons (one model, at least three sessions per group, 95%
  bootstrap interval), measurement-only controls that the method can refute, and
  proposals for sinks no rule covers.
- **Agent tool** `telegrapher` with `summary`, `rules`, `hypotheses`,
  `sessions` and `measure` actions; the last one prices arbitrary
  `[before, after]` pairs so an agent can test a candidate rewrite.
- **Settings → Telegrapher** page: mode and tokenizer form, live section cost,
  preview of the compiled section, the report, the ledger, and diagnostics.
- **tiktoken bridge** — a long-lived Python process addressed over
  newline-delimited JSON, with a script-aware estimator fallback marked as an
  estimate when Python or tiktoken is missing.
- **Offline analysis script** — `scripts/analyze-sessions.mjs` runs the same
  pipeline against a local `$DSH_HOME/sessions` store, for maintainers and
  corpus measurements.
- Apache-2.0 license, NOTICE, English and Russian READMEs, CI on Node 20/22/24
  for Linux and Windows, and a `tiktoken` CI job.

[1.0.1]: https://github.com/WatchDG/dsh-telegrapher/releases/tag/v1.0.1
[1.0.0]: https://github.com/WatchDG/dsh-telegrapher/releases/tag/v1.0.0
