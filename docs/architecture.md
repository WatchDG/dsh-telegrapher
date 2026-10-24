# Architecture

The plugin is one DSH bundle with three halves: a Host entry that owns the prompt
section, the analysis service and the routes; a browser module that renders the
settings page; and a local Python process that runs `tiktoken`.

```text
                        ┌──────────────────────────────────────────────┐
 DSH Host               │ dsh-telegrapher                              │
 ─────────              │                                              │
 systemPrompt ─────────▶│ lib/rules.js ── lib/catalogue.js             │
                        │        │                                     │
 sessionQuery ─────────▶│ lib/analysis.js ── lib/digest.js             │
 sessionPersistence ───▶│        │              lib/detect.js          │
                        │        │                                     │
                        │        ├─ lib/tiktoken.js ────┐              │
 tools ◀────────────────│ lib/tool.js                  │              │
 webServer ◀────────────│ lib/plugin.js                │              │
                        └──────────────────────────────┼──────────────┘
                                                       ▼
                       Settings page ◀── client.js   Python: tiktoken
```

## Modules

| File | Responsibility |
|---|---|
| `index.js` | Host entry point. Exports `apply`, `name`, `inject`, `Config`. Owns the prerequisite note for tiktoken. |
| `lib/config.js` | Schemastery `Config`, constants, `normalizeConfig` and the volatile `snapshot()`. |
| `lib/catalogue.js` | The rule list: text, tier, detector ids, claim, confidence, rejected controls. Also derives `RENDERED`, `RULES_BY_ID` and the detector→rule map. |
| `lib/rules.js` | Compiles the section for the current mode and places it after the shell tools' guidance. |
| `lib/digest.js` | One pass over a session log: usage, units with context, calls, treatment flag. |
| `lib/detect.js` | Pure detectors; a rewrite or nothing. Never edits a fence. |
| `lib/words.js` | Word and phrase frequency over prose: cleaning, n-grams, BPE mass, context fragments, rule hints, fragment rewrite. |
| `lib/analysis.js` | Scan, detect, price in one batch, aggregate, attribute, compare. Holds the report cache. |
| `lib/hypotheses.js` | Ledger entries, verdict thresholds, payback, bootstrap intervals, empirical comparison helper. |
| `lib/tiktoken.js` | Tokenizer bridge and estimator fallback. |
| `lib/tool.js` | The `telegrapher` tool and its bounded text views. |
| `lib/plugin.js` | Wiring: section, counter lifetime, analysis service, routes, tool registration. |
| `client.js` | Settings → Telegrapher: behavior form, section preview, report, ledger, diagnostics. |
| `tools/tiktoken_server.py` | The Python side of the bridge. |
| `scripts/analyze-sessions.mjs` | Offline run of the same pipeline against a local session store. |

## Host composition

`lib/plugin.js` `mount(ctx, rawConfig, deps)`:

1. `readSettings = () => snapshot(rawConfig)` — every consumer re-reads the
   config; nothing is captured once.
2. The token counter is created lazily and keyed by `python`+`encoding`. Changing
   either field closes the old process, clears the section price and invalidates
   the report cache.
3. `createAnalysisService` gets a counter facade, a `getSessionQuery` thunk and a
   `getSessionPersistence` thunk, so services that appear later still work.
4. When `mode !== 'off'`, `ctx.systemPrompt.section({ name: 'telegrapher:rules', order, text })`
   registers. The order is `getSectionOrder('TOOL_PWSH') + 5` (fallback 1215).
   The text is a function, so a mode change recompiles without remounting.
5. `ctx.inject(['webServer', 'connection'], …)` registers three exact routes.
6. `ctx.inject(['tools'], …)` registers the tool. Registration is unconditional;
   with `analysis: false` the tool answers that analysis is disabled.

Disposal: one `ctx.effect` closes the tokenizer process; route and tool
registrations use `child.effect` and are disposed with the plugin.

## Routes

All routes are behind the Host's browser-trust check
(`connection.requestRejection`), then a method check.

| Route | Method | Answer |
|---|---|---|
| `/telegrapher/status` | GET | Live config, compiled section text and its token price, tokenizer state, scan cache state, tool name. |
| `/telegrapher/report` | GET | `{ ok, reason, report, ledger, section }`; `?force=1` drops the cache first. |
| `/telegrapher/scan` | POST | Invalidates the cache and rescans. |

`getView()` joins the report with the ledger: it prices the section and every
rule line, then merges the per-rule `inputCost` into the measured statistics
before `buildLedger` runs. Both the routes and the tool call it, so they can
never disagree.

## Analysis lifecycle

`createAnalysisService` owns:

- a five-minute report cache and a single in-flight promise (concurrent readers
  share one scan);
- a scan that lists, filters, reads, digests, detects, prices and aggregates;
- `measure(texts)` for the tool's `measure` action;
- `invalidate()` and `cacheInfo()` for the routes.

The scan is sequential. Reading one session at a time keeps peak memory at one
log, and the corpus bound (100 sessions × 24 MB) keeps the scan interactive.

## Tokenizer process

The bridge starts on first use:

```text
spawn(python, ['-u', 'tools/tiktoken_server.py', '--serve', '--encoding', enc])
  env: PYTHONIOENCODING=utf-8, PYTHONUTF8=1
  → {"ready":true,"version":"0.13.0","encoding":"o200k_base"}
  ← {"id":1,"texts":["…"]}
  → {"id":1,"counts":[3]}
```

Requests are batched (512 strings / 1 M characters) and cached by an FNV-1a hash
of the string (50 000 entries). A failed request kills the process, marks the
counter as unavailable and retries after five minutes; counts fall back to the
estimator and the report says `estimate`. The Python side exits on stdin EOF, so
the Host cannot leave an orphan behind.

## Client page

`client.js` is a `window.__ModuleLoader__` factory module. It:

- registers `en`/`ru` dictionaries under `settings.telegrapher`;
- waits until the Host serves the `telegrapher` config namespace
  (`configForms.whileServed`), then registers one `settings.section` with
  `id: 'telegrapher'`, order `19.5`;
- injects `setField` and the config form, so the page writes through the same
  settings service the rest of DSH uses;
- fetches `/telegrapher/status` and `/telegrapher/report` separately, so the
  form appears while the report is still scanning;
- renders tokens with `fmtTokens`/`fmtShare` and never prints raw session
  content.

## Failure modes

| Situation | Behavior |
|---|---|
| `sessionQuery` unavailable | `/report` answers `ok: false` with the reason; rules still apply. |
| No Python / no tiktoken | Rules apply; report and ledger run on the estimator and every view says `estimate`. |
| A session cannot be read | Skipped with a reason in the report; the scan continues. |
| A session above 24 MB | Skipped before reading, with a reason. |
| Configuration read-only | The page states it and renders no controls. |
| `analysis: false` | The report explains that analysis is disabled; the tool says the same. |

## Non-goals

- No network access, no telemetry, no files written to disk.
- No modification of session logs or profile state outside the plugin's own
  config row.
- No tool-result pruning, no input-token budgeting, no prompt caching: this
  plugin measures the model's output and thinking, and leaves input-side
  economics to the Host.

## Extension points

| Want | Change |
|---|---|
| Another prompt line | `lib/catalogue.js`; add a detector or leave it a guard. |
| Another measurement | `lib/detect.js` + a fixture test; the pipeline picks it up from the catalogue. |
| Another ledger claim | `lib/hypotheses.js` (`EMPIRICAL_HYPOTHESES` or a rule claim). |
| Another settings field | `lib/config.js` (`.volatile()`), the status payload, and the client view. |
| Another view | `lib/tool.js` for agents, `client.js` for humans — never two calculators. |
