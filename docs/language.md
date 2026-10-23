# Language policy

The plugin fixes one language policy for every session in the profile: the user's
language where the user reads, English everywhere else.

Two catalogue rules carry it. They are `tier: lean`, so they are in the default
section, and they are the first two lines after the heading:

```text
- Everything the user reads is in the user's language: the reply, a plan you ask them to approve, questions and their answer options.
- Everything else is English: thinking, tool calls and their descriptions, status lines, internal notes.
```

## The table

| Surface | Language | Why |
|---|---|---|
| Final reply (the message after the last tool call) | the user's language | The user reads it. |
| A plan presented for approval | the user's language | The user has to approve what they read; a plan in a language they did not write in is a comprehension risk, not a saving. |
| A question asked to the user, and its answer options (labels and descriptions) | the user's language | The user has to answer it. |
| Thinking and reasoning text | English | The user never reads it. |
| Tool calls: names, arguments, `description` fields | English | The call is machine-and-model text; the transcript shows the command itself. |
| Status lines and narration between tool calls | English | One line of bookkeeping, not a message to the user. |
| Internal notes, working plans the user does not approve, summaries for the model itself | English | Not user-facing. |
| Code, commit messages, pull request descriptions, changelogs, documentation | English | Repository artifacts keep the project's language. |

The plan rule extends to the plan's structure, not only its prose: a plan the
user approves is written in the user's language end to end, including headings
and step titles. The question rule extends to option labels and their one-line
descriptions.

## What is never translated

- Code, identifiers, function and API names, commands, flags, paths, versions.
- Error strings and log lines; quote them verbatim.
- Commit-type keywords (`feat`, `fix`) and conventional-commit subjects.
- Content the user asked to translate, obviously.

If the user writes in a mixed language, the policy follows the language of the
message that asks for the work. A user who switches language mid-session gets
the new language in the next reply; the English side never changes.

## Why English internally

English is cheaper per meaning under the reference tokenizer, and the user does
not pay attention to that text. Measured with `tiktoken` `o200k_base`:

| Text | Russian | English |
|---|---|---|
| "The cache is stale: the key ignores the workspace path. Restarting the host clears it." | 24 tokens | 19 tokens (−21%) |
| "I checked the configuration and updated the dependencies" | 10 tokens | 8 tokens (−20%) |
| A status line: «все 47 тестов прошли успешно» vs `47/47 pass` | 9 tokens | 4 tokens (−56%, half of it the template) |

The user-facing half of the policy is not a token decision: it is a
comprehension decision. A reply the user has to translate has failed at the only
place the user reads.

## How the policy is enforced

- The two rules are prompt text. They are guards: the catalogue gives them no
  detector, so the ledger reports them as `unmeasured` by design (it does not
  even list them — a guard is not a claim about tokens). The plugin cannot verify
  that a model followed a language rule from the outside without guessing at
  language identification, and a wrong guess would corrupt the report.
- The rules are present in every mode except `off`, and they survive
  `thinking: false`: turning off the thinking *economy* rules does not turn off
  language routing.
- Auto-clarity applies before language: a security warning or an
  irreversible-action confirmation is written clearly, in the user's language.

## Edge cases

- **A quoted log line in a Russian reply.** The line stays verbatim in the
  language it was produced in; the prose around it is Russian.
- **An English user.** Nothing changes: the user's language is English and the
  internal language is English, so the policy collapses into one language.
- **A reply that only contains code or a path.** No prose, no language decision.
- **The plan tool is unavailable.** The rule is written generically ("a plan you
  ask them to approve"), so it still applies to a plan written into the reply.

## Where it lives

| Piece | File |
|---|---|
| Rule text | [`lib/catalogue.js`](../lib/catalogue.js) — `core-language-user`, `core-language-internal` |
| Section compilation | [`lib/rules.js`](../lib/rules.js) |
| Coverage check | [`test/catalogue.test.mjs`](../test/catalogue.test.mjs) — "language routing leads the lean section" |
