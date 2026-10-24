/**
 * dsh-telegrapher — word and phrase frequency analysis with context (KWIC).
 *
 * Scans visible reply text and reasoning prose (excluding code fences, inline
 * code, file paths and URLs) to rank words and short phrases by length,
 * frequency and BPE token mass. Each entry keeps real session fragments so a
 * maintainer or user can inspect the context in Settings and evaluate whether
 * a rule to exclude, shorten or rephrase the term pays back.
 */

import { splitFences } from './detect.js'

/** Maximum candidate terms priced with tiktoken per scan. */
export const MAX_WORD_CANDIDATES = 320

/** Maximum context snippets stored per word or phrase. */
export const MAX_WORD_SNIPPETS = 5

/** Grammatical stopwords hidden by default so content and filler words surface. */
export const STOPWORDS = new Set([
  // English function words
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'are',
  'was',
  'were',
  'been',
  'have',
  'has',
  'had',
  'not',
  'but',
  'you',
  'your',
  'can',
  'will',
  'would',
  'could',
  'should',
  'into',
  'about',
  'than',
  'then',
  'them',
  'they',
  'their',
  'there',
  'here',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'while',
  'after',
  'before',
  'under',
  'over',
  'between',
  'through',
  'during',
  'without',
  'within',
  'along',
  'across',
  'behind',
  'beyond',
  'only',
  'also',
  'more',
  'most',
  'some',
  'such',
  'each',
  'other',
  'another',
  'both',
  'either',
  'neither',
  'same',
  'very',
  'just',
  'even',
  'still',
  'already',
  'does',
  'did',
  'doing',
  'done',
  'our',
  'out',
  'all',
  'any',
  'its',
  'his',
  'her',
  'how',
  'why',
  'may',
  'might',
  'must',
  'shall',
  'onto',
  'upon',
  'these',
  'those',
  'because',
  'since',
  'until',
  'unless',
  'whether',
  // Russian function words
  'что',
  'как',
  'для',
  'при',
  'это',
  'этот',
  'эта',
  'эти',
  'этого',
  'этом',
  'этой',
  'этих',
  'этим',
  'все',
  'всё',
  'всех',
  'всей',
  'всем',
  'всеми',
  'или',
  'если',
  'так',
  'уже',
  'ещё',
  'еще',
  'только',
  'чтобы',
  'когда',
  'где',
  'куда',
  'откуда',
  'который',
  'которая',
  'которое',
  'которые',
  'которого',
  'которой',
  'которых',
  'которому',
  'которым',
  'быть',
  'был',
  'была',
  'было',
  'были',
  'будет',
  'будут',
  'есть',
  'нет',
  'они',
  'оно',
  'она',
  'его',
  'ему',
  'них',
  'ним',
  'ними',
  'нами',
  'вами',
  'наш',
  'наша',
  'наше',
  'наши',
  'ваш',
  'ваша',
  'ваше',
  'ваши',
  'себя',
  'себе',
  'собой',
  'свой',
  'своя',
  'своё',
  'свои',
  'своих',
  'своей',
  'своим',
  'между',
  'через',
  'после',
  'перед',
  'около',
  'вокруг',
  'внутри',
  'вместо',
  'кроме',
  'более',
  'менее',
  'очень',
  'даже',
  'лишь',
  'либо',
  'затем',
  'потом',
  'тогда',
  'поэтому',
  'однако',
  'также',
  'тоже',
  'над',
  'под',
  'про',
  'без',
  'из-за',
  'причём',
  'причем',
  'хотя',
  'пусть',
  'будто',
  'словно',
])

/**
 * Known filler, hedge, narration and bureaucratic patterns mapped to a
 * suggested rule action:
 *   - 'exclude': pure filler / hedge / meta-talk that can be deleted
 *   - 'shorten': verbose phrase or word with a direct shorter equivalent
 *   - 'rephrase': nominalization or template wrapper better stated directly
 *
 * @type {Record<string, { action: 'exclude' | 'shorten' | 'rephrase', replacement: string, ruleHint: string, reason: string }>}
 */
export const SUGGESTIONS = {
  // ---- Russian: exclude (fillers, hedges, intensifiers, narration) -------
  соответственно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Word-parasite connective; adds 3–4 BPE tokens without adding a fact.',
  },
  непосредственно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Bureaucratic intensifier; the verb or target already names the action.',
  },
  фактически: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Hedge/intensifier that carries no technical information.',
  },
  собственно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Conversational filler word.',
  },
  безусловно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Pleasantry/affirmation filler.',
  },
  разумеется: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Affirmation filler.',
  },
  очевидно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Rhetorical intensifier; state the conclusion directly.',
  },
  естественно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Conversational filler.',
  },
  действительно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Confirming intensifier; rarely changes the meaning of a statement.',
  },
  определённо: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier that adds tokens without precision.',
  },
  определенно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier that adds tokens without precision.',
  },
  практически: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Hedge adverb; state the exact bound or omit.',
  },
  достаточно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Vague degree hedge ("достаточно просто"); usually removable.',
  },
  успешно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'response-done',
    reason: 'Redundant adverb in completion reports ("успешно обновлён" → "обновлён").',
  },
  внимательно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Self-narration adverb ("внимательно проверим"); adds no check.',
  },
  тщательно: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Self-narration adverb.',
  },
  давайте: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Intent lead-in ("давайте посмотрим/проверим"); emit the call or state the result.',
  },
  посмотрим: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Tool-call narration lead-in.',
  },
  проверим: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Intent narration before a check.',
  },
  проверяю: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person status narration before a tool call ("… — проверяю сборку").',
  },
  смотрю: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person status narration before reading or inspecting files.',
  },
  добавляю: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person status narration before an edit/write call.',
  },
  обновляю: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person status narration before an edit/write call.',
  },
  перехожу: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Step-transition narration ("Бэкенд завершён — перехожу к фронтенду").',
  },
  читаю: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person narration before a read call.',
  },
  реализую: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'First-person narration before writing code.',
  },
  попробуем: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Intent narration lead-in.',
  },
  пожалуйста: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Pleasantry filler.',
  },

  // ---- Russian: shorten (verbose connectives & bureaucratic verbs) -------
  необходимо: {
    action: 'shorten',
    replacement: 'нужно',
    ruleHint: 'core-filler',
    reason: 'Long modal word (3–4 tokens); "нужно" or an imperative is shorter.',
  },
  дополнительно: {
    action: 'shorten',
    replacement: 'также',
    ruleHint: 'core-filler',
    reason: '4-token adverb; often removable or replaceable with "также" / "+".',
  },
  предварительно: {
    action: 'shorten',
    replacement: 'сначала',
    ruleHint: 'core-filler',
    reason: 'Multi-token temporal adverb; "до" or "сначала" is shorter.',
  },
  осуществляется: {
    action: 'rephrase',
    replacement: 'идёт',
    ruleHint: 'core-filler',
    reason: 'Bureaucratic passive verb ("осуществляется проверка" → "проверяется").',
  },
  осуществлять: {
    action: 'rephrase',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Bureaucratic auxiliary verb; replace with the direct action verb.',
  },
  производится: {
    action: 'rephrase',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Bureaucratic passive ("производится расчёт" → "считается").',
  },
  является: {
    action: 'shorten',
    replacement: '—',
    ruleHint: 'core-filler',
    reason: 'Copula verb; in Russian prose a dash or direct predicate is shorter.',
  },
  данный: {
    action: 'shorten',
    replacement: 'этот',
    ruleHint: 'core-filler',
    reason: 'Chancery demonstrative ("данный файл"); omit or use "этот".',
  },
  данного: {
    action: 'shorten',
    replacement: 'этого',
    ruleHint: 'core-filler',
    reason: 'Chancery demonstrative; omit the pronoun when the noun is already known.',
  },
  данной: {
    action: 'shorten',
    replacement: 'этой',
    ruleHint: 'core-filler',
    reason: 'Chancery demonstrative; omit or use "этой".',
  },
  данных: {
    action: 'rephrase',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Check context: either "data" (substance) or chancery pronoun "these".',
  },
  'на самом деле': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: '3-word discourse filler; already targeted by core-filler.',
  },
  'собственно говоря': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Discourse filler phrase.',
  },
  'таким образом': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'response-answer-first',
    reason: 'Summary transition phrase; often introduces a redundant recap.',
  },
  'стоит отметить': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Introductory throat-clearing; state the fact directly.',
  },
  'следует отметить': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Introductory throat-clearing; state the fact directly.',
  },
  'обратите внимание': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Attention marker; the sentence that follows stands on its own.',
  },
  'для того чтобы': {
    action: 'shorten',
    replacement: 'чтобы',
    ruleHint: 'core-filler',
    reason: '3-word conjunction replaceable by "чтобы".',
  },
  'в настоящее время': {
    action: 'shorten',
    replacement: 'сейчас',
    ruleHint: 'core-filler',
    reason: '3-word temporal cliché replaceable by "сейчас".',
  },
  'на данный момент': {
    action: 'shorten',
    replacement: 'сейчас',
    ruleHint: 'core-filler',
    reason: '3-word temporal cliché replaceable by "сейчас".',
  },
  'в первую очередь': {
    action: 'shorten',
    replacement: 'сначала',
    ruleHint: 'core-filler',
    reason: '3-word phrase replaceable by "сначала".',
  },
  'представляет собой': {
    action: 'shorten',
    replacement: '— это',
    ruleHint: 'core-filler',
    reason: 'Verbose copula phrase.',
  },
  'давайте посмотрим': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Tool narration lead-in.',
  },
  'давайте проверим': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-narration',
    reason: 'Tool narration lead-in.',
  },

  // ---- English: exclude (fillers, hedges, self-talk, narration) ----------
  basically: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Conversational filler adverb; carries no technical meaning.',
  },
  essentially: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Hedge/summary adverb; state the property directly.',
  },
  actually: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-meta',
    reason: 'Frequent self-correction filler in reasoning and replies.',
  },
  literally: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier filler.',
  },
  obviously: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Rhetorical intensifier.',
  },
  clearly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Rhetorical intensifier.',
  },
  certainly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Affirmation opener.',
  },
  definitely: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier adverb.',
  },
  absolutely: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Affirmation opener or intensifier.',
  },
  simply: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Minimizing adverb ("simply pass X" → "pass X").',
  },
  merely: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Minimizing adverb.',
  },
  currently: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Present-tense verbs already imply "currently".',
  },
  successfully: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'response-done',
    reason: 'Redundant adverb in status confirmations ("updated successfully" → "updated").',
  },
  properly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Vague manner adverb ("works properly" → "works").',
  },
  correctly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Often redundant next to "works", "parses", "handles".',
  },
  carefully: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Self-narration adverb in reasoning ("let me carefully check").',
  },
  thoroughly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Self-narration adverb.',
  },
  completely: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier adverb.',
  },
  entirely: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Intensifier adverb.',
  },
  additionally: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Transition filler; a bullet or new sentence needs no transition word.',
  },
  furthermore: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Transition filler.',
  },
  moreover: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Transition filler.',
  },
  however: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Contrast transition; often removable in technical prose.',
  },
  therefore: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Conclusion transition; often introduces restatement.',
  },
  specifically: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Focus adverb; naming the target directly is shorter.',
  },
  particularly: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Focus adverb.',
  },
  unfortunately: {
    action: 'exclude',
    replacement: '',
    ruleHint: 'response-no-apology',
    reason: 'Emotional framing before an error or limitation.',
  },

  // ---- English: shorten / rephrase ---------------------------------------
  approximately: {
    action: 'shorten',
    replacement: '~',
    ruleHint: 'core-filler',
    reason: 'Replaceable with "~" before numbers.',
  },
  utilize: {
    action: 'shorten',
    replacement: 'use',
    ruleHint: 'core-filler',
    reason: 'Verbose synonym for "use".',
  },
  utilizing: {
    action: 'shorten',
    replacement: 'using',
    ruleHint: 'core-filler',
    reason: 'Verbose synonym for "using".',
  },
  functionality: {
    action: 'shorten',
    replacement: 'feature',
    ruleHint: 'core-filler',
    reason: 'Nominalization; often replaceable with "feature", "code", or the verb.',
  },
  'in order to': {
    action: 'shorten',
    replacement: 'to',
    ruleHint: 'core-filler',
    reason: '3 tokens replaceable by 1 token ("to").',
  },
  'make sure that': {
    action: 'shorten',
    replacement: 'ensure',
    ruleHint: 'core-filler',
    reason: '3 tokens replaceable by 1 token ("ensure") or direct check.',
  },
  'as well as': {
    action: 'shorten',
    replacement: 'and',
    ruleHint: 'core-filler',
    reason: '3 tokens replaceable by "and".',
  },
  'due to the': {
    action: 'shorten',
    replacement: 'from',
    ruleHint: 'core-filler',
    reason: 'Verbose causal phrase ("due to the fact that" → "because").',
  },
  'at this point': {
    action: 'shorten',
    replacement: 'now',
    ruleHint: 'core-filler',
    reason: '3 tokens replaceable by "now" or omitted.',
  },
  'let me check': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Upcoming tool-call narration in thinking or reply.',
  },
  'let me read': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Upcoming tool-call narration.',
  },
  'let me look': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Upcoming tool-call narration.',
  },
  'take a look': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Verbose tool narration cliché.',
  },
  'going to check': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'thinking-no-narration',
    reason: 'Intent narration before a tool call.',
  },
  'worth noting that': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Throat-clearing prefix; state the fact directly.',
  },
  'keep in mind': {
    action: 'exclude',
    replacement: '',
    ruleHint: 'core-filler',
    reason: 'Meta-instruction prefix.',
  },
}

const INLINE_CODE = /`[^`\n]+`/g
const MD_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/|mailto:|#)[^)\s]+\)/g
const BARE_URL = /https?:\/\/[^\s<>")\]]+/g
const WIN_PATH = /[A-Za-z]:\\[^\s`<>"|*?.,;:)\]]+/g
const POSIX_PATH = /(?:^|(?<=\s))(?:\.{0,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+/g
const FILE_NAME =
  /\b[\w.-]+\.(?:m?js|cjs|ts|tsx|jsx|py|json|md|yml|yaml|toml|css|scss|html|svg|sh|ps1|sql|rs|go|zstd|lock|txt|log)\b/gi

const WORD_TOKEN = /\p{L}[\p{L}'-]*/gu

/**
 * Strip code fences, inline code, URLs and file paths so word counts reflect
 * natural-language prose rather than identifiers. Replaced spans become clause
 * breaks (` | `) so adjacent words across a code span never form a false n-gram.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanProseForWords(text) {
  if (typeof text !== 'string' || text.trim() === '') return ''
  const proseParts = splitFences(text)
    .filter((part) => !part.fence)
    .map((part) => part.text)
  if (proseParts.length === 0) return ''
  return proseParts
    .join('\n')
    .replace(MD_LINK, (_all, label) => (BARE_URL.test(label) ? ' | ' : ` ${label} `))
    .replace(INLINE_CODE, ' | ')
    .replace(BARE_URL, ' | ')
    .replace(WIN_PATH, ' | ')
    .replace(POSIX_PATH, ' | ')
    .replace(FILE_NAME, ' | ')
}

/**
 * Split prose (without fences) into human-readable sentences for context snippets.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractSentences(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const withoutFences = splitFences(text)
    .filter((part) => !part.fence)
    .map((part) => part.text)
    .join('\n')
  const out = []
  for (const line of withoutFences.split(/\n+/)) {
    const cleanedLine = line
      .replace(/^\s*(?:#{1,6}|[-*•]|\d+[.)])\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleanedLine.length < 6) continue
    const parts = cleanedLine.split(/(?<=[.!?])\s+/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.length >= 6) out.push(trimmed)
    }
  }
  return out
}

/**
 * Heuristic suggestion for long nominalizations or adverbs not in the static dictionary.
 *
 * @param {string} term
 * @param {number} ngram
 * @param {number} chars
 * @param {number} bpeTokens
 * @returns {{ action: 'exclude' | 'shorten' | 'rephrase', replacement: string, ruleHint: string, reason: string } | null}
 */
export function suggestForTerm(term, ngram, chars, bpeTokens) {
  const direct = SUGGESTIONS[term]
  if (direct) return direct
  if (ngram === 1 && chars >= 11 && bpeTokens >= 3) {
    if (/(?:ование|ение|ация|яция|ость|етельство)$/u.test(term)) {
      return {
        action: 'rephrase',
        replacement: '',
        ruleHint: 'core-filler',
        reason: 'Long verbal noun / abstract nominalization (3+ BPE tokens); check if a direct verb is shorter.',
      }
    }
    if (/(?:юще|ающе|яюще|ованно|ированно|тельски)$/u.test(term)) {
      return {
        action: 'exclude',
        replacement: '',
        ruleHint: 'core-filler',
        reason: 'Heavy multi-token adverb; check if it adds a fact in context.',
      }
    }
  }
  if (ngram === 1 && chars >= 12 && bpeTokens >= 2) {
    if (/(?:ally|atively|aneously|isation|ization|fulness|lessness)$/u.test(term)) {
      return {
        action: 'rephrase',
        replacement: '',
        ruleHint: 'core-filler',
        reason: 'Long multi-token English adverb/nominalization; check context for a shorter form.',
      }
    }
  }
  return null
}

/**
 * Tokenize one sentence into clauses of lowercase words (2+ letters).
 *
 * @param {string} sentence
 * @returns {string[][]}
 */
function tokenizeClauses(sentence) {
  const cleaned = cleanProseForWords(sentence)
  if (cleaned === '') return []
  const clauses = []
  for (const rawClause of cleaned.split(/[.!?\n;:|—–,()[\]{}"]+/)) {
    const matches = rawClause.toLowerCase().match(WORD_TOKEN)
    if (!matches) continue
    const words = matches
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter((w) => w.length >= 2 && /\p{L}{2}/u.test(w))
    if (words.length > 0) clauses.push(words)
  }
  return clauses
}

/**
 * Trim a long sentence around the matched term so the snippet stays compact.
 *
 * @param {string} sentence
 * @param {string} term
 * @returns {string}
 */
function clipSnippet(sentence, term) {
  const maxLen = 180
  if (sentence.length <= maxLen) return sentence
  const lower = sentence.toLowerCase()
  const idx = lower.indexOf(term.toLowerCase())
  if (idx < 0) return `${sentence.slice(0, maxLen - 1)}…`
  const half = Math.floor((maxLen - term.length) / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(sentence.length, start + maxLen)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < sentence.length ? '…' : ''
  return `${prefix}${sentence.slice(start, end).trim()}${suffix}`
}

/**
 * Collect candidate words (1-grams) and phrases (2-grams, 3-grams) across
 * scanned sessions, ready to be priced in the main tiktoken string pool.
 *
 * @param {Array<{
 *   digest: { id: string },
 *   units: Array<{ kind: string, text: string, unmatchedText?: string | null }>
 * }>} sessions
 * @param {{ maxCandidates?: number }} [options]
 */
export function extractWordCandidates(sessions, options = {}) {
  const maxCandidates = options.maxCandidates ?? MAX_WORD_CANDIDATES
  /**
   * @type {Map<string, {
   *   term: string,
   *   ngram: number,
   *   chars: number,
   *   raw: number,
   *   unmatched: number,
   *   sessions: Set<string>,
   *   unmatchedSessions: Set<string>,
   *   channels: {
   *     thinking: { raw: number, unmatched: number, sessions: Set<string> },
   *     text: { raw: number, unmatched: number, sessions: Set<string> },
   *   },
   *   snippets: Array<{ session: string, channel: string, text: string }>,
   *   snippetKeys: Set<string>,
   * }>}
   */
  const map = new Map()
  let totalRawOccurrences = 0
  let totalUnmatchedOccurrences = 0

  const ensureEntry = (term, ngram) => {
    let entry = map.get(term)
    if (entry !== undefined) return entry
    entry = {
      term,
      ngram,
      chars: Array.from(term).length,
      raw: 0,
      unmatched: 0,
      sessions: new Set(),
      unmatchedSessions: new Set(),
      channels: {
        thinking: { raw: 0, unmatched: 0, sessions: new Set() },
        text: { raw: 0, unmatched: 0, sessions: new Set() },
      },
      snippets: [],
      snippetKeys: new Set(),
    }
    map.set(term, entry)
    return entry
  }

  const recordText = (sessionId, channel, text, isUnmatched) => {
    if (typeof text !== 'string' || text.trim() === '') return
    const chKey = channel === 'thinking' ? 'thinking' : 'text'
    const sentences = extractSentences(text)
    for (const sentence of sentences) {
      const clauses = tokenizeClauses(sentence)
      for (const words of clauses) {
        for (let i = 0; i < words.length; i += 1) {
          // 1-gram
          const w1 = words[i]
          const e1 = ensureEntry(w1, 1)
          if (isUnmatched) {
            e1.unmatched += 1
            e1.unmatchedSessions.add(sessionId)
            e1.channels[chKey].unmatched += 1
            totalUnmatchedOccurrences += 1
          } else {
            e1.raw += 1
            e1.sessions.add(sessionId)
            e1.channels[chKey].raw += 1
            e1.channels[chKey].sessions.add(sessionId)
            totalRawOccurrences += 1
          }
          if (
            e1.snippets.length < MAX_WORD_SNIPPETS &&
            sentence.length >= 12 &&
            !e1.snippetKeys.has(`${sessionId}:${sentence.slice(0, 48)}`)
          ) {
            e1.snippetKeys.add(`${sessionId}:${sentence.slice(0, 48)}`)
            e1.snippets.push({
              session: sessionId,
              channel: chKey,
              text: clipSnippet(sentence, w1),
            })
          }

          // 2-gram
          if (i + 1 < words.length) {
            const w2 = `${w1} ${words[i + 1]}`
            if (w2.length >= 5 && w2.length <= 50 && (!STOPWORDS.has(w1) || !STOPWORDS.has(words[i + 1]))) {
              const e2 = ensureEntry(w2, 2)
              if (isUnmatched) {
                e2.unmatched += 1
                e2.unmatchedSessions.add(sessionId)
                e2.channels[chKey].unmatched += 1
              } else {
                e2.raw += 1
                e2.sessions.add(sessionId)
                e2.channels[chKey].raw += 1
                e2.channels[chKey].sessions.add(sessionId)
              }
              if (
                e2.snippets.length < MAX_WORD_SNIPPETS &&
                sentence.length >= 12 &&
                !e2.snippetKeys.has(`${sessionId}:${sentence.slice(0, 48)}`)
              ) {
                e2.snippetKeys.add(`${sessionId}:${sentence.slice(0, 48)}`)
                e2.snippets.push({
                  session: sessionId,
                  channel: chKey,
                  text: clipSnippet(sentence, w2),
                })
              }
            }
          }

          // 3-gram
          if (i + 2 < words.length) {
            const w3 = `${w1} ${words[i + 1]} ${words[i + 2]}`
            if (w3.length >= 8 && w3.length <= 60) {
              const e3 = ensureEntry(w3, 3)
              if (isUnmatched) {
                e3.unmatched += 1
                e3.unmatchedSessions.add(sessionId)
                e3.channels[chKey].unmatched += 1
              } else {
                e3.raw += 1
                e3.sessions.add(sessionId)
                e3.channels[chKey].raw += 1
                e3.channels[chKey].sessions.add(sessionId)
              }
              if (
                e3.snippets.length < MAX_WORD_SNIPPETS &&
                sentence.length >= 12 &&
                !e3.snippetKeys.has(`${sessionId}:${sentence.slice(0, 48)}`)
              ) {
                e3.snippetKeys.add(`${sessionId}:${sentence.slice(0, 48)}`)
                e3.snippets.push({
                  session: sessionId,
                  channel: chKey,
                  text: clipSnippet(sentence, w3),
                })
              }
            }
          }
        }
      }
    }
  }

  for (const session of sessions) {
    const sessionId = session.digest?.id ?? ''
    for (const unit of session.units ?? []) {
      if (unit.kind !== 'text' && unit.kind !== 'thinking') continue
      recordText(sessionId, unit.kind, unit.text, false)
      const unmatched = unit.unmatchedText !== undefined && unit.unmatchedText !== null ? unit.unmatchedText : unit.text
      recordText(sessionId, unit.kind, unmatched, true)
    }
  }

  // Score candidates so we keep top 1-grams, 2-grams, 3-grams, long words, and known filler hits
  const allEntries = [...map.values()].filter((entry) => {
    if (entry.ngram > 1 && entry.raw < 2 && !(entry.term in SUGGESTIONS)) return false
    return entry.raw >= 1
  })

  const scoreOf = (entry) => {
    const knownBonus = entry.term in SUGGESTIONS ? 4 : 1
    const stopPenalty = entry.ngram === 1 && STOPWORDS.has(entry.term) ? 0.25 : 1
    const lengthFactor = Math.max(1, Math.min(entry.chars, 24) / 4)
    return entry.raw * lengthFactor * knownBonus * stopPenalty
  }

  // Reserve slots across n-gram sizes and length brackets so UI filters always have results
  const selectedMap = new Map()
  const addBucket = (list, limit) => {
    for (const item of list) {
      if (selectedMap.size >= maxCandidates) break
      if (selectedMap.has(item.term)) continue
      selectedMap.set(item.term, item)
      limit -= 1
      if (limit <= 0) break
    }
  }

  const byScore = [...allEntries].sort((a, b) => scoreOf(b) - scoreOf(a) || b.raw - a.raw)
  const textChannelByScore = [...allEntries]
    .filter((e) => e.channels.text.raw > 0 && !(e.ngram === 1 && STOPWORDS.has(e.term)))
    .sort((a, b) => b.channels.text.raw * Math.max(1, b.chars / 4) - a.channels.text.raw * Math.max(1, a.chars / 4))
  const knownHits = byScore.filter((e) => e.term in SUGGESTIONS)
  const oneGramsLong = byScore.filter((e) => e.ngram === 1 && e.chars >= 8 && !STOPWORDS.has(e.term))
  const oneGramsMed = byScore.filter((e) => e.ngram === 1 && e.chars >= 4 && e.chars < 8 && !STOPWORDS.has(e.term))
  const twoGrams = byScore.filter((e) => e.ngram === 2)
  const threeGrams = byScore.filter((e) => e.ngram === 3)

  addBucket(knownHits, 70)
  addBucket(textChannelByScore, 70)
  addBucket(oneGramsLong, 70)
  addBucket(oneGramsMed, 50)
  addBucket(twoGrams, 40)
  addBucket(threeGrams, 20)
  addBucket(byScore, maxCandidates)

  const candidates = [...selectedMap.values()]
  return {
    totalUnique: map.size,
    totalOccurrences: totalRawOccurrences,
    unmatchedOccurrences: totalUnmatchedOccurrences,
    candidates,
  }
}

/**
 * Register candidate terms and snippet strings in the measurement pool.
 *
 * @param {{ candidates: object[] }} extracted
 * @param {{ add: (text: string) => number }} pool
 */
export function registerWordStrings(extracted, pool) {
  return extracted.candidates.map((entry) => ({
    // Leading space prices the word as an in-sentence BPE token sequence.
    termIndex: pool.add(` ${entry.term}`),
    snippetIndexes: entry.snippets.map((snippet) => pool.add(snippet.text)),
  }))
}

/**
 * Build the final `report.words` payload once `tiktoken` counts are available.
 *
 * @param {{ totalUnique: number, totalOccurrences: number, unmatchedOccurrences: number, candidates: object[] }} extracted
 * @param {Array<{ termIndex: number, snippetIndexes: number[] }>} indexes
 * @param {number[]} counts
 */
export function finalizeWords(extracted, indexes, counts) {
  const items = extracted.candidates.map((entry, idx) => {
    const idxEntry = indexes[idx]
    const bpeTokens = Math.max(1, counts[idxEntry.termIndex] ?? 1)
    const stopword = entry.ngram === 1 && STOPWORDS.has(entry.term)
    const suggestion = suggestForTerm(entry.term, entry.ngram, entry.chars, bpeTokens)
    const snippets = entry.snippets.map((snippet, sIdx) => ({
      session: snippet.session,
      channel: snippet.channel,
      text: snippet.text,
      tokens: counts[idxEntry.snippetIndexes[sIdx]] ?? 0,
    }))
    return {
      term: entry.term,
      ngram: entry.ngram,
      chars: entry.chars,
      bpeTokens,
      occurrences: entry.raw,
      unmatched: entry.unmatched,
      sessions: entry.sessions.size,
      unmatchedSessions: entry.unmatchedSessions.size,
      totalTokens: entry.raw * bpeTokens,
      unmatchedTokens: entry.unmatched * bpeTokens,
      channels: {
        thinking: {
          raw: entry.channels.thinking.raw,
          unmatched: entry.channels.thinking.unmatched,
          sessions: entry.channels.thinking.sessions.size,
        },
        text: {
          raw: entry.channels.text.raw,
          unmatched: entry.channels.text.unmatched,
          sessions: entry.channels.text.sessions.size,
        },
      },
      stopword,
      suggestion,
      snippets,
    }
  })

  items.sort((a, b) => b.unmatchedTokens - a.unmatchedTokens || b.totalTokens - a.totalTokens)

  return {
    totalUnique: extracted.totalUnique,
    totalOccurrences: extracted.totalOccurrences,
    unmatchedOccurrences: extracted.unmatchedOccurrences,
    items,
  }
}

/**
 * Filter and sort `report.words.items` for the Settings UI, CLI or agent tool.
 *
 * @param {{ items?: object[] } | null | undefined} wordsReport
 * @param {{
 *   channel?: 'all' | 'thinking' | 'text',
 *   scope?: 'unmatched' | 'raw',
 *   ngram?: 'all' | 1 | 2 | 3 | '1' | '2' | '3',
 *   minChars?: number,
 *   maxChars?: number,
 *   minTokens?: number,
 *   hideStopwords?: boolean,
 *   onlyCandidates?: boolean,
 *   query?: string,
 *   sort?: 'totalTokens' | 'occurrences' | 'chars' | 'bpeTokens',
 *   limit?: number,
 * }} [filters]
 */
export function filterWords(wordsReport, filters = {}) {
  const items = Array.isArray(wordsReport?.items) ? wordsReport.items : []
  const channel = filters.channel ?? 'all'
  const scope = filters.scope ?? 'unmatched'
  const ngramFilter =
    filters.ngram === undefined || filters.ngram === 'all' ? 'all' : Number(filters.ngram)
  const minChars = Number.isFinite(Number(filters.minChars)) ? Math.max(1, Number(filters.minChars)) : 4
  const maxChars = Number.isFinite(Number(filters.maxChars)) && Number(filters.maxChars) > 0 ? Number(filters.maxChars) : 0
  const minTokens = Number.isFinite(Number(filters.minTokens)) ? Math.max(1, Number(filters.minTokens)) : 1
  const hideStopwords = filters.hideStopwords !== false
  const onlyCandidates = filters.onlyCandidates === true
  const query = typeof filters.query === 'string' ? filters.query.trim().toLowerCase() : ''
  const sort = filters.sort ?? 'totalTokens'
  const limit = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.min(200, Number(filters.limit))) : 25

  const projected = []
  for (const item of items) {
    if (ngramFilter !== 'all' && item.ngram !== ngramFilter) continue
    if (item.chars < minChars) continue
    if (maxChars > 0 && item.chars > maxChars) continue
    if (item.bpeTokens < minTokens) continue
    if (hideStopwords && item.stopword) continue
    if (onlyCandidates && !item.suggestion) continue
    if (query !== '' && !item.term.includes(query)) continue

    let occ = 0
    let sess = 0
    if (channel === 'thinking' || channel === 'text') {
      const ch = item.channels?.[channel]
      occ = scope === 'raw' ? (ch?.raw ?? 0) : (ch?.unmatched ?? 0)
      sess = ch?.sessions ?? item.sessions
    } else {
      occ = scope === 'raw' ? item.occurrences : item.unmatched
      sess = scope === 'raw' ? item.sessions : item.unmatchedSessions
    }
    if (occ <= 0) continue

    const totalTokens = occ * item.bpeTokens
    const snippets =
      channel === 'thinking' || channel === 'text'
        ? item.snippets.filter((s) => s.channel === channel)
        : item.snippets

    projected.push({
      ...item,
      activeOccurrences: occ,
      activeSessions: sess,
      activeTokens: totalTokens,
      activeSnippets: snippets.length > 0 ? snippets : item.snippets,
    })
  }

  projected.sort((a, b) => {
    if (sort === 'occurrences') return b.activeOccurrences - a.activeOccurrences || b.activeTokens - a.activeTokens
    if (sort === 'chars') return b.chars - a.chars || b.activeTokens - a.activeTokens
    if (sort === 'bpeTokens') return b.bpeTokens - a.bpeTokens || b.activeTokens - a.activeTokens
    return b.activeTokens - a.activeTokens || b.activeOccurrences - a.activeOccurrences
  })

  return projected.slice(0, limit)
}

/**
 * Rewrite a context snippet by excluding or replacing the target term so the
 * user can immediately preview and measure the candidate rule on a real sentence.
 *
 * @param {string} snippet
 * @param {string} term
 * @param {'exclude' | 'shorten' | 'rephrase'} action
 * @param {string} [replacement]
 * @returns {string}
 */
export function applyTermRewrite(snippet, term, action = 'exclude', replacement = '') {
  if (typeof snippet !== 'string' || snippet.trim() === '' || typeof term !== 'string' || term.trim() === '') {
    return String(snippet ?? '')
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (action === 'exclude' || (replacement ?? '').trim() === '') {
    // Remove the term and any adjacent parenthetical comma/whitespace left behind
    const pattern = new RegExp(
      `(?:^\\s*${escaped}\\s*[,:—–-]?\\s*|\\s*,\\s*${escaped}\\s*,|\\s*,?\\s*(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])\\s*,?)`,
      'giu',
    )
    const next = snippet
      .replace(pattern, (match) => {
        if (match.startsWith(',') && match.endsWith(',')) return ','
        return ' '
      })
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (next.length > 0 && /^\p{Ll}/u.test(next) && /^\p{Lu}/u.test(snippet.trim())) {
      return next[0].toUpperCase() + next.slice(1)
    }
    return next
  }

  const targetReplacement = replacement.trim()
  const wordBoundaryPattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu')
  return snippet
    .replace(wordBoundaryPattern, (matched) => {
      if (/^\p{Lu}/u.test(matched) && /^\p{Ll}/u.test(targetReplacement)) {
        return targetReplacement[0].toUpperCase() + targetReplacement.slice(1)
      }
      return targetReplacement
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}
