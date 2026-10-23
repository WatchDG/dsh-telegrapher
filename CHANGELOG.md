# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/WatchDG/dsh-telegrapher/releases/tag/v1.0.0
