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
      'mode.auto': 'Auto — rules that pay back on this profile',
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
      statPotential: 'Rule potential',
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
      headerActive: 'on',
      headerRule: 'rule',
      headerTier: 'tier',
      headerOcc: 'occ',
      headerPerSession: '/session',
      headerPayback: 'payback',
      headerStatus: 'status',
      examplesLabel: 'Examples ({count})',
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
      wordsTitle: 'Word frequency & rule workbench',
      wordsIntro:
        'Counts words and short phrases in prose (excluding code fences, inline code and paths), filters by length and BPE token cost, and shows real session fragments so you can evaluate rules to exclude, shorten or rephrase noisy words.',
      wordsChannelLabel: 'Channel',
      'wordsChannel.all': 'All prose (thinking + reply)',
      'wordsChannel.thinking': 'Thinking only',
      'wordsChannel.text': 'Reply text only',
      wordsScopeLabel: 'Text slice',
      'wordsScope.unmatched': 'After active rules (unmatched)',
      'wordsScope.raw': 'All prose (before rules)',
      wordsNgramLabel: 'Unit',
      'wordsNgram.all': 'Words & phrases (1–3)',
      'wordsNgram.1': 'Single words (1)',
      'wordsNgram.2': '2-word phrases',
      'wordsNgram.3': '3-word phrases',
      wordsMinCharsLabel: 'Min length (chars)',
      wordsMaxCharsLabel: 'Max length (0 = any)',
      wordsMinTokensLabel: 'Min BPE tokens',
      wordsLimitLabel: 'Top N',
      wordsSortLabel: 'Sort by',
      'wordsSort.totalTokens': 'Token mass (freq × BPE)',
      'wordsSort.occurrences': 'Frequency (occurrences)',
      'wordsSort.chars': 'Word length (chars)',
      'wordsSort.bpeTokens': 'BPE tokens per word',
      wordsSearchLabel: 'Search word or phrase',
      wordsSearchPlaceholder: 'e.g. actually, соответственно…',
      wordsHideStopwords: 'Hide grammatical stopwords (prepositions, conjunctions)',
      wordsOnlyCandidates: 'Only flagged filler / cliché candidates',
      wordsHeaderTerm: 'word / phrase',
      wordsHeaderChars: 'len',
      wordsHeaderBpe: 'bpe',
      wordsHeaderOcc: 'occ',
      wordsHeaderSess: 'sess',
      wordsHeaderMass: 'tokens',
      wordsHeaderAction: 'rule hint',
      wordsHeaderContext: 'context',
      wordsInspectBtn: 'Fragments ({count})',
      wordsEmpty: 'No words match the current filters.',
      'wordsAction.exclude': 'exclude',
      'wordsAction.shorten': 'shorten',
      'wordsAction.rephrase': 'rephrase',
      wordsWorkbenchTitle: 'Context & rule workbench: "{term}"',
      wordsWorkbenchMeta: '{chars} chars · {bpe} BPE tokens · {occurrences} occurrences across {sessions} sessions · {tokens} total tokens',
      wordsFragmentsTitle: 'Fragments where "{term}" appeared (click to load into rule tester)',
      wordsActionTypeLabel: 'Rule action',
      'wordsActionOption.exclude': 'Exclude (delete word/phrase)',
      'wordsActionOption.shorten': 'Shorten (replace with shorter form)',
      'wordsActionOption.rephrase': 'Rephrase (custom rewrite of fragment)',
      wordsReplacementLabel: 'Replacement (for shorten / rephrase)',
      wordsReplacementPlaceholder: 'Shorter word or leave empty to exclude',
      wordsBeforeLabel: 'Fragment before (from session)',
      wordsAfterLabel: 'Fragment after rule',
      wordsDraftRuleLabel: 'Candidate prompt rule line',
      wordsDraftDetectorLabel: 'Detector pattern (lib/detect.js)',
      wordsMeasureBtn: 'Measure in tiktoken',
      wordsMeasuring: 'Measuring…',
      wordsMeasureResult: 'Fragment: {before} → {after} tokens (delta {delta})',
      wordsCorpusProjection: 'Corpus projection ({occurrences}× across {sessions} sessions): ~{totalSaved} tokens saved (~{perSession}/session)',
      wordsPaybackStandalone: 'As new prompt line ({ruleTokens} tok): payback {payback}×',
      wordsPaybackExtend: 'Added to existing rule ({ruleHint}): near-zero prompt cost',
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
      'mode.auto': 'Авто — только окупающиеся правила профиля',
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
      statPotential: 'Потенциал правил',
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
      headerActive: 'вкл.',
      headerRule: 'правило',
      headerTier: 'уровень',
      headerOcc: 'случаи',
      headerPerSession: '/сессия',
      headerPayback: 'окупаемость',
      headerStatus: 'статус',
      examplesLabel: 'Примеры ({count})',
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
      wordsTitle: 'Частота слов и проработка правил',
      wordsIntro:
        'Подсчитывает частоту слов и коротких фраз в прозе (без блоков кода, инлайн-кода и путей), фильтрует по длине и цене в BPE-токенах и показывает реальные фрагменты из сессий для проработки правил об исключении, сокращении или перефразировании «мусорных» слов.',
      wordsChannelLabel: 'Канал',
      'wordsChannel.all': 'Вся проза (обдумывание + ответ)',
      'wordsChannel.thinking': 'Только обдумывание',
      'wordsChannel.text': 'Только текст ответа',
      wordsScopeLabel: 'Срез текста',
      'wordsScope.unmatched': 'Непокрытый остаток (после правил)',
      'wordsScope.raw': 'Весь текст (до правил)',
      wordsNgramLabel: 'Единица',
      'wordsNgram.all': 'Слова и фразы (1–3)',
      'wordsNgram.1': 'Одиночные слова (1)',
      'wordsNgram.2': 'Фразы из 2 слов',
      'wordsNgram.3': 'Фразы из 3 слов',
      wordsMinCharsLabel: 'Мин. длина (симв.)',
      wordsMaxCharsLabel: 'Макс. длина (0 = любая)',
      wordsMinTokensLabel: 'Мин. BPE-токенов',
      wordsLimitLabel: 'Топ N',
      wordsSortLabel: 'Сортировка',
      'wordsSort.totalTokens': 'По токен-массе (частота × BPE)',
      'wordsSort.occurrences': 'По частоте (вхождения)',
      'wordsSort.chars': 'По длине (символы)',
      'wordsSort.bpeTokens': 'По цене слова (BPE-токены)',
      wordsSearchLabel: 'Поиск слова или фразы',
      wordsSearchPlaceholder: 'напр. соответственно, actually…',
      wordsHideStopwords: 'Скрыть служебные слова (предлоги, союзы, местоимения)',
      wordsOnlyCandidates: 'Только кандидаты в «мусор» (филлеры и штампы)',
      wordsHeaderTerm: 'слово / фраза',
      wordsHeaderChars: 'дл.',
      wordsHeaderBpe: 'BPE',
      wordsHeaderOcc: 'част.',
      wordsHeaderSess: 'сесс.',
      wordsHeaderMass: 'токены',
      wordsHeaderAction: 'рекомендация',
      wordsHeaderContext: 'контекст',
      wordsInspectBtn: 'Фрагменты ({count})',
      wordsEmpty: 'Нет слов, подходящих под выбранные фильтры.',
      'wordsAction.exclude': 'исключить',
      'wordsAction.shorten': 'сократить',
      'wordsAction.rephrase': 'перефразировать',
      wordsWorkbenchTitle: 'Контекст и проработка правила: «{term}»',
      wordsWorkbenchMeta: 'длина {chars} симв. · {bpe} BPE-ток. · {occurrences} раз в {sessions} сесс. · всего {tokens} ток.',
      wordsFragmentsTitle: 'Фрагменты, где встретилось «{term}» (нажмите для подстановки в правило)',
      wordsActionTypeLabel: 'Действие правила',
      'wordsActionOption.exclude': 'Исключить (удалить слово/оборот)',
      'wordsActionOption.shorten': 'Сократить (заменить короткой формой)',
      'wordsActionOption.rephrase': 'Перефразировать (переписать фрагмент)',
      wordsReplacementLabel: 'Замена (для сокращения / перефразирования)',
      wordsReplacementPlaceholder: 'Короткое слово или пусто для исключения',
      wordsBeforeLabel: 'Фрагмент до (из сессии)',
      wordsAfterLabel: 'Фрагмент после применения правила',
      wordsDraftRuleLabel: 'Черновик строки правила для промпта',
      wordsDraftDetectorLabel: 'Шаблон детектора (lib/detect.js)',
      wordsMeasureBtn: 'Измерить в tiktoken',
      wordsMeasuring: 'Измеряю…',
      wordsMeasureResult: 'Фрагмент: {before} → {after} токенов (экономия {delta})',
      wordsCorpusProjection: 'Прогноз на корпус ({occurrences}× в {sessions} сесс.): ~{totalSaved} токенов (~{perSession}/сессию)',
      wordsPaybackStandalone: 'Как отдельная строка промпта ({ruleTokens} ток.): окупаемость {payback}×',
      wordsPaybackExtend: 'В составе существующего правила ({ruleHint}): без роста цены промпта',
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
.tg-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;align-items:end}
.tg-mini-btn{height:24px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-1);color:inherit;font-size:11px;cursor:pointer}
.tg-mini-btn.active{border-color:var(--dsw-alias-brand-primary);font-weight:600}
.tg-workbench{display:flex;flex-direction:column;gap:8px;margin-top:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.tg-frag{padding:6px 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;font-size:12px;line-height:17px}
.tg-frag.active{border-color:var(--dsw-alias-brand-primary)}
.tg-mark{font-weight:600;text-decoration:underline}
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
            h('option', { value: 'auto' }, t('mode.auto')),
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
      const { t, ledger, status, setField, onApplied } = props
      const order = { supported: 0, inconclusive: 1, refuted: 2, unmeasured: 3 }
      const rows = (ledger ?? [])
        .filter((entry) => entry.kind === 'rule' && entry.occurrences > 0)
        .sort((a, b) => {
          const statusOrder = (order[a.status] ?? 9) - (order[b.status] ?? 9)
          return statusOrder !== 0 ? statusOrder : b.tokens - a.tokens
        })
        .slice(0, 14)
      if (rows.length === 0) return null
      const disabledList = Array.isArray(status?.disabled) ? status.disabled : []
      const disabledSet = new Set(disabledList)
      const toggleRule = (ruleId, enabled) => {
        if (typeof setField !== 'function') return
        const next = new Set(disabledList)
        if (enabled) next.delete(ruleId)
        else next.add(ruleId)
        Promise.resolve()
          .then(() => setField('disabled', [...next]))
          .then(() => {
            if (typeof onApplied === 'function') onApplied()
          })
          .catch(() => {})
      }
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
              setField ? h('th', null, t('headerActive')) : null,
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
                setField
                  ? h(
                      'td',
                      null,
                      entry.tier
                        ? h('input', {
                            type: 'checkbox',
                            checked: !disabledSet.has(entry.rule),
                            onChange: (event) => toggleRule(entry.rule, event.target.checked),
                          })
                        : '—',
                    )
                  : null,
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
      const { t, view, status, setField, onApplied, onRescan } = props
      const [busy, setBusy] = React.useState(false)
      const report = view?.report
      const ledger = view?.ledger ?? []
      const sessions = report?.ok ? (report.scope?.sessions ?? []).slice(0, 8) : []
      const netPotential = report?.potential?.net ?? report?.potential?.gross ?? null
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
              netPotential !== null
                ? h('div', { className: 'tg-stat' }, h('b', null, fmtTokens(netPotential)), h('span', null, t('statPotential')))
                : null,
              h('div', { className: 'tg-stat' }, h('b', null, fmtTokens(view?.section?.tokens)), h('span', null, t('statSection'))),
            )
          : null,
        report && report.ok ? h(Mass, { t, report }) : null,
        report && report.ok ? h(Tools, { t, tools: report.tools }) : null,
        h(RulesTable, { t, ledger, status, setField, onApplied }),
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
              Array.isArray(entry.examples) && entry.examples.length > 0
                ? h(
                    'details',
                    null,
                    h(
                      'summary',
                      { className: 'tg-muted tg-mono' },
                      fill(t('examplesLabel'), { count: entry.examples.length }),
                    ),
                    h(
                      'ul',
                      { className: 'tg-list tg-mono tg-muted' },
                      ...entry.examples.map((ex, idx) =>
                        h('li', { key: idx }, `${ex.note ? `${ex.note}: ` : ''}${ex.snippet}`),
                      ),
                    ),
                  )
                : null,
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

    /** Filter and sort `report.words.items` on the client. */
    function filterWordsClient(wordsReport, filters) {
      const items = Array.isArray(wordsReport?.items) ? wordsReport.items : []
      const channel = filters.channel ?? 'all'
      const scope = filters.scope ?? 'unmatched'
      const ngramFilter =
        filters.ngram === undefined || filters.ngram === 'all' ? 'all' : Number(filters.ngram)
      const minChars = Number.isFinite(Number(filters.minChars)) ? Math.max(1, Number(filters.minChars)) : 4
      const maxChars =
        Number.isFinite(Number(filters.maxChars)) && Number(filters.maxChars) > 0 ? Number(filters.maxChars) : 0
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
            ? (item.snippets ?? []).filter((s) => s.channel === channel)
            : (item.snippets ?? [])

        projected.push({
          ...item,
          activeOccurrences: occ,
          activeSessions: sess,
          activeTokens: totalTokens,
          activeSnippets: snippets.length > 0 ? snippets : (item.snippets ?? []),
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

    /** Rewrite a snippet by excluding or replacing `term`. */
    function applyTermRewriteClient(snippet, term, action, replacement) {
      if (typeof snippet !== 'string' || snippet.trim() === '' || typeof term !== 'string' || term.trim() === '') {
        return String(snippet ?? '')
      }
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (action === 'exclude' || (replacement ?? '').trim() === '') {
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
      const target = replacement.trim()
      const wordBoundary = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu')
      return snippet
        .replace(wordBoundary, (matched) => {
          if (/^\p{Lu}/u.test(matched) && /^\p{Ll}/u.test(target)) {
            return target[0].toUpperCase() + target.slice(1)
          }
          return target
        })
        .replace(/\s{2,}/g, ' ')
        .trim()
    }

    /** Highlight `term` inside a context sentence. */
    function highlightTerm(text, term) {
      if (!text || !term) return text
      const lowerText = text.toLowerCase()
      const lowerTerm = term.toLowerCase()
      const idx = lowerText.indexOf(lowerTerm)
      if (idx < 0) return text
      return [
        text.slice(0, idx),
        h('span', { className: 'tg-mark', key: 'm' }, text.slice(idx, idx + term.length)),
        text.slice(idx + term.length),
      ]
    }

    /** Build a candidate prompt rule line and detector regex for the selected word/phrase. */
    function buildRuleDraft(term, action, replacement) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (action === 'shorten' && replacement.trim() !== '') {
        return {
          ruleLine: `Write "${replacement.trim()}" instead of "${term}".`,
          detectorRegex: `/(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])/giu → "${replacement.trim()}"`,
        }
      }
      if (action === 'rephrase') {
        const target = replacement.trim()
        return {
          ruleLine: target
            ? `Replace "${term}" constructions with direct "${target}".`
            : `Avoid nominalization or wrapper phrase "${term}"; state the action directly.`,
          detectorRegex: `/(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])/giu`,
        }
      }
      return {
        ruleLine: `No filler or discourse marker "${term}".`,
        detectorRegex: `/(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])[,]?\\s*/giu → ""`,
      }
    }

    /** Word frequency & context rule workbench block. */
    function WordsWorkbench(props) {
      const { t, report } = props
      const [channel, setChannel] = React.useState('all')
      const [scope, setScope] = React.useState('unmatched')
      const [ngram, setNgram] = React.useState('all')
      const [minChars, setMinChars] = React.useState(4)
      const [maxChars, setMaxChars] = React.useState(0)
      const [minTokens, setMinTokens] = React.useState(1)
      const [limit, setLimit] = React.useState(20)
      const [sort, setSort] = React.useState('totalTokens')
      const [query, setQuery] = React.useState('')
      const [hideStopwords, setHideStopwords] = React.useState(true)
      const [onlyCandidates, setOnlyCandidates] = React.useState(false)

      const [selectedTerm, setSelectedTerm] = React.useState('')
      const [snippetIdx, setSnippetIdx] = React.useState(0)
      const [actionType, setActionType] = React.useState('exclude')
      const [replacement, setReplacement] = React.useState('')
      const [customBefore, setCustomBefore] = React.useState('')
      const [customAfter, setCustomAfter] = React.useState('')
      const [measured, setMeasured] = React.useState(null)
      const [measuring, setMeasuring] = React.useState(false)

      const items = filterWordsClient(report?.words, {
        channel,
        scope,
        ngram,
        minChars,
        maxChars,
        minTokens,
        hideStopwords,
        onlyCandidates,
        query,
        sort,
        limit,
      })

      const activeItem =
        items.find((item) => item.term === selectedTerm) ??
        items.find((item) => item.suggestion) ??
        items[0] ??
        null

      const selectWord = (item) => {
        if (!item) return
        const act = item.suggestion?.action ?? 'exclude'
        const rep = item.suggestion?.replacement ?? ''
        const firstSnippet = item.activeSnippets?.[0]?.text ?? ''
        setSelectedTerm(item.term)
        setSnippetIdx(0)
        setActionType(act)
        setReplacement(rep)
        setCustomBefore(firstSnippet)
        setCustomAfter(applyTermRewriteClient(firstSnippet, item.term, act, rep))
        setMeasured(null)
      }

      const activeSnippets = activeItem?.activeSnippets ?? []
      const currentSnippet = activeSnippets[snippetIdx] ?? activeSnippets[0] ?? null
      const effectiveAction = selectedTerm === activeItem?.term ? actionType : (activeItem?.suggestion?.action ?? 'exclude')
      const effectiveReplacement =
        selectedTerm === activeItem?.term ? replacement : (activeItem?.suggestion?.replacement ?? '')
      const beforeText =
        selectedTerm === activeItem?.term && customBefore !== ''
          ? customBefore
          : (currentSnippet?.text ?? '')
      const afterText =
        selectedTerm === activeItem?.term && customAfter !== ''
          ? customAfter
          : applyTermRewriteClient(beforeText, activeItem?.term ?? '', effectiveAction, effectiveReplacement)

      const draft = activeItem
        ? buildRuleDraft(activeItem.term, effectiveAction, effectiveReplacement)
        : { ruleLine: '', detectorRegex: '' }

      const runMeasure = () => {
        if (!beforeText) return
        setMeasuring(true)
        const qs = new URLSearchParams({
          before: beforeText,
          after: afterText,
          ruleText: `- ${draft.ruleLine}`,
        })
        getJson(`${REPORT_PATH}?${qs.toString()}`)
          .then((res) => {
            if (res?.rewrite) setMeasured(res.rewrite)
          })
          .catch(() => {})
          .finally(() => setMeasuring(false))
      }

      const scannedSessions = Math.max(1, Number(report?.scannedSessions) || 1)
      const unitSaved =
        measured !== null
          ? Math.max(0, measured.delta)
          : effectiveAction === 'exclude'
            ? (activeItem?.bpeTokens ?? 1)
            : Math.max(1, (activeItem?.bpeTokens ?? 1) - 1)
      const totalSaved = (activeItem?.activeOccurrences ?? 0) * unitSaved
      const perSessionSaved = totalSaved / scannedSessions
      const ruleLineTokens = measured?.ruleTokens ?? 9
      const standalonePayback = ruleLineTokens > 0 ? perSessionSaved / ruleLineTokens : 0

      return h(
        'div',
        { className: 'tg-card' },
        h('div', { className: 'tg-hint' }, t('wordsIntro')),
        h(
          'div',
          { className: 'tg-filters' },
          h(
            Field,
            { id: 'tg-words-channel', label: t('wordsChannelLabel') },
            h(
              'select',
              {
                id: 'tg-words-channel',
                className: 'tg-select',
                value: channel,
                onChange: (e) => setChannel(e.target.value),
              },
              h('option', { value: 'all' }, t('wordsChannel.all')),
              h('option', { value: 'thinking' }, t('wordsChannel.thinking')),
              h('option', { value: 'text' }, t('wordsChannel.text')),
            ),
          ),
          h(
            Field,
            { id: 'tg-words-scope', label: t('wordsScopeLabel') },
            h(
              'select',
              {
                id: 'tg-words-scope',
                className: 'tg-select',
                value: scope,
                onChange: (e) => setScope(e.target.value),
              },
              h('option', { value: 'unmatched' }, t('wordsScope.unmatched')),
              h('option', { value: 'raw' }, t('wordsScope.raw')),
            ),
          ),
          h(
            Field,
            { id: 'tg-words-ngram', label: t('wordsNgramLabel') },
            h(
              'select',
              {
                id: 'tg-words-ngram',
                className: 'tg-select',
                value: ngram,
                onChange: (e) => setNgram(e.target.value),
              },
              h('option', { value: 'all' }, t('wordsNgram.all')),
              h('option', { value: '1' }, t('wordsNgram.1')),
              h('option', { value: '2' }, t('wordsNgram.2')),
              h('option', { value: '3' }, t('wordsNgram.3')),
            ),
          ),
          h(
            Field,
            { id: 'tg-words-sort', label: t('wordsSortLabel') },
            h(
              'select',
              {
                id: 'tg-words-sort',
                className: 'tg-select',
                value: sort,
                onChange: (e) => setSort(e.target.value),
              },
              h('option', { value: 'totalTokens' }, t('wordsSort.totalTokens')),
              h('option', { value: 'occurrences' }, t('wordsSort.occurrences')),
              h('option', { value: 'chars' }, t('wordsSort.chars')),
              h('option', { value: 'bpeTokens' }, t('wordsSort.bpeTokens')),
            ),
          ),
          h(
            Field,
            { id: 'tg-words-min-chars', label: t('wordsMinCharsLabel') },
            h('input', {
              id: 'tg-words-min-chars',
              className: 'tg-input',
              type: 'number',
              min: 1,
              max: 40,
              value: minChars,
              onChange: (e) => setMinChars(Number(e.target.value) || 1),
            }),
          ),
          h(
            Field,
            { id: 'tg-words-max-chars', label: t('wordsMaxCharsLabel') },
            h('input', {
              id: 'tg-words-max-chars',
              className: 'tg-input',
              type: 'number',
              min: 0,
              max: 60,
              value: maxChars,
              onChange: (e) => setMaxChars(Math.max(0, Number(e.target.value) || 0)),
            }),
          ),
          h(
            Field,
            { id: 'tg-words-min-tokens', label: t('wordsMinTokensLabel') },
            h('input', {
              id: 'tg-words-min-tokens',
              className: 'tg-input',
              type: 'number',
              min: 1,
              max: 10,
              value: minTokens,
              onChange: (e) => setMinTokens(Math.max(1, Number(e.target.value) || 1)),
            }),
          ),
          h(
            Field,
            { id: 'tg-words-limit', label: t('wordsLimitLabel') },
            h(
              'select',
              {
                id: 'tg-words-limit',
                className: 'tg-select',
                value: String(limit),
                onChange: (e) => setLimit(Number(e.target.value) || 20),
              },
              h('option', { value: '10' }, '10'),
              h('option', { value: '20' }, '20'),
              h('option', { value: '50' }, '50'),
              h('option', { value: '100' }, '100'),
            ),
          ),
        ),
        h(
          Field,
          { id: 'tg-words-search', label: t('wordsSearchLabel') },
          h('input', {
            id: 'tg-words-search',
            className: 'tg-input',
            type: 'text',
            placeholder: t('wordsSearchPlaceholder'),
            value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
        ),
        h(
          'div',
          { className: 'tg-actions' },
          h(
            'label',
            { className: 'tg-check' },
            h('input', {
              type: 'checkbox',
              checked: hideStopwords,
              onChange: (e) => setHideStopwords(e.target.checked),
            }),
            t('wordsHideStopwords'),
          ),
          h(
            'label',
            { className: 'tg-check' },
            h('input', {
              type: 'checkbox',
              checked: onlyCandidates,
              onChange: (e) => setOnlyCandidates(e.target.checked),
            }),
            t('wordsOnlyCandidates'),
          ),
        ),
        items.length === 0
          ? h('div', { className: 'tg-hint' }, t('wordsEmpty'))
          : h(
              'table',
              { className: 'tg-table' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', null, t('wordsHeaderTerm')),
                  h('th', { className: 'tg-num' }, t('wordsHeaderChars')),
                  h('th', { className: 'tg-num' }, t('wordsHeaderBpe')),
                  h('th', { className: 'tg-num' }, t('wordsHeaderOcc')),
                  h('th', { className: 'tg-num' }, t('wordsHeaderSess')),
                  h('th', { className: 'tg-num' }, t('wordsHeaderMass')),
                  h('th', null, t('wordsHeaderAction')),
                  h('th', null, t('wordsHeaderContext')),
                ),
              ),
              h(
                'tbody',
                null,
                ...items.map((item) => {
                  const isSelected = activeItem?.term === item.term
                  const act = item.suggestion?.action
                  const tone = act === 'exclude' ? 'bad' : act === 'shorten' ? 'warn' : 'ok'
                  return h(
                    'tr',
                    { key: item.term },
                    h('td', { className: 'tg-mono' }, item.term),
                    h('td', { className: 'tg-num' }, String(item.chars)),
                    h('td', { className: 'tg-num' }, String(item.bpeTokens)),
                    h('td', { className: 'tg-num' }, String(item.activeOccurrences)),
                    h('td', { className: 'tg-num' }, String(item.activeSessions)),
                    h('td', { className: 'tg-num' }, fmtTokens(item.activeTokens)),
                    h(
                      'td',
                      null,
                      act ? h('span', { className: `tg-chip ${tone}` }, t(`wordsAction.${act}`)) : '—',
                    ),
                    h(
                      'td',
                      null,
                      h(
                        'button',
                        {
                          type: 'button',
                          className: `tg-mini-btn${isSelected ? ' active' : ''}`,
                          onClick: () => selectWord(item),
                        },
                        fill(t('wordsInspectBtn'), { count: (item.activeSnippets ?? []).length }),
                      ),
                    ),
                  )
                }),
              ),
            ),
        activeItem
          ? h(
              'div',
              { className: 'tg-workbench' },
              h(
                'div',
                { className: 'tg-label' },
                fill(t('wordsWorkbenchTitle'), { term: activeItem.term }),
              ),
              h(
                'div',
                { className: 'tg-muted tg-mono' },
                fill(t('wordsWorkbenchMeta'), {
                  chars: activeItem.chars,
                  bpe: activeItem.bpeTokens,
                  occurrences: activeItem.activeOccurrences,
                  sessions: activeItem.activeSessions,
                  tokens: fmtTokens(activeItem.activeTokens),
                }),
              ),
              activeItem.suggestion?.reason
                ? h('div', { className: 'tg-hint' }, activeItem.suggestion.reason)
                : null,
              activeSnippets.length > 0
                ? h(
                    'div',
                    { className: 'tg-row' },
                    h(
                      'div',
                      { className: 'tg-hint' },
                      fill(t('wordsFragmentsTitle'), { term: activeItem.term }),
                    ),
                    ...activeSnippets.map((frag, idx) =>
                      h(
                        'div',
                        {
                          key: `${frag.session}-${idx}`,
                          className: `tg-frag${idx === snippetIdx ? ' active' : ''}`,
                          onClick: () => {
                            setSelectedTerm(activeItem.term)
                            setSnippetIdx(idx)
                            setCustomBefore(frag.text)
                            setCustomAfter(
                              applyTermRewriteClient(
                                frag.text,
                                activeItem.term,
                                effectiveAction,
                                effectiveReplacement,
                              ),
                            )
                            setMeasured(null)
                          },
                        },
                        h(
                          'div',
                          { className: 'tg-muted tg-mono' },
                          `${frag.session} · ${frag.channel} · ${frag.tokens} tok`,
                        ),
                        h('div', null, highlightTerm(frag.text, activeItem.term)),
                      ),
                    ),
                  )
                : null,
              h(
                'div',
                { className: 'tg-filters' },
                h(
                  Field,
                  { id: 'tg-wb-action', label: t('wordsActionTypeLabel') },
                  h(
                    'select',
                    {
                      id: 'tg-wb-action',
                      className: 'tg-select',
                      value: effectiveAction,
                      onChange: (e) => {
                        const nextAct = e.target.value
                        setSelectedTerm(activeItem.term)
                        setActionType(nextAct)
                        setCustomBefore(beforeText)
                        setCustomAfter(
                          applyTermRewriteClient(beforeText, activeItem.term, nextAct, effectiveReplacement),
                        )
                        setMeasured(null)
                      },
                    },
                    h('option', { value: 'exclude' }, t('wordsActionOption.exclude')),
                    h('option', { value: 'shorten' }, t('wordsActionOption.shorten')),
                    h('option', { value: 'rephrase' }, t('wordsActionOption.rephrase')),
                  ),
                ),
                h(
                  Field,
                  { id: 'tg-wb-replace', label: t('wordsReplacementLabel') },
                  h('input', {
                    id: 'tg-wb-replace',
                    className: 'tg-input',
                    type: 'text',
                    placeholder: t('wordsReplacementPlaceholder'),
                    value: effectiveReplacement,
                    onChange: (e) => {
                      const nextRep = e.target.value
                      setSelectedTerm(activeItem.term)
                      setReplacement(nextRep)
                      const nextAct = nextRep.trim() !== '' && effectiveAction === 'exclude' ? 'shorten' : effectiveAction
                      setActionType(nextAct)
                      setCustomBefore(beforeText)
                      setCustomAfter(applyTermRewriteClient(beforeText, activeItem.term, nextAct, nextRep))
                      setMeasured(null)
                    },
                  }),
                ),
              ),
              h(
                Field,
                { id: 'tg-wb-before', label: t('wordsBeforeLabel') },
                h('input', {
                  id: 'tg-wb-before',
                  className: 'tg-input tg-mono',
                  type: 'text',
                  value: beforeText,
                  onChange: (e) => {
                    setSelectedTerm(activeItem.term)
                    setCustomBefore(e.target.value)
                    setMeasured(null)
                  },
                }),
              ),
              h(
                Field,
                { id: 'tg-wb-after', label: t('wordsAfterLabel') },
                h('input', {
                  id: 'tg-wb-after',
                  className: 'tg-input tg-mono',
                  type: 'text',
                  value: afterText,
                  onChange: (e) => {
                    setSelectedTerm(activeItem.term)
                    setCustomAfter(e.target.value)
                    setMeasured(null)
                  },
                }),
              ),
              h(
                'div',
                { className: 'tg-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'tg-button',
                    disabled: measuring || !beforeText,
                    onClick: runMeasure,
                  },
                  measuring ? t('wordsMeasuring') : t('wordsMeasureBtn'),
                ),
                measured
                  ? h(
                      'span',
                      { className: 'tg-mono' },
                      fill(t('wordsMeasureResult'), {
                        before: measured.beforeTokens,
                        after: measured.afterTokens,
                        delta: measured.delta,
                      }),
                    )
                  : null,
              ),
              h(
                'div',
                { className: 'tg-muted tg-mono' },
                fill(t('wordsCorpusProjection'), {
                  occurrences: activeItem.activeOccurrences,
                  sessions: activeItem.activeSessions,
                  totalSaved: fmtTokens(totalSaved),
                  perSession: fmtTokens(perSessionSaved),
                }),
              ),
              h(
                'div',
                { className: 'tg-entry-head' },
                h(
                  'span',
                  { className: `tg-chip ${standalonePayback >= 1 ? 'ok' : 'warn'}` },
                  fill(t('wordsPaybackStandalone'), {
                    ruleTokens: ruleLineTokens,
                    payback: standalonePayback.toFixed(1),
                  }),
                ),
                activeItem.suggestion?.ruleHint
                  ? h(
                      'span',
                      { className: 'tg-chip ok' },
                      fill(t('wordsPaybackExtend'), { ruleHint: activeItem.suggestion.ruleHint }),
                    )
                  : null,
              ),
              h(
                Field,
                { id: 'tg-wb-rule-draft', label: t('wordsDraftRuleLabel') },
                h('pre', { className: 'tg-pre' }, `- ${draft.ruleLine}\n// ${t('wordsDraftDetectorLabel')}: ${draft.detectorRegex}`),
              ),
            )
          : null,
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
        h(Report, {
          t,
          view,
          status,
          setField: props.setField,
          onApplied: refresh,
          onRescan: rescan,
        }),
        h('h3', { className: 'tg-sub' }, t('wordsTitle')),
        h(WordsWorkbench, { t, report: view?.report }),
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
