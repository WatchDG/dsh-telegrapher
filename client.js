window.__ModuleLoader__.load({
  id: 'dsh-telegrapher',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'settings.telegrapher'
    /** Host Loader row id; the settings namespace is the row's patch id. */
    const HOST_ENTRY = 'telegrapher'
    /** Tolerate a Loader that namespaces the inserted row. */
    const NAMESPACES = [HOST_ENTRY, `include:${HOST_ENTRY}`, 'dsh-telegrapher']

    /** Authenticated Host routes registered by lib/plugin.js. */
    const STATUS_PATH = '/telegrapher/status'
    const REPORT_PATH = '/telegrapher/report'
    const SCAN_PATH = '/telegrapher/scan'

    /** English copy. */
    const en = {
      nav: 'Telegrapher',
      title: 'Token economy',
      intro:
        'The rules below are injected into the system prompt of every session in this profile. The analysis reads stored sessions, prices every rule rewrite with tiktoken, and compares sessions that carried the rules with sessions that did not.',
      rulesTitle: 'Prompt rules',
      rulesIntro:
        'The section costs its own tokens on every request. The ledger compares that cost with the measured saving.',
      modeLabel: 'Mode',
      'mode.lean': 'Lean — highest-value rules',
      'mode.full': 'Full — every measured rule',
      'mode.off': 'Off — no section',
      thinkingLabel: 'Thinking rules',
      thinkingHint: 'Include the rules for reasoning text.',
      analysisLabel: 'Session analysis',
      analysisHint: 'Serve the report and register the telegrapher tool.',
      sessionsLabel: 'Sessions per report',
      sessionsHint: 'How many of the newest sessions one scan reads (1–100).',
      encodingLabel: 'tiktoken encoding',
      encodingHint: 'Reference BPE encoding used for every measurement.',
      pythonLabel: 'Python',
      pythonHint: '"auto" or a path to a Python 3 with tiktoken.',
      sectionCost: 'Section cost',
      sectionValue: '{tokens} tokens · {lines} lines',
      showPreview: 'Show the section text',
      hidePreview: 'Hide the section text',
      applyFailed: 'The Host did not accept this value.',
      readonly: 'This profile stores settings read-only.',
      reportTitle: 'Measured report',
      reportIntro:
        'Computed from stored sessions on this Host. Rule savings are potential: the rewrite priced on replies that were actually written.',
      rescan: 'Rescan',
      rescanning: 'Scanning…',
      statSessions: 'Sessions',
      statSteps: 'Steps',
      statOutput: 'Output tokens',
      statSection: 'Section tokens',
      massTitle: 'Where output tokens go',
      massTool: 'Tool arguments',
      massThinking: 'Thinking',
      massText: 'Reply text',
      massHint: 'Attributed by the BPE mass of recorded output.',
      toolsTitle: 'Top tools',
      headerTool: 'tool',
      headerShare: 'share',
      headerTokens: 'tokens',
      headerCalls: 'calls',
      sessionsTitle: 'Scanned sessions',
      headerSession: 'session',
      headerModel: 'model',
      headerRules: 'rules',
      rulesTableTitle: 'Rules with evidence',
      headerRule: 'rule',
      headerTier: 'tier',
      headerOcc: 'occ',
      headerPerSession: '/session',
      headerPayback: 'payback',
      headerStatus: 'status',
      reportFailed: 'The analysis is unavailable: {reason}',
      scanMeta: 'Scanned {scanned}/{requested} sessions in {ms}; {errors} errors',
      skipped: '{count} sessions skipped',
      ledgerTitle: 'Hypotheses',
      ledgerIntro:
        'Each rule is a claim. Static claims price a rewrite on real replies; empirical claims compare sessions with and without the rules.',
      statusSupported: 'supported',
      statusRefuted: 'refuted',
      statusInconclusive: 'inconclusive',
      statusUnmeasured: 'unmeasured',
      empiricalN: 'n={treatment}/{control} sessions',
      empiricalDiff: 'median {treatment} vs {control} · {relative}',
      ruleEvidence: '{occurrences} occurrences · {tokens} tokens · {perSession}/session',
      payback: 'payback {value}×',
      proposalsTitle: 'Uncovered sinks',
      proposalShare: '{share} of measured output',
      diagTitle: 'Diagnostics',
      tokenizerLabel: 'Tokenizer',
      tokenizerExact: 'tiktoken {version} · {encoding}',
      tokenizerEstimate: 'estimate only — install tiktoken',
      tokenizerHint: 'py -3 -m pip install tiktoken==0.13.0',
      scanLabel: 'Last scan',
      scanValue: '{age} ago · {ms}',
      scanNone: 'not run yet',
      toolLabel: 'Agent tool',
      note: 'The plugin performs no network access. It reads session logs through the Host and runs only the local Python tiktoken process.',
    }

    /** Russian copy. */
    const ru = {
      nav: 'Телеграфист',
      title: 'Экономия токенов',
      intro:
        'Правила ниже добавляются в системный промпт каждой сессии профиля. Анализ читает сохранённые сессии, считает экономию каждой правки через tiktoken и сравнивает сессии с правилами и без них.',
      rulesTitle: 'Правила в промпте',
      rulesIntro:
        'Секция стоит своих токенов в каждом запросе. Журнал сравнивает эту цену с измеренной экономией.',
      modeLabel: 'Режим',
      'mode.lean': 'Краткий — только самые ценные правила',
      'mode.full': 'Полный — все измеряемые правила',
      'mode.off': 'Выкл. — секции нет',
      thinkingLabel: 'Правила обдумывания',
      thinkingHint: 'Включать правила для текста рассуждений.',
      analysisLabel: 'Анализ сессий',
      analysisHint: 'Отдавать отчёт и регистрировать инструмент telegrapher.',
      sessionsLabel: 'Сессий на отчёт',
      sessionsHint: 'Сколько последних сессий читает один скан (1–100).',
      encodingLabel: 'Кодировка tiktoken',
      encodingHint: 'Эталонная BPE-кодировка для всех измерений.',
      pythonLabel: 'Python',
      pythonHint: '«auto» или путь к Python 3 с tiktoken.',
      sectionCost: 'Цена секции',
      sectionValue: '{tokens} токенов · {lines} строк',
      showPreview: 'Показать текст секции',
      hidePreview: 'Скрыть текст секции',
      applyFailed: 'Хост не принял значение.',
      readonly: 'Профиль хранит настройки только для чтения.',
      reportTitle: 'Измеренный отчёт',
      reportIntro:
        'Считается по сохранённым сессиям хоста. Экономия правил потенциальна: правка оценивается на реально написанных ответах.',
      rescan: 'Пересканировать',
      rescanning: 'Сканирую…',
      statSessions: 'Сессии',
      statSteps: 'Шаги',
      statOutput: 'Токены ответа',
      statSection: 'Токены секции',
      massTitle: 'Куда уходят токены ответа',
      massTool: 'Аргументы инструментов',
      massThinking: 'Обдумывание',
      massText: 'Текст ответа',
      massHint: 'Распределено по BPE-массе записанного ответа.',
      toolsTitle: 'Главные инструменты',
      headerTool: 'инструмент',
      headerShare: 'доля',
      headerTokens: 'токены',
      headerCalls: 'вызовы',
      sessionsTitle: 'Просканированные сессии',
      headerSession: 'сессия',
      headerModel: 'модель',
      headerRules: 'правила',
      rulesTableTitle: 'Правила с доказательствами',
      headerRule: 'правило',
      headerTier: 'уровень',
      headerOcc: 'случаи',
      headerPerSession: '/сессия',
      headerPayback: 'окупаемость',
      headerStatus: 'статус',
      reportFailed: 'Анализ недоступен: {reason}',
      scanMeta: 'Просканировано {scanned}/{requested} сессий за {ms}; ошибок: {errors}',
      skipped: 'пропущено сессий: {count}',
      ledgerTitle: 'Гипотезы',
      ledgerIntro:
        'Каждое правило — утверждение. Статические проверяют правку на реальных ответах; эмпирические сравнивают сессии с правилами и без них.',
      statusSupported: 'подтверждено',
      statusRefuted: 'опровергнуто',
      statusInconclusive: 'неубедительно',
      statusUnmeasured: 'нет данных',
      empiricalN: 'n={treatment}/{control} сессий',
      empiricalDiff: 'медиана {treatment} против {control} · {relative}',
      ruleEvidence: '{occurrences} случаев · {tokens} токенов · {perSession}/сессия',
      payback: 'окупаемость {value}×',
      proposalsTitle: 'Непокрытые стоки',
      proposalShare: '{share} измеренного вывода',
      diagTitle: 'Диагностика',
      tokenizerLabel: 'Токенизатор',
      tokenizerExact: 'tiktoken {version} · {encoding}',
      tokenizerEstimate: 'только оценка — установите tiktoken',
      tokenizerHint: 'py -3 -m pip install tiktoken==0.13.0',
      scanLabel: 'Последний скан',
      scanValue: '{age} назад · {ms}',
      scanNone: 'ещё не запускался',
      toolLabel: 'Инструмент агента',
      note: 'Плагин не ходит в сеть. Он читает журналы сессий через хост и запускает только локальный процесс Python с tiktoken.',
    }

    /** Page-local styles; tokens only, so light/dark follows the host theme. */
    const CSS = `
.tg-section{display:flex;flex-direction:column;gap:20px;width:100%;max-width:720px;padding:4px 0 24px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}
.tg-title{margin:0;font-size:16px;font-weight:600}
.tg-sub{margin:20px 0 0;padding-top:16px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:16px;font-weight:600}
.tg-intro{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:19px}
.tg-card{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:18px}
.tg-row{display:flex;flex-direction:column;gap:6px}
.tg-label{font-size:13px;font-weight:500}
.tg-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.tg-input,.tg-select{height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit}
.tg-input:focus-visible,.tg-select:focus-visible,.tg-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.tg-input:disabled,.tg-select:disabled{color:var(--dsw-alias-label-secondary);cursor:not-allowed}
.tg-check{display:flex;align-items:center;gap:8px;font-size:13px}
.tg-check input{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary)}
.tg-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tg-button{height:32px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer}
.tg-button:disabled{color:var(--dsw-alias-label-secondary);cursor:not-allowed}
.tg-error{color:var(--dsw-alias-state-error-primary)}
.tg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.tg-stat{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.tg-stat b{font-size:15px;font-weight:600}
.tg-stat span{font-size:11px;color:var(--dsw-alias-label-secondary)}
.tg-pre{margin:0;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-family:var(--dsw-font-mono,monospace);font-size:11px;line-height:16px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto}
.tg-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}
.tg-table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-secondary);padding:2px 8px 2px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.tg-table td{padding:2px 8px 2px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);vertical-align:top}
.tg-table tr:last-child td{border-bottom:0}
.tg-num{text-align:right;font-variant-numeric:tabular-nums}
.tg-mono{font-family:var(--dsw-font-mono,monospace);font-size:11px}
.tg-chip{display:inline-block;padding:0 7px;border-radius:9px;border:.5px solid currentColor;font-size:11px;line-height:17px}
.tg-chip.ok{color:var(--dsw-alias-state-success-primary)}
.tg-chip.bad{color:var(--dsw-alias-state-error-primary)}
.tg-chip.warn{color:var(--dsw-alias-state-warning-primary)}
.tg-chip.mute{color:var(--dsw-alias-label-secondary)}
.tg-bar{display:grid;grid-template-columns:140px 1fr 46px;gap:8px;align-items:center;font-size:12px}
.tg-bar-track{height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));overflow:hidden}
.tg-bar-fill{height:100%;border-radius:4px;background:var(--dsw-alias-brand-primary)}
.tg-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px}
.tg-ledger{display:flex;flex-direction:column;gap:8px}
.tg-entry{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:18px}
.tg-entry-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tg-entry-id{font-family:var(--dsw-font-mono,monospace);font-size:11px}
.tg-muted{color:var(--dsw-alias-label-secondary)}
.tg-note{margin:4px 0 0;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
`

    /** Compact token count: 1659155 -> "1.7M". */
    function fmtTokens(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return '—'
      if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`
      if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`
      return String(Math.round(number))
    }

    /** Share as a rounded percentage. */
    function fmtShare(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return '—'
      return `${Math.round(number * 100)}%`
    }

    /** Compact duration: 4097839ms -> "68m4s". */
    function fmtMs(ms) {
      if (!Number.isFinite(ms)) return '—'
      const seconds = Math.round(ms / 1000)
      if (seconds < 60) return `${seconds}s`
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `${minutes}m${seconds % 60}s`
      return `${Math.floor(minutes / 60)}h${minutes % 60}m`
    }

    /** Fill `{name}` slots in a dictionary string. */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (_all, key) =>
        values[key] === undefined || values[key] === null ? '—' : String(values[key]),
      )
    }

    async function getJson(path) {
      const response = await fetch(path, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    async function postJson(path) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    /** One labeled form row. */
    function Field(props) {
      const { id, label, hint, children } = props
      return h(
        'div',
        { className: 'tg-row' },
        h('label', { className: 'tg-label', htmlFor: id }, label),
        children,
        hint ? h('div', { className: 'tg-hint', id: `${id}-hint` }, hint) : null,
      )
    }

    /** Verdict chip. */
    function Chip(props) {
      const { status, t } = props
      const tone =
        status === 'supported'
          ? 'ok'
          : status === 'refuted'
            ? 'bad'
            : status === 'inconclusive'
              ? 'warn'
              : 'mute'
      const label =
        status === 'supported'
          ? t('statusSupported')
          : status === 'refuted'
            ? t('statusRefuted')
            : status === 'inconclusive'
              ? t('statusInconclusive')
              : t('statusUnmeasured')
      return h('span', { className: `tg-chip ${tone}` }, label)
    }

    /** Behavior form: mode, thinking, analysis, scan depth, tokenizer. */
    function Behavior(props) {
      const { t, status, setField, onApplied } = props
      const [pending, setPending] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [showText, setShowText] = React.useState(false)

      if (!setField) return h('div', { className: 'tg-hint' }, t('readonly'))
      if (status === null) return null
      if (status === false) {
        return h('div', { className: 'tg-card tg-error', role: 'alert' }, t('applyFailed'))
      }

      const change = (field, value) => {
        setPending(field)
        setFailed(false)
        Promise.resolve()
          .then(() => setField(field, value))
          .then(() => {
            setPending(null)
            if (typeof onApplied === 'function') onApplied()
          })
          .catch(() => {
            setPending(null)
            setFailed(true)
          })
      }

      const disabled = pending !== null
      const rules = status.rules ?? {}
      return h(
        'div',
        { className: 'tg-card' },
        h(
          Field,
          {
            id: 'tg-mode',
            label: t('modeLabel'),
            hint: t('rulesIntro'),
          },
          h(
            'select',
            {
              id: 'tg-mode',
              className: 'tg-select',
              value: status.mode,
              disabled,
              onChange: (event) => change('mode', event.target.value),
            },
            h('option', { value: 'lean' }, t('mode.lean')),
            h('option', { value: 'full' }, t('mode.full')),
            h('option', { value: 'off' }, t('mode.off')),
          ),
        ),
        h(
          'label',
          { className: 'tg-check' },
          h('input', {
            type: 'checkbox',
            checked: status.thinking === true,
            disabled,
            onChange: (event) => change('thinking', event.target.checked),
          }),
          t('thinkingLabel'),
        ),
        h('div', { className: 'tg-hint' }, t('thinkingHint')),
        h(
          'label',
          { className: 'tg-check' },
          h('input', {
            type: 'checkbox',
            checked: status.analysis === true,
            disabled,
            onChange: (event) => change('analysis', event.target.checked),
          }),
          t('analysisLabel'),
        ),
        h('div', { className: 'tg-hint' }, t('analysisHint')),
        h(
          Field,
          { id: 'tg-sessions', label: t('sessionsLabel'), hint: t('sessionsHint') },
          h('input', {
            id: 'tg-sessions',
            className: 'tg-input',
            type: 'number',
            min: 1,
            max: 100,
            value: status.sessions,
            disabled,
            onChange: (event) => change('sessions', Number(event.target.value)),
          }),
        ),
        h(
          Field,
          { id: 'tg-encoding', label: t('encodingLabel'), hint: t('encodingHint') },
          h('input', {
            id: 'tg-encoding',
            className: 'tg-input',
            type: 'text',
            value: status.encoding,
            disabled,
            onChange: (event) => change('encoding', event.target.value),
          }),
        ),
        h(
          Field,
          { id: 'tg-python', label: t('pythonLabel'), hint: t('pythonHint') },
          h('input', {
            id: 'tg-python',
            className: 'tg-input',
            type: 'text',
            value: status.python,
            disabled,
            onChange: (event) => change('python', event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'tg-hint' },
          `${t('sectionCost')}: ${fill(t('sectionValue'), {
            tokens: fmtTokens(rules.tokens),
            lines: rules.lines ?? 0,
          })}`,
        ),
        failed ? h('div', { className: 'tg-error' }, t('applyFailed')) : null,
        h(
          'div',
          { className: 'tg-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'tg-button',
              onClick: () => setShowText((value) => !value),
            },
            showText ? t('hidePreview') : t('showPreview'),
          ),
        ),
        showText ? h('pre', { className: 'tg-pre' }, rules.text || '') : null,
      )
    }

    /** Mass attribution bars. */
    function Mass(props) {
      const { t, report } = props
      const rows = [
        ['massTool', report.attribution?.tool, report.mass?.tool],
        ['massThinking', report.attribution?.thinking, report.mass?.thinking],
        ['massText', report.attribution?.text, report.mass?.text],
      ]
      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-label' }, t('massTitle')),
        ...rows.map(([key, share, tokens]) =>
          h(
            'div',
            { className: 'tg-bar', key },
            h('span', null, t(key)),
            h(
              'div',
              { className: 'tg-bar-track' },
              h('div', {
                className: 'tg-bar-fill',
                style: { width: `${Math.max(1, Math.round((Number(share) || 0) * 100))}%` },
              }),
            ),
            h('span', { className: 'tg-num' }, fmtShare(share)),
          ),
        ),
        h('div', { className: 'tg-hint' }, `${t('massHint')} ${fmtTokens(report.mass?.total)} total`),
      )
    }

    /** Top tools by argument cost. */
    function Tools(props) {
      const { t, tools } = props
      const rows = (tools ?? []).slice(0, 6)
      if (rows.length === 0) return null
      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-label' }, t('toolsTitle')),
        h(
          'table',
          { className: 'tg-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, t('headerTool')),
              h('th', { className: 'tg-num' }, t('headerShare')),
              h('th', { className: 'tg-num' }, t('headerTokens')),
              h('th', { className: 'tg-num' }, t('headerCalls')),
            ),
          ),
          h(
            'tbody',
            null,
            ...rows.map((tool) =>
              h(
                'tr',
                { key: tool.name },
                h('td', { className: 'tg-mono' }, tool.name),
                h('td', { className: 'tg-num' }, fmtShare(tool.share)),
                h('td', { className: 'tg-num' }, fmtTokens(tool.tokens)),
                h('td', { className: 'tg-num' }, String(tool.calls)),
              ),
            ),
          ),
        ),
      )
    }

    /** Rule evidence table. */
    function RulesTable(props) {
      const { t, ledger } = props
      const order = { supported: 0, inconclusive: 1, refuted: 2, unmeasured: 3 }
      const rows = (ledger ?? [])
        .filter((entry) => entry.kind === 'rule' && entry.occurrences > 0)
        .sort((a, b) => {
          const status = (order[a.status] ?? 9) - (order[b.status] ?? 9)
          return status !== 0 ? status : b.tokens - a.tokens
        })
        .slice(0, 10)
      if (rows.length === 0) return null
      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-label' }, t('rulesTableTitle')),
        h(
          'table',
          { className: 'tg-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, t('headerRule')),
              h('th', null, t('headerTier')),
              h('th', { className: 'tg-num' }, t('headerOcc')),
              h('th', { className: 'tg-num' }, t('headerTokens')),
              h('th', { className: 'tg-num' }, t('headerPerSession')),
              h('th', { className: 'tg-num' }, t('headerPayback')),
              h('th', null, t('headerStatus')),
            ),
          ),
          h(
            'tbody',
            null,
            ...rows.map((entry) =>
              h(
                'tr',
                { key: entry.id },
                h('td', { className: 'tg-mono' }, entry.rule),
                h('td', null, entry.tier ?? '—'),
                h('td', { className: 'tg-num' }, String(entry.occurrences)),
                h('td', { className: 'tg-num' }, fmtTokens(entry.tokens)),
                h('td', { className: 'tg-num' }, fmtTokens(entry.perSession)),
                h(
                  'td',
                  { className: 'tg-num' },
                  entry.payback === null || entry.payback === undefined
                    ? '—'
                    : `${entry.payback.toFixed(1)}×`,
                ),
                h('td', null, h(Chip, { status: entry.status, t })),
              ),
            ),
          ),
        ),
      )
    }

    /** The measured report block. */
    function Report(props) {
      const { t, view, onRescan } = props
      const [busy, setBusy] = React.useState(false)
      const report = view?.report
      const ledger = view?.ledger ?? []
      const sessions = report?.ok ? (report.scope?.sessions ?? []).slice(0, 8) : []
      const run = () => {
        setBusy(true)
        Promise.resolve()
          .then(onRescan)
          .finally(() => setBusy(false))
      }
      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-hint' }, t('reportIntro')),
        h(
          'div',
          { className: 'tg-actions' },
          h(
            'button',
            { type: 'button', className: 'tg-button', disabled: busy, onClick: run },
            busy ? t('rescanning') : t('rescan'),
          ),
        ),
        report && report.ok
          ? h(
              'div',
              { className: 'tg-grid' },
              h('div', { className: 'tg-stat' }, h('b', null, String(report.scannedSessions)), h('span', null, t('statSessions'))),
              h('div', { className: 'tg-stat' }, h('b', null, String(report.totals?.assistantMessages ?? 0)), h('span', null, t('statSteps'))),
              h('div', { className: 'tg-stat' }, h('b', null, fmtTokens(report.totals?.outputTokens)), h('span', null, t('statOutput'))),
              h('div', { className: 'tg-stat' }, h('b', null, fmtTokens(view?.section?.tokens)), h('span', null, t('statSection'))),
            )
          : null,
        report && report.ok ? h(Mass, { t, report }) : null,
        report && report.ok ? h(Tools, { t, tools: report.tools }) : null,
        h(RulesTable, { t, ledger }),
        sessions.length > 0
          ? h(
              'details',
              null,
              h('summary', { className: 'tg-label' }, t('sessionsTitle')),
              h(
                'table',
                { className: 'tg-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', null, t('headerSession')),
                    h('th', null, t('headerModel')),
                    h('th', { className: 'tg-num' }, t('statSteps')),
                    h('th', { className: 'tg-num' }, t('statOutput')),
                    h('th', null, t('headerRules')),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  ...sessions.map((session) =>
                    h(
                      'tr',
                      { key: session.id },
                      h('td', { className: 'tg-mono' }, session.id),
                      h('td', { className: 'tg-mono' }, session.model || '—'),
                      h('td', { className: 'tg-num' }, String(session.messages)),
                      h('td', { className: 'tg-num' }, fmtTokens(session.outputTokens)),
                      h('td', null, session.rules ? 'yes' : 'no'),
                    ),
                  ),
                ),
              ),
            )
          : null,
        report && report.ok
          ? h(
              'div',
              { className: 'tg-hint' },
              fill(t('scanMeta'), {
                scanned: report.scannedSessions,
                requested: report.requestedSessions,
                ms: fmtMs(report.scanMs),
                errors: (report.errors ?? []).length,
              }),
              report.skipped && report.skipped.length > 0
                ? ` · ${fill(t('skipped'), { count: report.skipped.length })}`
                : null,
            )
          : null,
        view && view.ok === false
          ? h('div', { className: 'tg-error' }, fill(t('reportFailed'), { reason: view.reason ?? '—' }))
          : null,
        report && report.ok && (report.notes ?? []).length > 0
          ? h('ul', { className: 'tg-list tg-muted' }, ...report.notes.map((note) => h('li', { key: note }, note)))
          : null,
      )
    }

    /** The hypothesis ledger block. */
    function Ledger(props) {
      const { t, ledger } = props
      const entries = ledger ?? []
      const empirical = entries.filter((entry) => entry.kind === 'empirical')
      const interesting = entries
        .filter(
          (entry) =>
            entry.kind === 'rule' &&
            entry.occurrences > 0 &&
            (entry.status === 'refuted' || entry.status === 'inconclusive'),
        )
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 4)
      const proposals = entries.filter((entry) => entry.kind === 'proposal')
      // The same rule can appear in RulesTable; this block adds claims and reasons.
      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-hint' }, t('ledgerIntro')),
        h(
          'div',
          { className: 'tg-ledger' },
          ...empirical.map((entry) =>
            h(
              'div',
              { className: 'tg-entry', key: entry.id },
              h(
                'div',
                { className: 'tg-entry-head' },
                h('span', { className: 'tg-entry-id' }, entry.id),
                h(Chip, { status: entry.status, t }),
                h('span', { className: 'tg-muted' }, entry.metric),
              ),
              h('div', null, entry.claim),
              h(
                'div',
                { className: 'tg-muted tg-mono' },
                fill(t('empiricalN'), {
                  treatment: entry.n?.treatment ?? 0,
                  control: entry.n?.control ?? 0,
                }),
                ' · ',
                fill(t('empiricalDiff'), {
                  treatment: fmtTokens(entry.median?.treatment),
                  control: fmtTokens(entry.median?.control),
                  relative: fmtShare(entry.relative),
                }),
              ),
              h('div', { className: 'tg-muted' }, entry.reason),
            ),
          ),
          ...interesting.map((entry) =>
            h(
              'div',
              { className: 'tg-entry', key: entry.id },
              h(
                'div',
                { className: 'tg-entry-head' },
                h('span', { className: 'tg-entry-id' }, entry.rule),
                h(Chip, { status: entry.status, t }),
                entry.payback !== null && entry.payback !== undefined
                  ? h('span', { className: 'tg-muted' }, fill(t('payback'), { value: entry.payback.toFixed(1) }))
                  : null,
              ),
              h('div', null, entry.claim),
              h(
                'div',
                { className: 'tg-muted tg-mono' },
                fill(t('ruleEvidence'), {
                  occurrences: entry.occurrences,
                  tokens: fmtTokens(entry.tokens),
                  perSession: fmtTokens(entry.perSession),
                }),
              ),
              h('div', { className: 'tg-muted' }, entry.reason),
            ),
          ),
          ...proposals.map((entry) =>
            h(
              'div',
              { className: 'tg-entry', key: entry.id },
              h(
                'div',
                { className: 'tg-entry-head' },
                h('span', { className: 'tg-entry-id' }, entry.id),
                h(Chip, { status: entry.status, t }),
                h('span', { className: 'tg-muted' }, t('proposalsTitle')),
              ),
              h('div', null, entry.claim),
              h('div', { className: 'tg-muted' }, fill(t('proposalShare'), { share: fmtShare(entry.share) })),
            ),
          ),
        ),
      )
    }

    /** Diagnostics block. */
    function Diagnostics(props) {
      const { t, status } = props
      if (!status || status === false) return null
      const tokenizer = status.tiktoken ?? {}
      const scan = status.scan ?? {}
      return h(
        'div',
        { className: 'tg-card' },
        h(
          'div',
          { className: 'tg-mono' },
          `${t('tokenizerLabel')}: ${
            tokenizer.exact
              ? fill(t('tokenizerExact'), {
                  version: tokenizer.version ?? '?',
                  encoding: tokenizer.encoding ?? status.encoding,
                })
              : t('tokenizerEstimate')
          }`,
        ),
        tokenizer.exact ? null : h('div', { className: 'tg-hint' }, t('tokenizerHint')),
        h(
          'div',
          { className: 'tg-mono tg-muted' },
          `${t('scanLabel')}: ${
            scan.age === null || scan.age === undefined
              ? t('scanNone')
              : fill(t('scanValue'), { age: fmtMs(scan.age), ms: fmtMs(scan.scanMs ?? 0) })
          }`,
        ),
        h('div', { className: 'tg-mono tg-muted' }, `${t('toolLabel')}: ${status.tool ?? '—'}`),
      )
    }

    /** The Settings → Telegrapher section. */
    function Section(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => en[key] ?? key
      const [status, setStatus] = React.useState(null)
      const [view, setView] = React.useState(null)
      const [nonce, setNonce] = React.useState(0)

      React.useEffect(() => {
        let alive = true
        setStatus(null)
        getJson(STATUS_PATH)
          .then((nextStatus) => {
            if (alive) setStatus(nextStatus)
          })
          .catch(() => {
            if (alive) setStatus(false)
          })
        getJson(REPORT_PATH)
          .then((nextView) => {
            if (alive) setView(nextView)
          })
          .catch(() => {
            if (alive) setView({ ok: false, reason: 'HTTP', report: null, ledger: [] })
          })
        return () => {
          alive = false
        }
      }, [nonce])

      const refresh = () => setNonce((value) => value + 1)
      const rescan = () =>
        postJson(SCAN_PATH).then((next) => {
          setView(next)
          return getJson(STATUS_PATH).then(setStatus)
        })

      return h(
        'div',
        { className: 'tg-section' },
        h('style', { key: 'styles' }, CSS),
        h('h2', { className: 'tg-title' }, t('title')),
        h('p', { className: 'tg-intro' }, t('intro')),
        h('h3', { className: 'tg-sub' }, t('rulesTitle')),
        h(Behavior, {
          t,
          status,
          setField: props.setField,
          onApplied: refresh,
        }),
        h('h3', { className: 'tg-sub' }, t('reportTitle')),
        h(Report, { t, view, onRescan: rescan }),
        h('h3', { className: 'tg-sub' }, t('ledgerTitle')),
        h(Ledger, { t, ledger: view?.ledger }),
        h('h3', { className: 'tg-sub' }, t('diagTitle')),
        h(Diagnostics, { t, status }),
        h('p', { className: 'tg-note' }, t('note')),
      )
    }

    /** Required services. `configForms` is provided by the Settings plugin. */
    const inject = ['slots', 'locale', 'configForms']

    /**
     * Register the dictionaries and the section while the Host serves its
     * configuration namespace.
     * @param {object} ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'telegrapher: dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.effect(
        () =>
          ctx.configForms.whileServed(NAMESPACES, (served) => {
            const namespace = NAMESPACES.find((candidate) => served.has(candidate))
            if (namespace === undefined) return () => {}
            const form = ctx.configForms.get(namespace)
            return ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: 'telegrapher',
                  order: 19.5,
                  label: () => t('nav'),
                  locale: NS,
                  inject: () => ({
                    setField: (field, next) => form.set(field, next),
                    form,
                  }),
                },
                Section,
              ),
            )
          }),
        'telegrapher: settings page',
      )
    }

    return { inject, apply }
  },
})
