/**
 * dsh-telegrapher — the rule catalogue.
 *
 * A rule is a prompt line, a claim about what it saves, and (usually) the
 * detector that measures the claim on real session logs. The catalogue is the
 * single source of both the system-prompt section and the hypothesis ledger:
 * nothing reaches the prompt unless it also has a place in the measurement,
 * and a line that measurements refute leaves the prompt through the rejected
 * control set below.
 *
 * `tier: 'lean'` lines are in every prompt by default; `tier: 'full'` lines
 * join only in `mode: full`. `detectors` names entries in `lib/detect.js`.
 *
 * Fields:
 *   text        prompt line; `null` for measurement-only controls
 *   detectors   detector ids that measure the rule (usually one)
 *   channel     'output' (reply text), 'thinking', 'tool' (tool arguments), 'input'
 *   confidence  'exact' — the rewrite is deterministic and the delta is exact;
 *               'potential' — following the rule needs a model choice, so the
 *               delta is an upper bound on what the rule can save
 *   claim       the hypothesis the ledger evaluates
 *   status      'rejected' — measured and refuted, never rendered
 *   why         the evidence that rejected it
 */

/** Ordered prompt sections; headings appear only in `mode: full`. */
export const SECTIONS = [
  { id: 'core', title: 'Core' },
  { id: 'response', title: 'Response' },
  { id: 'markdown', title: 'Markdown' },
  { id: 'status', title: 'Status' },
  { id: 'tools', title: 'Tool calls' },
  { id: 'thinking', title: 'Thinking' },
  { id: 'cross-turn', title: 'Across turns' },
]

/** @typedef {'lean' | 'full'} Tier */
/** @typedef {'output' | 'thinking' | 'tool' | 'input'} Channel */
/** @typedef {'exact' | 'potential'} Confidence */

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} section
 * @property {Tier} tier
 * @property {string | null} text
 * @property {string[]} detectors
 * @property {Channel} channel
 * @property {Confidence} confidence
 * @property {string} claim
 * @property {'rejected'} [status]
 * @property {string} [why]
 */

/** @type {Rule[]} */
export const RULES = [
  // ---- core -------------------------------------------------------------
  {
    id: 'core-language-user',
    section: 'core',
    tier: 'lean',
    text: "Everything the user reads is in the user's language: the reply, a plan you ask them to approve, questions and their answer options.",
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'User-facing text is written in the language the user writes in, because the user is the reader.',
  },
  {
    id: 'core-language-internal',
    section: 'core',
    tier: 'lean',
    text: 'Everything else is English: thinking, tool calls and their descriptions, status lines, internal notes.',
    detectors: [],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Internal text is English: the user does not read it, and English costs fewer tokens per meaning.',
  },
  {
    id: 'core-substance',
    section: 'core',
    tier: 'lean',
    text: 'Terse, full substance: code, paths, commands, identifiers, error strings and numbers stay exact.',
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'A substance guard keeps compression from damaging correctness.',
  },
  {
    id: 'core-filler',
    section: 'core',
    tier: 'lean',
    text: 'No filler, hedging or pleasantries; state each fact once.',
    detectors: ['filler'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Filler openers, hedges and pleasantries cost output tokens and carry no information.',
  },
  {
    id: 'core-narration',
    section: 'core',
    tier: 'lean',
    text: 'No tool-call narration: the call shows the intent. Status between calls is one line at most.',
    detectors: ['narration'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Lead-ins such as "Let me check the config" repeat an intent the tool call already shows.',
  },
  {
    id: 'core-factor',
    section: 'core',
    tier: 'full',
    text: 'Factor shared context: a repeated verb or object is stated once.',
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'Repeating a verb or object across a list adds tokens without adding facts.',
  },
  {
    id: 'core-abbrev',
    section: 'core',
    tier: 'full',
    text: 'Never invent abbreviations (cfg, impl, req): they split into as many tokens as the full word. Standard acronyms only.',
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'Invented abbreviations save nothing under a BPE tokenizer.',
  },
  {
    id: 'core-alias',
    section: 'core',
    tier: 'full',
    text: 'An identifier, path or URL of four tokens or more, recurring five times or more, gets an alias at first mention and only the alias after that.',
    detectors: ['path-repeat'],
    channel: 'output',
    confidence: 'potential',
    claim: 'A long repeated path pays for its first full mention and saves on every repeat after it.',
  },
  {
    id: 'core-hoist',
    section: 'core',
    tier: 'full',
    text: 'Hoist a shell command of 15+ tokens used 3+ times into a script or variable.',
    detectors: ['hot-command'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'Hoisting a repeated long command pays for itself from the third call.',
  },

  // ---- response ---------------------------------------------------------
  {
    id: 'response-answer-first',
    section: 'response',
    tier: 'lean',
    text: 'Start with the answer and stop: no recap, no summary block.',
    detectors: ['recap'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A recap after the answer repeats the answer.',
  },
  {
    id: 'response-closing',
    section: 'response',
    tier: 'lean',
    text: 'No closing offer ("if you need anything else").',
    detectors: ['offer'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A closing offer is pure template spending.',
  },
  {
    id: 'response-no-restate',
    section: 'response',
    tier: 'lean',
    text: "Don't restate the question.",
    detectors: ['restate'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Restating the user question repeats text the model already has.',
  },
  {
    id: 'response-reference',
    section: 'response',
    tier: 'lean',
    text: "After an edit, don't reprint the file or re-explain the change: `file:line: essence`. Reference code already shown instead of quoting it.",
    detectors: ['reprint'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A fenced block whose lines already appeared in an edit or write is the largest per-reply waste.',
  },
  {
    id: 'response-no-next-steps',
    section: 'response',
    tier: 'lean',
    text: 'No next-steps section unless asked.',
    detectors: ['next-steps'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A "Next steps" block is template spending.',
  },
  {
    id: 'response-edit-line',
    section: 'response',
    tier: 'full',
    text: 'A single-line edit is `file:line` plus its essence, not two before/after blocks.',
    detectors: ['before-after'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Two before/after fences for a one-line change cost far more than one reference line.',
  },
  {
    id: 'response-bare-value',
    section: 'response',
    tier: 'full',
    text: 'A where, how-many or version question gets the bare value, no wrapper sentence.',
    detectors: ['wrapper'],
    channel: 'output',
    confidence: 'potential',
    claim: 'A wrapper sentence around a single value adds no information.',
  },
  {
    id: 'response-no-command-quote',
    section: 'response',
    tier: 'full',
    text: "Don't quote a command in prose; the call already shows it.",
    detectors: ['command-quote'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Backticking a command that the same turn already ran duplicates it.',
  },
  {
    id: 'response-one-example',
    section: 'response',
    tier: 'full',
    text: 'One example, not three.',
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'The second and third illustration of one point add almost no information.',
  },
  {
    id: 'response-done',
    section: 'response',
    tier: 'full',
    text: 'A mechanical operation that succeeded gets one word plus only new facts.',
    detectors: ['verbose-done'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Restating what the diff or the tool output shows is duplication.',
  },
  {
    id: 'response-no-apology',
    section: 'response',
    tier: 'full',
    text: 'No apologies, self-blame or "oops"; state the fix directly.',
    detectors: ['apology'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Apologies or "oops" after a correction add tokens without fixing anything.',
  },

  // ---- markdown ---------------------------------------------------------
  {
    id: 'markdown-markup',
    section: 'markdown',
    tier: 'lean',
    text: 'No bold, no headings in short answers, no decorative tables or emoji.',
    detectors: ['markup'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Markup markers cost tokens and carry no technical information.',
  },
  {
    id: 'markdown-tables',
    section: 'markdown',
    tier: 'full',
    text: 'Tables only on explicit request; a short fact list goes inline.',
    detectors: ['table'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Each table cell pays for separators; short facts read fine inline.',
  },
  {
    id: 'markdown-lists',
    section: 'markdown',
    tier: 'full',
    text: 'Lists only for three or more items where order matters; otherwise prose.',
    detectors: ['short-list'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A list marker and line break per item cost more than a sentence for two items.',
  },
  {
    id: 'markdown-backticks',
    section: 'markdown',
    tier: 'full',
    text: 'Backticks only for real code: identifiers, commands, paths.',
    detectors: ['plain-backticks'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Backticks around plain words are two tokens of decoration.',
  },
  {
    id: 'markdown-path-sep',
    section: 'markdown',
    tier: 'full',
    text: 'Separate enumerated paths with spaces, not commas.',
    detectors: ['comma-path'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A comma after a path is its own token; a space merges with the next word.',
  },
  {
    id: 'markdown-terminal-period',
    section: 'markdown',
    tier: 'full',
    text: 'No terminal period on a one-line answer.',
    detectors: ['terminal-period'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A terminal period on a fragment costs a token and marks nothing.',
  },
  {
    id: 'markdown-fence-lang',
    section: 'markdown',
    tier: 'full',
    text: 'No language tag on log or plain-text fences.',
    detectors: ['fence-lang'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A `text` tag on a log fence pays for highlighting that does nothing.',
  },
  {
    id: 'markdown-bare-url',
    section: 'markdown',
    tier: 'full',
    text: 'No [url](url) links where the label repeats the URL.',
    detectors: ['duplicate-url-link'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Repeating the URL as both label and target in a markdown link pays for the URL twice.',
  },

  // ---- status -----------------------------------------------------------
  {
    id: 'status-template',
    section: 'status',
    tier: 'lean',
    text: 'Report checks as `N/N pass`, `N/M fail`, `clean`; don\'t echo tool output.',
    detectors: ['tool-echo'],
    channel: 'output',
    confidence: 'exact',
    claim: 'Echoing a tool result in the reply repeats what the transcript already holds.',
  },

  // ---- tools ------------------------------------------------------------
  {
    id: 'tools-edit-anchor',
    section: 'tools',
    tier: 'lean',
    text: 'Minimal unique `old_string`: the changed line, one context line only on a collision.',
    detectors: ['edit-anchor'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'A wide edit anchor pays for context it does not need; a minimal one usually stays unique.',
  },
  {
    id: 'tools-edit-not-write',
    section: 'tools',
    tier: 'lean',
    text: 'Edit existing files; a second write of a path already written means edit. Rewrite only for a new file or a replacement above half the content.',
    detectors: ['repeat-write'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'Rewriting a whole file pays for every unchanged line; an edit pays only for the change.',
  },
  {
    id: 'tools-replace-all',
    section: 'tools',
    tier: 'lean',
    text: '`replace_all` instead of N identical edits.',
    detectors: ['identical-edits'],
    channel: 'tool',
    confidence: 'exact',
    claim: 'A second identical edit repeats the same anchor and replacement.',
  },
  {
    id: 'tools-merge-edits',
    section: 'tools',
    tier: 'lean',
    text: 'Combine adjacent edits to the same file in one turn into a single edit call.',
    detectors: ['adjacent-edits'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'Multiple sequential edits to the same file in one turn pay repeated call and anchor overhead.',
  },
  {
    id: 'tools-no-cd',
    section: 'tools',
    tier: 'full',
    text: 'No `cd <path> &&` prefix: the working directory persists.',
    detectors: ['cd-prefix'],
    channel: 'tool',
    confidence: 'exact',
    claim: 'A cd prefix that targets the session working directory changes nothing.',
  },
  {
    id: 'tools-description',
    section: 'tools',
    tier: 'lean',
    text: 'Shell descriptions: two to five words, active voice.',
    detectors: ['tool-description'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'A shell description longer than five words costs tokens the command line already implies.',
  },
  {
    id: 'tools-no-banner-comments',
    section: 'tools',
    tier: 'full',
    text: 'No decorative banner dividers (// ====) in written or edited code.',
    detectors: ['banner-comments'],
    channel: 'tool',
    confidence: 'exact',
    claim: 'Decorative ASCII banner lines in code arguments cost output tokens and carry no semantics.',
  },
  {
    id: 'tools-no-shell-sep',
    section: 'tools',
    tier: 'lean',
    text: 'No decorative echo/printf separators in shell commands.',
    detectors: ['shell-separators'],
    channel: 'tool',
    confidence: 'exact',
    claim: 'Chaining echo "====" separators in shell commands wastes both argument and output tokens.',
  },
  {
    id: 'tools-read-scope',
    section: 'tools',
    tier: 'full',
    text: 'Grep or glob to locate before reading; `offset`/`limit` on large files; never re-read an unchanged file.',
    detectors: ['repeat-read'],
    channel: 'tool',
    confidence: 'exact',
    claim: 'Re-reading an unchanged file in the same session duplicates both the call and its result.',
  },
  {
    id: 'tools-quiet-flags',
    section: 'tools',
    tier: 'full',
    text: 'Quiet flags when the output is not the answer: `git -q`, `npm --silent`, `pytest -q`.',
    detectors: [],
    channel: 'input',
    confidence: 'exact',
    claim: 'Quiet flags cut tool-result input; this channel is not measured by this plugin.',
  },
  {
    id: 'tools-generator',
    section: 'tools',
    tier: 'full',
    text: 'Three or more files sharing a template: write the generator once.',
    detectors: ['template-writes'],
    channel: 'tool',
    confidence: 'potential',
    claim: 'A generator replaces N near-identical writes with one script plus N short runs.',
  },

  // ---- thinking ---------------------------------------------------------
  {
    id: 'thinking-billed',
    section: 'thinking',
    tier: 'lean',
    text: 'Thinking is billed output: cut restatement and re-derivation, never depth.',
    detectors: [],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'A depth guard keeps the thinking rules from trading correctness for tokens.',
  },
  {
    id: 'thinking-echo',
    section: 'thinking',
    tier: 'lean',
    text: "Don't narrate a tool result in thinking.",
    detectors: ['thinking-echo'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Reasoning that quotes the tool result it just received repeats input it already has.',
  },
  {
    id: 'thinking-no-code-draft',
    section: 'thinking',
    tier: 'lean',
    text: 'Never draft full code blocks in thinking before writing or editing: emit code once in the tool call.',
    detectors: ['thinking-code-draft'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Drafting code in thinking that the same step immediately writes or edits pays for the code twice.',
  },
  {
    id: 'thinking-no-narration',
    section: 'thinking',
    tier: 'lean',
    text: "No intent or tool narration in thinking (let me, let's, I'll): state the target or emit the call.",
    detectors: ['thinking-narration'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Narrating upcoming actions or tool calls in reasoning ("Let me read X") duplicates the call.',
  },
  {
    id: 'thinking-no-meta',
    section: 'thinking',
    tier: 'lean',
    text: 'No self-talk or interjections in thinking (wait, hmm, oops); state checks and fixes directly.',
    detectors: ['thinking-filler'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Self-talk openers and interjections ("Wait", "Hmm", "Oops") in reasoning carry no analytical step.',
  },
  {
    id: 'thinking-rederive',
    section: 'thinking',
    tier: 'full',
    text: "Don't re-derive facts already established in the session.",
    detectors: ['thinking-rederive'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'Reasoning that repeats an earlier conclusion adds latency, not information.',
  },
  {
    id: 'thinking-plan',
    section: 'thinking',
    tier: 'full',
    text: "Don't restate a plan in thinking once it is written down.",
    detectors: ['thinking-plan'],
    channel: 'thinking',
    confidence: 'exact',
    claim: 'A plan restated in thinking is the same text paid twice.',
  },

  // ---- across turns -----------------------------------------------------
  {
    id: 'cross-turn-echo',
    section: 'cross-turn',
    tier: 'full',
    text: "Don't restate a tool result: the verdict in one line.",
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'A verdict sentence replaces an echoed transcript.',
  },
  {
    id: 'cross-turn-dedupe',
    section: 'cross-turn',
    tier: 'full',
    text: 'Already explained this session: point to it, don\'t repeat it.',
    detectors: ['repeat-paragraph'],
    channel: 'output',
    confidence: 'exact',
    claim: 'A paragraph repeated from an earlier turn in the same session is pure duplication.',
  },
  {
    id: 'cross-turn-yesno',
    section: 'cross-turn',
    tier: 'full',
    text: 'A yes/no question gets yes/no plus one fact.',
    detectors: [],
    channel: 'output',
    confidence: 'exact',
    claim: 'Surrounding context around a yes/no answer is usually unnecessary.',
  },

  // ---- measurement-only controls ----------------------------------------
  // Rules the ledger keeps in order to show that the method refutes moves
  // that look like savings. They never render into the prompt.
  {
    id: 'control-blank-lines',
    section: 'markdown',
    tier: 'full',
    text: null,
    detectors: ['blank-lines'],
    channel: 'output',
    confidence: 'exact',
    status: 'rejected',
    why: 'A line break is one token either way: removing blank lines between list items saves nothing.',
    claim: 'Removing blank lines between list items saves tokens.',
  },
  {
    id: 'control-abbrev',
    section: 'core',
    tier: 'full',
    text: null,
    detectors: ['invented-abbrev'],
    channel: 'output',
    confidence: 'exact',
    status: 'rejected',
    why: 'An invented abbreviation splits into as many tokens as the word it replaces.',
    claim: 'Writing cfg/impl/req instead of the full word saves tokens.',
  },
  {
    id: 'control-arrow',
    section: 'core',
    tier: 'full',
    text: null,
    detectors: ['causal-arrow'],
    channel: 'output',
    confidence: 'exact',
    status: 'rejected',
    why: 'The arrow is one token and a period is one token: replacing it measured no saving.',
    claim: 'A causal arrow between clauses saves tokens over a period.',
  },
  {
    id: 'control-em-dash',
    section: 'markdown',
    tier: 'full',
    text: null,
    detectors: ['em-dash'],
    channel: 'output',
    confidence: 'exact',
    status: 'rejected',
    why: 'An em-dash is one token and a hyphen is one token: replacing it measured no saving.',
    claim: 'Replacing em-dashes with ASCII hyphens saves tokens.',
  },
]

/** Rules that render into the prompt, in prompt order. */
export const RENDERED = RULES.filter((rule) => rule.status !== 'rejected' && rule.text !== null)

/** Catalogue lookup by id. */
export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]))

/** Detector id → the rule that measures it. */
export const RULE_FOR_DETECTOR = new Map()
for (const rule of RULES) {
  for (const detector of rule.detectors) RULE_FOR_DETECTOR.set(detector, rule)
}

/** Every detector the analysis runs, in catalogue order. */
export const DETECTOR_IDS = RULES.flatMap((rule) => rule.detectors)
