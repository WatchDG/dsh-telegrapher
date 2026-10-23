# Rules

The prompt section is compiled from a catalogue. A rule is a prompt line, a
claim about what it saves, and — usually — the detector that prices the claim on
real sessions.

## The catalogue

[`lib/catalogue.js`](../lib/catalogue.js) is the single source for the prompt
text and the hypothesis ledger. Each entry has:

| Field | Meaning |
|---|---|
| `id` | Stable key; the ledger, the tests and the docs refer to it. |
| `section` | One of `core`, `response`, `markdown`, `status`, `tools`, `thinking`, `cross-turn`. It groups the rule in `mode: full` and orders the lean section. |
| `tier` | `lean` — in every prompt by default. `full` — only in `mode: full`. |
| `text` | The prompt line. `null` for measurement-only controls. |
| `detectors` | Detector ids in [`lib/detect.js`](../lib/detect.js); empty for a guard. |
| `channel` | `output`, `thinking`, `tool` or `input`: where the rule acts. |
| `confidence` | `exact` when the rewrite is deterministic; `potential` when following the rule needs a model choice (a unique anchor, an edit instead of a write), so the figure is an upper bound. |
| `claim` | The sentence the ledger evaluates. |
| `status` / `why` | `rejected` marks a measured control; `why` records the evidence that rejected it. |

Three kinds of entry:

- **Measured rule** — has a detector. The ledger reports occurrences, tokens,
  sessions and a verdict.
- **Guard** — no detector. It shapes behavior that this plugin cannot price from
  the outside (language routing, substance, quiet flags) or that affects input
  tokens, not output. The ledger does not list guards: they are not claims.
- **Control** — `status: 'rejected'`, never rendered, has a detector. It exists
  so the method can measure a popular move and refute it on the corpus. Blank
  lines between list items, invented abbreviations and causal arrows are the
  current three.

## Compilation

`lib/rules.js` compiles the section for the current settings:

| Setting | Effect |
|---|---|
| `mode: lean` | Heading, one framing line, then every `lean` rule as a bullet. No section headings. |
| `mode: full` | Same, plus `full` rules, grouped under `### Core`, `### Response`, … |
| `mode: off` | No section at all. |
| `thinking: false` | Drops the `thinking` section rules; language, substance and output rules stay. |

The section is placed right after the shell tools' guidance
(`getSectionOrder('TOOL_PWSH') + 5`, fallback order 1215).

Costs on the reference tokenizer (`tiktoken` `o200k_base`): **lean 318 tokens**,
**full 764 tokens** per request. The ledger prints the price of each line and the
saving it measured, so a line that does not pay for itself is visible.

## The default (lean) section

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
- Thinking is billed output: cut restatement and re-derivation, never depth.
- Don't narrate a tool result in thinking.
```

Language routing is documented on its own page: [language.md](language.md).

## Catalogue inventory

Ids, tiers and kind. Generated from the catalogue; when this table and the code
disagree, the code wins.

### Core (`core`)

| Rule | Tier | Kind |
|---|---|---|
| `core-language-user` | lean | guard — no detector |
| `core-language-internal` | lean | guard — no detector |
| `core-substance` | lean | guard — no detector |
| `core-filler` | lean | measured — `filler` |
| `core-narration` | lean | measured — `narration` |
| `core-factor` | full | guard — no detector |
| `core-abbrev` | full | guard — no detector |
| `core-alias` | full | measured — `path-repeat` |
| `core-hoist` | full | measured — `hot-command` |
| `control-abbrev` | full | control — never rendered |
| `control-arrow` | full | control — never rendered |

### Response (`response`)

| Rule | Tier | Kind |
|---|---|---|
| `response-answer-first` | lean | measured — `recap` |
| `response-closing` | lean | measured — `offer` |
| `response-no-restate` | lean | measured — `restate` |
| `response-reference` | lean | measured — `reprint` |
| `response-no-next-steps` | lean | measured — `next-steps` |
| `response-edit-line` | full | measured — `before-after` |
| `response-bare-value` | full | measured — `wrapper` |
| `response-no-command-quote` | full | measured — `command-quote` |
| `response-one-example` | full | guard — no detector |
| `response-done` | full | guard — no detector |

### Markdown (`markdown`)

| Rule | Tier | Kind |
|---|---|---|
| `markdown-markup` | lean | measured — `markup` |
| `markdown-tables` | full | measured — `table` |
| `markdown-lists` | full | guard — no detector |
| `markdown-backticks` | full | guard — no detector |
| `markdown-path-sep` | full | measured — `comma-path` |
| `markdown-terminal-period` | full | measured — `terminal-period` |
| `markdown-fence-lang` | full | measured — `fence-lang` |
| `control-blank-lines` | full | control — never rendered |

### Status (`status`)

| Rule | Tier | Kind |
|---|---|---|
| `status-template` | lean | measured — `tool-echo` |

### Tool calls (`tools`)

| Rule | Tier | Kind |
|---|---|---|
| `tools-edit-anchor` | lean | measured — `edit-anchor` |
| `tools-edit-not-write` | lean | measured — `repeat-write` |
| `tools-replace-all` | full | measured — `identical-edits` |
| `tools-no-cd` | full | measured — `cd-prefix` |
| `tools-description` | full | measured — `tool-description` |
| `tools-read-scope` | full | guard — no detector |
| `tools-quiet-flags` | full | guard — no detector |
| `tools-generator` | full | guard — no detector |

### Thinking (`thinking`)

| Rule | Tier | Kind |
|---|---|---|
| `thinking-billed` | lean | guard — no detector |
| `thinking-echo` | lean | measured — `thinking-echo` |
| `thinking-rederive` | full | measured — `thinking-rederive` |
| `thinking-plan` | full | guard — no detector |

### Across turns (`cross-turn`)

| Rule | Tier | Kind |
|---|---|---|
| `cross-turn-echo` | full | guard — no detector |
| `cross-turn-dedupe` | full | measured — `repeat-paragraph` |
| `cross-turn-yesno` | full | guard — no detector |

## Adding a rule

1. Add the catalogue entry with its claim, tier and detector id (or none, for a
   guard). Use `confidence: 'potential'` when the rule depends on a model choice.
2. Implement the detector in `lib/detect.js`; it returns the rewritten text or
   nothing, never touches a ``` fence, and stays pure.
3. Add a fixture test in `test/detect.test.mjs`. The catalogue tests enforce
   unique ids and text, one owner per detector, a prompt line of at most 200
   characters, and the language-rule ordering.
4. Run `node scripts/analyze-sessions.mjs --sessions 50` and read the ledger. If
   the line does not pay for itself, make it `full`, not `lean`.

A rule that the corpus refutes belongs in the controls, with the measurement in
`why`, not in the prompt.
