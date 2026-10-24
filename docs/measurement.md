# Measurement

There are two questions, and the plugin keeps the answers apart:

1. **Attributable** — how many tokens would this rule have saved on the replies
   that were actually written? Deterministic, priced with a tokenizer, an upper
   bound on what following the rule can save.
2. **Empirical** — did sessions whose prompt carried the rules use fewer tokens
   per step than sessions whose prompt did not? Observational, with a bootstrap
   interval.

A rule can be supported by the first and still not change behavior; only the
second speaks about behavior, and only when the corpus has both groups.

## The scan

`lib/analysis.js` reads stored sessions through the Host:

1. `sessionQuery.listSessions()` returns live and persisted sessions; the scan
   sorts them by `createdAt` and takes the newest `sessions` (default 20, max
   100).
2. `sessionPersistence.list()` (when available) supplies `sizeBytes` and
   `formatStatus`. Sessions above 24 MB or in an older format are skipped and
   reported with a reason.
3. `sessionQuery.readSession(id)` replays one log; each read has a 60 second
   timeout, and a failure skips that session instead of failing the report.

A report is cached for five minutes. **Rescan** in the settings page, or
`POST /telegrapher/scan`, drops the cache.

## The digest

`lib/digest.js` makes one pass over the events and produces:

- usage totals, turns, assistant messages, model and provider;
- **units** — every visible text block and every reasoning block, with the
  context a detector needs: whether the message also called tools, the tool
  result that immediately preceded it, earlier text (capped at 400 K
  characters), code lines written so far (capped at 30 000), the turn's commands
  and the current working directory;
- **calls** — every tool call with parsed arguments and its raw argument string;
- whether the session's system prompt contained the section heading (the
  treatment flag).

Detection runs inside that pass, through callbacks, so a detector never sees code
lines written after the message it inspects.

## Detectors

[`lib/detect.js`](../lib/detect.js) holds 44 pure detectors. A detector receives
a unit (or a session, for the seven session-scope detectors) and returns the text
as the rule would have written it, or nothing. The rules it follows:

- Never rewrite inside a ``` fence. Code, logs and commands stay verbatim.
- Every rewrite must be one the rule really asks for; a detector that trims
  content is a bug.
- No filesystem, clock or Host service access.

Scope:

| Scope | Detectors |
|---|---|
| text block | `filler`, `recap`, `offer`, `restate`, `reprint`, `next-steps`, `before-after`, `wrapper`, `command-quote`, `narration`, `tool-echo`, `markup`, `table`, `terminal-period`, `fence-lang`, `comma-path`, `verbose-done`, `apology`, `short-list`, `plain-backticks`, `duplicate-url-link`, `repeat-paragraph`, and the four controls (`blank-lines`, `invented-abbrev`, `causal-arrow`, `em-dash`) |
| reasoning block | `thinking-echo`, `thinking-code-draft`, `thinking-narration`, `thinking-filler`, `thinking-rederive`, `thinking-plan` |
| one tool call | `edit-anchor`, `cd-prefix`, `tool-description`, `banner-comments`, `shell-separators` |
| whole session | `path-repeat`, `repeat-write`, `identical-edits`, `adjacent-edits`, `repeat-read`, `template-writes`, `hot-command` |

## Pricing

Every `before` and `after` string from the scan goes into one batch to the
tokenizer bridge. The saving of one hit is

```text
(tokens(before) − tokens(after)) × units
```

where `units` is the number of independent savings the same rewrite stands for
(a path repeated five times saves four times; an identical edit repeated three
times saves twice). Counts are exact integers; no rounding happens until the
report is formatted.

The tokenizer is [tiktoken](https://github.com/openai/tiktoken) in a long-lived
Python process, addressed over newline-delimited JSON ([`tools/tiktoken_server.py`](../tools/tiktoken_server.py)).
The default encoding is `o200k_base`. The bridge forces UTF-8 on both sides: a
Windows console code page would silently mangle Cyrillic into mojibake and
inflate every Russian count.

When Python or tiktoken is missing, [`lib/tiktoken.js`](../lib/tiktoken.js) falls
back to a script-aware estimator and every report says `estimate`, not `exact`.
The estimator is calibrated on 160 real reply and reasoning blocks: mean
estimate/exact ratio 1.05, 10–90% band 0.84–1.27. It is a fallback, never the
preferred number.

## Aggregation and attribution

- Per rule: occurrences, distinct sessions, tokens, up to three short snippets.
- Per sink: text, thinking and tool-argument tokens. These are BPE masses, not
  the model's own count.
- **Attribution** allocates the recorded `usage.outputTokens` by those masses:
  `share_kind × outputTokens`. The report labels it as an allocation.
- Per tool: argument tokens and call count, sorted.

Reasoning is measured from the stored reasoning blocks because the recorded
usage in these logs carries no separate reasoning-token field.

## The ledger

`lib/hypotheses.js` turns measured statistics into entries with a verdict.

Rule verdict thresholds:

| Condition | Verdict |
|---|---|
| fewer than 3 occurrences | `unmeasured` |
| occurrences ≥ 3 but fewer than 3 sessions | `inconclusive` — "needs 3 before it counts" |
| ≥ 3 sessions, ≥ 1 token per occurrence and ≥ 20 tokens total | `supported` |
| ≥ 3 sessions and no positive saving | `refuted` |

Controls (`status: 'rejected'`) are refuted when the measured saving is under one
token per occurrence: the move they describe does not save what it claims. When a
control survives measurement, the ledger says so — that is a finding, not a bug.

Every rendered rule is also priced against its own prompt line:

```text
payback = (measured tokens ÷ scanned sessions) ÷ tokens of the rule's line
```

A rule below `1×` costs more prompt than it saves per session; the report shows
it and the README keeps one such example (`core-hoist`).

Uncovered sinks: a tool whose arguments are at least 5% of measured output and
which no rule targets becomes a proposal, with the share in the claim. This is
how the corpus suggests a hypothesis nobody wrote yet.

## The empirical comparison

H1 (output tokens per assistant step) and H2 (reasoning tokens per assistant
step) compare two groups:

- root sessions only (subagents compose their prompt differently);
- at least five assistant messages;
- one model, chosen as: a model with both groups; else the newest model that
  carries the rules; else the largest corpus;
- at least three sessions per group.

The statistic is the difference of medians, with a 95% bootstrap interval
(2 000 resamples, `alpha = 0.05`, fixed seed, so a report is reproducible). For
both hypotheses lower is better, so a supported claim needs the interval's upper
bound below zero and at least a 5% improvement. An interval entirely on the
other side refutes the claim; an interval spanning zero is `inconclusive`. The
ledger always prints `n`, the medians and the method.

This is observational: prompt text, task type and session length are not
controlled. The report says so, and the ledger marks the confidence as
`observational`.

## What the numbers may not claim

- **Potential is not achieved.** A rule's number prices a rewrite on text that
  exists; it does not prove a model follows the rule.
- **Potentials overlap.** A repeated wide edit is both an anchor and a repeat;
  the report labels a sum a sum.
- **BPE mass is not usage.** Attendance is recorded usage; the split inside it is
  an allocation by tokenizer mass.
- **Encoding dependence.** Deltas are tokenizer-relative; a different encoding
  changes absolute counts and can change a verdict near a threshold.
- **Input tokens are out of scope** except for guards that name them
  (`tools-read-scope`, `tools-quiet-flags`). This plugin does not measure tool
  results.

## Reproducing

| Where | How |
|---|---|
| Settings page | Open **Settings → Telegrapher**, then **Rescan**. |
| Agent | `telegrapher` tool, `action: summary` / `rules` / `hypotheses` / `sessions` / `session` / `audit` / `words` / `measure`. |
| Offline | `node scripts/analyze-sessions.mjs --sessions 50 [--json] [--words 20] [--min-chars 4] [--candidates]` against `$DSH_HOME/sessions` (Node 22.15+ for zstd). |
| Tests | `npm run test:unit` for thresholds and fixtures; `npm run test:integration` for the bridge. |

The corpus results measured with this pipeline are in
[../README.md](../README.md#measured-on-a-real-corpus).
