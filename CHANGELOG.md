# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-10-24

### Added

- **Word and phrase analysis (`lib/words.js`)** — ranks words and 1–3-word
  phrases by length, occurrences and BPE token mass over visible reply text and
  reasoning prose, with code fences, inline code, URLs and paths stripped first.
  Each term keeps up to five session fragments, a stopword flag and a hint
  (`exclude`, `shorten`, `rephrase`) from the filler dictionary; the module also
  rewrites a fragment for a candidate rule.
- **Words workbench in Settings → Telegrapher** — filters by channel, text slice
  (after the active rules or raw), unit length, character and BPE length; sorts
  by token mass or length, searches terms, hides stopwords, shows only flagged
  candidates. Picking a term opens its fragments, a draft rule line and a
  detector pattern, and prices the candidate rewrite with tiktoken against the
  term's corpus mass and payback.
- **`words` action for the agent tool** and matching `--words`, `--min-chars`,
  `--max-chars`, `--min-tokens`, `--channel`, `--candidates` and `--query` flags
  for `scripts/analyze-sessions.mjs`.
- **Rewrite pricing route** — `GET /telegrapher/report?before=…&after=…` returns
  exact tiktoken counts and the delta for a candidate rewrite, optionally with
  the tokens of the rule line (`ruleText`).
- **`run_code` coverage** — `tools-no-banner-comments` and `tools-description`
  price `run_code` arguments (`code`, `program`), and sink attribution treats
  `run_code` as a covered tool.

### Changed

- **`core-narration` reads step narration** — on a unit that calls tools, the
  detector drops a whole short status line that names the next step ("Now update
  the route", "Проверяю тесты") and a trailing narration clause after a dash or
  a sentence break, keeping the leading fact.
- **`thinking-no-narration` and `thinking-no-meta`** — the lead-in patterns
  accept more verbs (clean, generate, review, restore, draft, write, edit,
  update) and more separators; discourse markers "actually", "basically" and
  "essentially" are stripped, as are "carefully" and "thoroughly" qualifiers.
- **`core-filler`** — "it is worth noting that", "worth noting that",
  "соответственно", "непосредственно" and "фактически".

## [1.2.0] — 2026-10-23

### Added

- **`thinking-no-narration` rule and detector** — a `lean` thinking guard for
  intent lead-ins ("Let me check X", "I'll read Y") and, on a unit that calls
  tools, for whole lines that announce the upcoming call; the catalogue grows to
  44 detectors.
- **Interjections read as apologies** — the `apology` detector also removes
  "Oops", "Whoops", "My bad", "Упс" and "Ой" from prose before the fix.

### Changed

- **`thinking-no-meta` promoted to `lean`** — reworded around self-talk and
  interjections; the `thinking-filler` detector strips standalone "wait", "hmm"
  and "oops" pivots mid-reasoning, not only openers.
- **`narration` accepts "Lets me"** — the misspelt lead-in is treated like
  "Let me", so the sentence still loses its intent clause.
- **Section prices** — `lean` now costs 437 tokens per request (was 390) and
  `full` 903 (was 868) on `o200k_base`.

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
