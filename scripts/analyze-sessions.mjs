#!/usr/bin/env node
/**
 * dsh-telegrapher — offline analysis of a local session store.
 *
 * The plugin analyses sessions through the Host's `sessionQuery` service. This
 * script does the same thing without a running Host: it reads the stored
 * `.jsonl.zstd` logs directly, feeds them to the same analysis pipeline, and
 * prints the same report. It exists so a maintainer can see the effect of a new
 * rule on a real corpus before installing the plugin.
 *
 * Requires Node.js 22.15 or newer for `zlib.zstdDecompressSync`.
 *
 * Usage:
 *   node scripts/analyze-sessions.mjs [--sessions 50] [--root PATH] [--encoding o200k_base] [--json]
 *
 * The session store is `$DSH_HOME/sessions` (or `%USERPROFILE%\.dsh\sessions`).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { createAnalysisService } from '../lib/analysis.js'
import { RULES, RENDERED } from '../lib/catalogue.js'
import { buildLedger } from '../lib/hypotheses.js'
import { rulesText } from '../lib/rules.js'
import { createTokenCounter } from '../lib/tiktoken.js'
import { fmtShare, formatAudit, formatHypotheses, formatRules, formatSummary } from '../lib/tool.js'

/** zstd frame magic number. A session log is a concatenation of frames. */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Parse `--name value` flags. */
function parseArgs(argv) {
  const options = { sessions: 20, root: '', encoding: 'o200k_base', json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--json') options.json = true
    else if (flag === '--sessions') options.sessions = Number(argv[++index])
    else if (flag === '--root') options.root = String(argv[++index] ?? '')
    else if (flag === '--encoding') options.encoding = String(argv[++index] ?? '')
    else if (flag === '--help' || flag === '-h') options.help = true
  }
  return options
}

/** Decompress every frame in one stored session log. */
function readFrames(file) {
  const buffer = fs.readFileSync(file)
  const offsets = []
  let cursor = 0
  while ((cursor = buffer.indexOf(MAGIC, cursor)) !== -1) {
    offsets.push(cursor)
    cursor += MAGIC.length
  }
  let text = ''
  for (const offset of offsets) {
    try {
      text += zlib.zstdDecompressSync(buffer.subarray(offset)).toString('utf8')
    } catch {
      // A torn tail is normal: the writer may have been interrupted.
    }
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** Find every stored session under the root. */
function listStoredSessions(root) {
  const found = []
  let projects
  try {
    projects = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectPath = path.join(root, project.name)
    for (const session of fs.readdirSync(projectPath, { withFileTypes: true })) {
      if (!session.isDirectory()) continue
      const file = path.join(projectPath, session.name, 'session.v4.jsonl.zstd')
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        found.push({ id: session.name, file, size: stat.size, mtime: stat.mtimeMs })
      }
    }
  }
  return found
}

/** A `sessionQuery` over the local store, with a one-session read cache. */
function localSessionQuery(entries) {
  const loaded = new Map()
  const load = (entry) => {
    if (!loaded.has(entry.id)) {
      const events = readFrames(entry.file)
      const header = events.find((event) => event.type === 'session') ?? { id: entry.id }
      loaded.set(entry.id, { session: header, inheritedEventCount: 0, events })
    }
    return loaded.get(entry.id)
  }
  const records = entries.map((entry) => ({
    header: { ...load(entry).session, id: entry.id },
    live: false,
    persisted: true,
    formatStatus: 'current',
  }))
  return {
    listSessions: async () => records,
    readSession: async (id) => {
      const entry = entries.find((candidate) => candidate.id === id)
      if (!entry) throw new Error(`unknown session ${id}`)
      return load(entry)
    },
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(
      'Usage: node scripts/analyze-sessions.mjs [--sessions 20] [--root PATH] [--encoding o200k_base] [--json]\n',
    )
    return 0
  }
  if (typeof zlib.zstdDecompressSync !== 'function') {
    process.stderr.write(
      `This script needs Node.js 22.15 or newer for zstd (running ${process.version}).\n`,
    )
    return 1
  }

  const root =
    options.root ||
    path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'sessions')
  const entries = listStoredSessions(root)
  if (entries.length === 0) {
    process.stderr.write(`No stored sessions under ${root}.\n`)
    return 1
  }
  const limited = [...entries]
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, Math.max(1, options.sessions))
  const settings = {
    mode: 'lean',
    thinking: true,
    analysis: true,
    sessions: limited.length,
    encoding: options.encoding,
    python: 'auto',
  }
  const counter = createTokenCounter({ encoding: options.encoding })
  const service = createAnalysisService({
    getSettings: () => settings,
    sessionQuery: localSessionQuery(limited),
    counter,
    logger: { warn: (message) => process.stderr.write(`${message}\n`) },
  })

  const report = await service.report({ force: true })
  if (!report.ok) {
    process.stderr.write(`${report.reason}\n`)
    counter.close()
    return 1
  }

  const priced = await counter.count([rulesText(settings), ...RENDERED.map((rule) => `- ${rule.text}`)])
  const perRule = {}
  RENDERED.forEach((rule, index) => {
    perRule[rule.id] = priced.counts[index + 1] ?? 0
  })
  const stats = {}
  for (const rule of RULES) {
    const hit = report.rules[rule.id] ?? {
      occurrences: 0,
      sessions: 0,
      tokens: 0,
      examples: [],
      exact: true,
    }
    stats[rule.id] = { ...hit, inputCost: perRule[rule.id] ?? null }
  }
  const ledger = buildLedger({ ...report, rules: stats }, RULES)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ report, ledger }, null, 2)}\n`)
    counter.close()
    return 0
  }

  process.stdout.write(
    `${formatSummary(report, ledger, priced.counts[0])}\n\n` +
      `${formatAudit(report, ledger, settings)}\n\n` +
      `Rules:\n${formatRules(ledger)}\n\n` +
      `Hypotheses:\n${formatHypotheses(ledger, 40)}\n\n` +
      `Tools: ${report.tools
        .slice(0, 8)
        .map((tool) => `${tool.name} ${fmtShare(tool.share)}`)
        .join(' | ')}\n` +
      `Scanned ${report.scannedSessions}/${report.requestedSessions} sessions in ${report.scanMs} ms; ` +
      `skipped ${report.skipped.length}; detector errors ${report.errors.length}.\n`,
  )
  counter.close()
  return 0
}

const code = await main()
process.exitCode = code
