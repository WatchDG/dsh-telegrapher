# dsh-telegrapher

[![CI](https://github.com/WatchDG/dsh-telegrapher/actions/workflows/ci.yml/badge.svg)](https://github.com/WatchDG/dsh-telegrapher/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**English** | [Русский](README.ru.md)

Telegrapher token economy for [DeepSeek Harness](https://www.deepseek.com/en/harness/):
prompt rules that cut output and thinking tokens, and a measurement layer that
prices every rule against the sessions this Host actually stored — with
[tiktoken](https://github.com/openai/tiktoken) as the tokenizer.

The plugin does not claim savings. It injects the rules, then measures two
things: how many tokens each rule *would have saved* on real replies (potential),
and whether sessions that carried the rules used fewer tokens per step than
sessions that did not (empirical). A rule that the data refutes leaves the
ledger with a verdict, and the refutation is visible on the settings page.

## What the plugin does

### 1. Prompt rules

One system-prompt section, `telegrapher:rules`, compiled from a rule catalogue
for the configured mode:

- **lean** (default) — the language policy plus the highest-value rules for
  output, tools and thinking, 437 tokens per request on this catalogue;
- **full** — every measured rule plus section headings, 903 tokens;
- **auto** — the lean guards plus only the rules whose measured `payback >= 1×`
  on this profile's sessions (falls back to `lean` before the first scan);
- **off** — no section at all.

Rules cover the three sinks a coding session pays for: tool arguments (minimal
edit anchors, edit instead of repeated writes, `replace_all`, no `cd` prefix),
thinking (no re-derivation, no repeated plan, no narrating a tool result) and
prose (answer first, no recap, reference instead of reprint, no filler). A
substance guard stays with every mode: code, paths, commands, identifiers, error
strings and numbers are never compressed.

### Language policy

The user's language where the user reads, English everywhere else. The first two
lines of the section fix it:

- the final reply, a plan presented for approval, and a question with its answer
  options are written in the user's language;
- thinking, tool calls and their descriptions, status lines and internal notes
  are English.

The full table, the measured cost of the two languages, and the edge cases are in
[docs/language.md](docs/language.md).

The section is registered when the plugin loads; `mode: off` at load removes it
entirely, switching modes later recompiles its text.

### 2. Measured report

`Settings → Telegrapher` and the `telegrapher` tool read the same numbers, read
from stored sessions through the Host's `sessionQuery` service:

- output tokens by sink — tool arguments, thinking, reply text — attributed by
  BPE mass of the output that was actually written;
- the top tools by argument cost;
- per-rule occurrences and tokens, measured by applying the rule's own rewrite
  to real replies and pricing the difference with tiktoken;
- per-session detail, model, preset and whether the rules section was present.

### 3. Hypothesis ledger

Every rule is a claim, and the ledger holds the claim, the evidence, the sample
size and a verdict:

| Verdict | Meaning |
|---|---|
| `supported` | the rewrite saved at least one token per occurrence, in at least three sessions |
| `refuted` | the rewrite measured no saving, or sessions with the rules got worse |
| `inconclusive` | measured, below the support threshold |
| `unmeasured` | not enough occurrences in the scanned corpus |

Each rendered rule is also priced against its own prompt line: `payback` is the
measured saving per session divided by the tokens the line costs. A rule below
`1×` is visible as a line that does not pay for itself yet.

Two empirical hypotheses are evaluated whenever the corpus allows it: H1 (output
tokens per assistant step) and H2 (reasoning tokens per assistant step). The
comparison takes sessions of one model, at least five assistant messages each,
at least three sessions per group, and reports a 95% bootstrap interval. It is
observational, and the ledger says so.

The ledger also keeps measurement-only controls — moves that look like savings
and are not — so the method can refute them on this corpus instead of trusting a
claim. Blank-line removal is such a control: measured at zero savings.

## Requirements

| Requirement | Details |
|---|---|
| [DeepSeek Harness](https://www.deepseek.com/en/harness/) | 0.2.x (tested with 0.2.1-rc.2). The plugin uses `systemPrompt`, `sessionQuery` (analysis), `sessionPersistence` (size guard), `webServer` and `tools`. |
| Node.js | 20 or newer for the plugin itself. |
| Python 3 + [tiktoken](https://github.com/openai/tiktoken) | Optional. Without it the plugin still applies the rules and marks every number as an estimate. |

### Install tiktoken

```bash
py -3 -m pip install tiktoken==0.13.0     # Windows
python3 -m pip install tiktoken==0.13.0  # macOS / Linux
```

Verify the interpreter the plugin will find on `PATH`:

```bash
py -3 -c "import tiktoken; print(tiktoken.__version__)"
```

The plugin starts the interpreter lazily, keeps it alive for the Host lifetime,
and stops it on unload. Set `python` in the configuration when the interpreter
is not on `PATH`.

## Installation in DeepSeek Harness

The plugin is a bundle for the current DSH profile, so it applies to every
session of that profile.

1. Open the **Plugins** page in the DSH sidebar.
2. Choose **Add plugin** / **Install bundle**, select this directory (the one
   containing `package.json`), and confirm.
3. Make sure **Telegrapher Token Economy** is enabled in the plugin list.

The same step is available to an agent through the `plugin_manager` tool with
`action: install_bundle` and the absolute path to this directory. DSH records a
`link:` dependency on the directory, so restart DSH after updating the plugin's
files to load the Host JavaScript again.

## The default section

`mode: lean` renders exactly this (437 tokens with `o200k_base`):

```text
## Token economy (telegrapher)

These rules govern the text you write and never override correctness.
- Everything the user reads is in the user's language: the reply, a plan you ask them to approve, questions and their answer options.
- Everything else is English: thinking, tool calls and their descriptions, status lines, internal notes.
- Terse, full substance: code, paths, commands, identifiers, error strings and numbers stay exact.
- No filler, hedging or pleasantries; state each fact once.
- No tool-call narration: the call shows the intent. Status between calls is one line at most.
- Start with the answer and stop: no recap, no summary block.
- No closing offer ("if you need anything else").
- Don't restate the question.
- After an edit, don't reprint the file or re-explain the change: `file:line: essence`. Reference code already shown instead of quoting it.
- No next-steps section unless asked.
- No bold, no headings in short answers, no decorative tables or emoji.
- Report checks as `N/N pass`, `N/M fail`, `clean`; don't echo tool output.
- Minimal unique `old_string`: the changed line, one context line only on a collision.
- Edit existing files; a second write of a path already written means edit. Rewrite only for a new file or a replacement above half the content.
- `replace_all` instead of N identical edits.
- Combine adjacent edits to the same file in one turn into a single edit call.
- Shell descriptions: two to five words, active voice.
- No decorative echo/printf separators in shell commands.
- Thinking is billed output: cut restatement and re-derivation, never depth.
- Don't narrate a tool result in thinking.
- Never draft full code blocks in thinking before writing or editing: emit code once in the tool call.
- No intent or tool narration in thinking (let me, let's, I'll): state the target or emit the call.
- No self-talk or interjections in thinking (wait, hmm, oops); state checks and fixes directly.
```

The section is placed right after the shell tools' guidance. The ledger's
`payback` column is what keeps this list honest: `thinking-billed` and
`core-substance` are guards with no detector, and every other line has to earn
its tokens in the report.

## How measurement works

1. **Scan.** The newest `sessions` stored sessions are listed through
   `sessionQuery.listSessions()`, filtered by size (`sessionPersistence` when
   available, 24 MB ceiling) and read with `sessionQuery.readSession()`.
2. **Digest.** One pass extracts assistant messages with their usage, reasoning
   and reply blocks, tool calls with parsed arguments, the preceding tool
   result, earlier text, and the code lines already written in the session.
3. **Detect.** Each rule owns one detector. A detector returns the text as the
   rule would have written it — never inside a ``` fence — or nothing.
4. **Price.** Every original and every rewrite is counted in one batch by
   tiktoken; the saving is `tokens(before) - tokens(after)`.
5. **Aggregate.** Per rule: occurrences, sessions, tokens, examples. Per
   session: sink mass and per-step usage. Per tool: argument tokens.
6. **Compare.** Sessions whose system prompt carried the section are the
   treatment group; the rest are control. One model at a time, bootstrap
   interval on the difference of medians.

Two honest limits, stated in the report itself:

- **Rule savings are potential.** They price a deterministic rewrite on replies
  that were actually written; they are not proof that a model follows the rule.
  Rules marked `potential` in the catalogue depend on a model choice (an anchor
  that stays unique, an edit instead of a write), so their figure is an upper
  bound.
- **Rule potentials overlap.** Two rules can price the same text (a repeated
  wide edit is both an anchor and a repeat), so the report labels the sum as a
  sum, not a total saving.

## Measured on a real corpus

50 stored sessions of one Windows installation (DSH 0.2.1-rc.2; five model
routes; October 2026), `tiktoken` `o200k_base`, exact counts. The table holds
aggregate counts only: no session text, path, identifier or model route is
published.

| Metric | Value |
|---|---|
| Sessions / assistant steps | 50 / 5 163 |
| Recorded output tokens | 3.2 M |
| Tool arguments | 77% (1.5 M) |
| Thinking | 17% (339.2 K) |
| Reply text | 5% (101.5 K) |
| Largest single tool | `edit` 41%, `write` 26%, `pwsh` 6%, `read` 2% |
| Lean section cost | 390 tokens per request |
| Measured potential from supported rules | 108.3 K tokens (3% of output), rules overlapping |

Per rule (occurrences, tokens, verdict):

| Rule | Occurrences | Tokens | Verdict |
|---|---|---|---|
| `tools-edit-anchor` | 1 222 | 59.8 K | supported — 49 tokens per wide anchor, over 17 sessions (payback 63.0×) |
| `tools-merge-edits` | 463 | 29.4 K | supported — adjacent same-file edits in one turn, over 18 sessions (34.6×) |
| `tools-replace-all` | 37 | 7.5 K | supported — 13.6× payback |
| `thinking-no-code-draft` | 36 | 3.8 K | supported — code drafted in thinking before write/edit, over 4 sessions (3.6×) |
| `markdown-markup` | 184 | 1.6 K | supported — 2.0× payback |
| `core-alias` | 22 | 1.6 K | supported — 1.0× payback |
| `tools-no-shell-sep` | 122 | 1.1 K | supported — decorative shell separators, over 8 sessions (2.0×) |
| `tools-description` | 494 | 925 | supported — 1.5× payback |
| `core-hoist` | 7 | 607 | supported, payback 0.6× |
| `thinking-rederive` | 6 | 436 | supported |
| `response-no-next-steps` | 3 | 417 | supported |
| `core-narration` | 21 | 342 | supported |
| `tools-read-scope` | 12 | 304 | supported — repeated unchanged reads |
| `markdown-tables` | 14 | 248 | supported |
| `response-answer-first` | 4 | 220 | supported |
| `markdown-terminal-period` | 572 | 567 | inconclusive — 1.0 tokens per occurrence |
| `control-em-dash` | 524 | 0 | refuted — an em-dash and a hyphen are both one token |
| `control-arrow` | 147 | 21 | refuted — an arrow and a period are both one token |
| `control-blank-lines` | 104 | 3 | refuted — measured as no saving |
| `control-abbrev` | 3 | 0 | refuted — measured as no saving |

The arrow row is worth noting: the inherited catalogue carried "no causal arrows"
as a rule. Counted with tiktoken on this corpus, `→` is one token and `.` is one
token, so the rule saved nothing and the ledger refuted it — the same decision
the original measurement reached, now re-derived here. That is what the controls
are for.

H1 and H2 were `unmeasured` on that corpus: the plugin was not installed while
those sessions ran, so no session carried the rules. That is the first thing the
report will change after installation.

## Configuration

Every field is optional. Override the `telegrapher` row in the profile's patch
layer, or edit it live on the **Settings → Telegrapher** page.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mode` | `'lean' \| 'full' \| 'auto' \| 'off'` | `'lean'` | Prompt section mode. `auto` keeps rules with `payback >= 1×`; `off` registers no section. |
| `thinking` | boolean | `true` | Include the thinking rules. |
| `analysis` | boolean | `true` | Serve the measured report. When off, the tool answers that analysis is disabled. |
| `sessions` | number | `20` | Newest sessions one report scans (1–100). |
| `encoding` | string | `'o200k_base'` | Any tiktoken encoding name. |
| `python` | string | `'auto'` | `'auto'` or a path to a Python 3 with tiktoken. |
| `disabled` | `string[]` | `[]` | Rule ids excluded from the compiled prompt section. |

```yaml
- id: telegrapher
  config:
    mode: full
    thinking: true
    analysis: true
    sessions: 30
    encoding: o200k_base
    python: C:\Python313\python.exe
```

Reports are cached for five minutes; **Rescan** in the page (or `POST
/telegrapher/scan`) drops the cache.

## The agent tool

One tool, `telegrapher`, with an `action` switch. It is read-only and every
answer is a bounded text table:

| Action | Answer |
|---|---|
| `summary` | corpus totals, sink attribution, top tools, supported rules (sum and net), H1/H2 verdict, section cost |
| `rules` | per-rule table: occurrences, tokens, tokens per session, payback, verdict |
| `hypotheses` | the ledger: empirical claims first, then rules, then uncovered sinks |
| `audit` | payback recommendations: which rules pay back (`>= 1×`) and which lean rules are below `1×` |
| `sessions` | the newest scanned sessions with model, steps, output and thinking |
| `session` | detailed breakdown of a single session (`session` id or prefix, defaults to newest) |
| `measure` | tiktoken counts for given `texts` and `[before, after]` `pairs` |

`measure` is how an agent tests a candidate rewrite before proposing a rule:

```json
{ "action": "measure", "pairs": [["I think the issue might be in auth", "Issue in auth"]] }
```

## Verification

1. `py -3 -c "import tiktoken; print(tiktoken.__version__)"` prints a version.
2. The **Plugins** page shows **Telegrapher Token Economy** and it is enabled.
3. **Settings → Telegrapher** shows the section cost, the measured report and
   the ledger. With tiktoken installed, Diagnostics says `tiktoken 0.13.0 ·
   o200k_base`; otherwise it says `estimate only` and tells you the install line.
4. Open a new session and ask something in a verbose style: the reply should be
   terse, without a recap block or a closing offer.
5. Click **Rescan** after a few sessions: the empirical rows (H1, H2) appear once
   the corpus has three treatment and three control sessions of one model.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Report says counts are estimates | tiktoken or Python is missing, or the encoding could not be downloaded. Install tiktoken, or set `python` to the right interpreter. |
| `The analysis is unavailable: sessionQuery…` | The Host does not expose `sessionQuery`; this DSH version cannot read stored sessions for the plugin. The rules still apply. |
| H1/H2 stay `unmeasured` | No control group (every session carried the rules) or fewer than three sessions per group. It fills in by itself. |
| A large session is skipped | Sessions above 24 MB are skipped to keep the scan interactive; they are listed with a reason. |
| A rule shows `payback < 1×` | The measured saving per session is below the tokens its line costs. Use `mode: lean` or drop the rule from the catalogue. |
| Section feels expensive | `mode: lean` is 318 tokens; `mode: full` is 764. `mode: off` removes it entirely. |
| The tool reports that analysis is disabled | `analysis: false` in the configuration. |

## Development

One dependency (`@deepseek-ai/schemastery` for the settings schema), a Python
bridge, and no build step.

```bash
npm ci                   # install the settings schema library
npm test                 # unit, wiring, manifest and (when installed) tiktoken tests
npm run test:unit        # no Python or tiktoken required
npm run test:integration # tiktoken bridge; skips when tiktoken is missing
npm run pack:check       # verify the npm package contents
```

Layout:

```text
index.js              Host entry point: exports apply / name / inject / Config
client.js             Settings → Telegrapher: rules, report, ledger, diagnostics
lib/catalogue.js      rules: prompt line, detector, claim, confidence, rejected controls
lib/rules.js          section compilation and placement
lib/config.js         Config schema, defaults, normalization, volatile snapshot
lib/digest.js         session log → accounting, units with context, tool calls
lib/detect.js         pure detectors: rewrite or nothing, fences untouched
lib/tiktoken.js       tiktoken bridge (newline-delimited JSON) + estimator fallback
lib/analysis.js       scan → detect → price → aggregate → compare
lib/hypotheses.js     ledger entries, verdicts, bootstrap intervals
lib/tool.js           the agent tool and its bounded text views
tools/tiktoken_server.py  the Python side of the bridge
test/                 node:test suites (unit, wiring, manifest, tiktoken)
scripts/analyze-sessions.mjs  offline dogfood run against a local session store
```

Adding a rule:

1. Add an entry to `lib/catalogue.js` with a prompt line, a claim, a tier and a
   detector id. `confidence: 'potential'` when following the rule needs a model
   choice.
2. Implement the detector in `lib/detect.js`. It must return the rewritten text
   or nothing, must never touch a ``` fence, and must be pure.
3. Add a fixture test in `test/detect.test.mjs`; the catalogue test fails when a
   detector has no owner or a rule has no detector it can price.
4. Run `node scripts/analyze-sessions.mjs --sessions 50` to see the new rule on
   real sessions before trusting it.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [docs/language.md](docs/language.md) — the language policy: what is in the
  user's language, what is English.
- [docs/rules.md](docs/rules.md) — the catalogue, compilation, guards, controls,
  the default section.
- [docs/measurement.md](docs/measurement.md) — the scan, the detectors, tiktoken,
  the verdict thresholds and what the numbers may not claim.
- [docs/architecture.md](docs/architecture.md) — modules, routes, the tokenizer
  process, failure modes.

## Security and privacy

- The plugin performs no network access. It reads stored sessions through the
  Host's own `sessionQuery` service and runs only the local Python tiktoken
  process; that process receives only the strings being counted.
- Nothing is written to disk: no cache, no history, no ledger file. The report
  lives in Host memory and is dropped on restart.
- The report keeps up to three short snippets per rule to explain a match. They
  stay in the Host response served to the authenticated Settings page and are
  never sent anywhere else.
- tiktoken is third-party software; review
  [its repository](https://github.com/openai/tiktoken) for its behavior.

## Links

- **DeepSeek Harness** — https://www.deepseek.com/en/harness/
- **tiktoken** — https://github.com/openai/tiktoken
- **Plugin repository** — https://github.com/WatchDG/dsh-telegrapher

## License

[Apache-2.0](LICENSE), © 2026 Baranov Grigoriy Vladimirovich. tiktoken is
licensed separately by OpenAI (MIT); see its repository for details.
