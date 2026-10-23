# Contributing

Thanks for improving dsh-telegrapher. This plugin is small on purpose: a rule
catalogue, pure detectors, one analysis pipeline and one tool. Keep it that way.

## Ground rules

- **A rule is a measurement, not an opinion.** Every rendered prompt line needs a
  detector in `lib/detect.js`, a claim in the catalogue and a fixture test. A line
  that no detector can price does not go into `RENDERED`.
- **Never rewrite inside a ``` fence.** Code, logs and commands stay verbatim.
  A detector that trims substance is a bug.
- **A detector is pure.** No filesystem, no clock, no Host services. It receives a
  unit and returns `{ before, after, matches }` or nothing.
- **Say what the numbers are.** Potential savings are not achieved savings; the
  empirical comparison is observational. Do not round that away in docs, UI copy
  or commit messages.
- **The language policy is a guard, not a preference.** User-facing text follows
  the user's language; thinking, tool calls and internal notes stay English.
  Changing it means editing `docs/language.md` and the two catalogue rules
  together.
- **Docs are part of the change.** A new rule, a threshold or a route updates
  `docs/` in the same commit; `docs/` describes behavior, so a stale sentence is
  a bug.
- **Do not edit `node_modules` or installed plugin copies.** Sources only.

## Development loop

```bash
npm ci
npm test                 # everything; the tiktoken suite skips without tiktoken
npm run test:unit        # no Python required
npm run test:integration # the Python bridge, when tiktoken is installed
npm run pack:check
```

The repository has no build step. Host code is ESM served as-is; the browser half
is an ES5-ish factory module loaded by `window.__ModuleLoader__`.

Before trusting a new detector, run it against real sessions:

```bash
node scripts/analyze-sessions.mjs --sessions 50
```

The script reads `$DSH_HOME/sessions` directly (Node 22.15+ for zstd) and prints
the same report the plugin serves.

## Adding a rule

1. Add an entry to `lib/catalogue.js`:

   ```js
   {
     id: 'response-no-trailing-prompt',
     section: 'response',
     tier: 'lean',
     text: 'No trailing prompt for the next turn.',
     detectors: ['trailing-prompt'],
     channel: 'output',
     confidence: 'exact',
     claim: 'A trailing prompt costs tokens and the user did not ask for it.',
   }
   ```

   Use `confidence: 'potential'` when following the rule needs a model choice
   (a unique anchor, an edit instead of a write): those figures are upper bounds.

2. Implement the detector in `lib/detect.js` and register it in `DETECTORS`.
   Use `rewriteProse` so fences are never touched.

3. Add a fixture test to `test/detect.test.mjs`. `test/catalogue.test.mjs`
   enforces the invariants: unique ids and texts, one owner per detector, every
   detector implemented, no prompt line longer than 200 characters.

4. Run `npm run test:unit` and the analysis script. If the rule does not pay for
   its own prompt line on the corpus, put it in `mode: full` rather than `lean`,
   or leave it out.

## Adding a control

A rejected move is a catalogue entry with `status: 'rejected'`, `text: null` and
a `why`. Its detector measures the counterfactual, and the ledger reports it as
`refuted` when the saving is zero. Controls keep the method honest; add one when
you want to disprove a popular claim rather than assert it.

## Commit messages

Conventional Commits, one logical change per commit:

```text
feat(rules): add the trailing-prompt rule and its detector
fix(analysis): skip sessions above the size ceiling
docs: correct the bootstrap threshold in README.ru.md
test(detect): cover the reprint detector
```

The subject is imperative, lower-case and under 72 characters; the body explains
the measurement behind the change. Version bump goes in `package.json`,
`CHANGELOG.md` and nowhere else.

## Review checklist

- [ ] `npm test` passes on Node 20 and 24.
- [ ] The changed rule is visible in the report with occurrences and tokens.
- [ ] No fence, path, identifier or error string is altered by a detector.
- [ ] Config fields are `.volatile()` and read through `snapshot()` on every use.
- [ ] The Settings page still works with `mode: off` and `analysis: false`.
- [ ] README and README.ru.md describe the same behavior.
