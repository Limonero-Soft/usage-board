import {
  bar,
  baseName,
  formatDuration,
  formatTokens,
  formatUsd,
  rateLabel,
  topTools,
} from './format.mjs'

const WIDTH = 60

export function makeStyle(useColor) {
  const wrap = code => text => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)

  return { bold: wrap('1'), dim: wrap('2'), accent: wrap('95'), tool: wrap('96') }
}

const visible = text => text.replace(/\x1b\[[0-9;]*m/g, '')
const pad = (left, right) =>
  left + ' '.repeat(Math.max(1, WIDTH - visible(left).length - visible(right).length)) + right

function row(style, { icon, title, subtitle, value }) {
  return [
    pad(`${style.accent(icon)}  ${style.bold(title)}`, style.accent(value)),
    `   ${style.dim(subtitle)}`,
    '',
  ]
}

function toolBoard(style, summary) {
  const { active, period } = summary
  const lines = [style.tool(`● ${summary.label}`)]

  if (!active) {
    lines.push(style.dim('   Sin sesiones en el período.'), '')
    return lines
  }

  const where = [baseName(active.cwd), active.model].filter(Boolean).join(' · ')
  lines.push(style.dim(`   ${active.isLive ? 'sesión en curso' : 'última sesión'} · ${where}`), '')

  const average =
    active.averageRequestUsd === null ? '' : ` · media ${formatUsd(active.averageRequestUsd)}`
  const ctx = active.context
  const top = topTools(active.toolCalls, 3)

  lines.push(
    ...row(style, {
      icon: '$',
      title: 'Coste por petición',
      subtitle: `Qué consume cada tarea${average}`,
      value: formatUsd(active.lastRequestUsd),
    }),
    ...row(style, {
      icon: 'Σ',
      title: 'Coste estimado',
      subtitle: `Si utilizas la API · ${active.requests} peticiones`,
      value: formatUsd(active.costUsd, { isComplete: active.isCostComplete }),
    }),
    ...row(style, {
      icon: '≡',
      title: 'Contexto disponible',
      subtitle:
        ctx.percent === null
          ? 'Espacio de la conversación'
          : `${bar(ctx.percent, 16)} ${formatTokens(ctx.tokens)}/${formatTokens(ctx.window)}`,
      value: ctx.freePercent === null ? '—' : `${Math.round(ctx.freePercent)}%`,
    }),
    ...row(style, {
      icon: '⌘',
      title: 'Herramientas usadas',
      subtitle: top.length === 0 ? 'Actividad del agente' : top.map(([n, c]) => `${n} ${c}`).join(' · '),
      value: String(active.toolCallsTotal),
    }),
    ...row(style, {
      icon: '◷',
      title: 'Tiempo de sesión',
      subtitle: 'Tiempo de trabajo (pausas de más de 15 min no cuentan)',
      value: formatDuration(active.elapsedMs),
    }),
  )

  for (const limit of summary.rateLimits) {
    lines.push(
      style.dim(`   Límite ${rateLabel(limit.kind)}  ${bar(limit.percentUsed, 12)} ${Math.round(limit.percentUsed)}%`),
    )
  }
  if (summary.rateLimits.length > 0) lines.push('')

  lines.push(
    style.dim(
      `   Período: ${period.sessions} sesiones · ${period.requests} peticiones · ` +
        `${formatTokens(period.tokens.total)} tokens · ${formatUsd(period.costUsd, { isComplete: period.isCostComplete })}`,
    ),
    '',
  )
  return lines
}

export function renderBoard(summaries, { useColor = false, periodLabel = '' } = {}) {
  const style = makeStyle(useColor)
  const lines = [
    style.bold('TU PANEL DE ') + style.accent(style.bold('CONSUMO')) + (periodLabel ? style.dim(`  ·  ${periodLabel}`) : ''),
    style.dim('─'.repeat(WIDTH)),
    '',
  ]

  for (const summary of summaries) lines.push(...toolBoard(style, summary))

  const all = summaries.filter(s => s.period.requests > 0)
  if (all.length > 1) {
    const known = all.filter(s => s.period.costUsd !== null)
    const total = known.reduce((a, s) => a + s.period.costUsd, 0)
    const isComplete = known.length === all.length && all.every(s => s.period.isCostComplete)
    lines.push(
      style.dim('─'.repeat(WIDTH)),
      pad(style.bold('Total, todas las herramientas'), style.accent(formatUsd(known.length ? total : null, { isComplete }))),
    )
  }

  return lines.join('\n')
}
