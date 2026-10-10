import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Usage } from '../types'
import {
  bar,
  formatDuration,
  formatTokens,
  formatUsd,
  freePercent,
  topTools,
} from './format'

const PANE = 'usage-dashboard'
const PLUGIN = 'claude-usage-dashboard'

const EMPTY: Usage = {
  costUsd: null,
  lastRequestUsd: null,
  history: [],
  contextPercent: null,
  contextTokens: null,
  contextWindow: null,
  rateLimits: [],
}

const usage = atom({ plugin: PLUGIN, key: 'usage' } as const, EMPTY)
const tools = atom({ plugin: PLUGIN, key: 'tools' } as const, {})
const startedAt = atom({ plugin: PLUGIN, key: 'startedAt' } as const, 0)
const now = atom({ plugin: PLUGIN, key: 'now' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage',
      description: 'Abre el panel de consumo de Claude Code',
    })

    const session = await $.session.usage()
    const t = await $.clock.now()
    await update($, startedAt, () => session.startedAt)
    await update($, now, () => t)
    $.clock.every(1000, async () => {
      const tick = await $.clock.now()
      await update($, now, () => tick)
    })

    void $.ui.open({ id: PANE, title: 'Consumo' })

    return next(e)
  })

  on('command.run', { command: 'usage' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Consumo' })

    return { text: 'Panel de consumo abierto.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, prev => {
      const costUsd = e.cost?.usd ?? prev.costUsd
      const isNewRequest =
        e.changed.includes('cost') &&
        costUsd !== null &&
        prev.costUsd !== null &&
        costUsd > prev.costUsd
      const lastRequestUsd = isNewRequest
        ? costUsd - (prev.costUsd as number)
        : prev.lastRequestUsd

      return {
        costUsd,
        lastRequestUsd,
        history: isNewRequest && lastRequestUsd !== null
          ? [...prev.history, lastRequestUsd].slice(-20)
          : prev.history,
        contextPercent: e.context.percent ?? prev.contextPercent,
        contextTokens: e.context.tokens ?? prev.contextTokens,
        contextWindow: e.context.window,
        rateLimits: e.rateLimits.map(one => ({
          kind: one.kind,
          percentUsed: one.percentUsed,
          resetsAt: one.resetsAt,
        })),
      }
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, tools, prev => ({ ...prev, [e.tool]: (prev[e.tool] ?? 0) + 1 }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const used = await read($, tools)
    const t0 = await read($, startedAt)
    const t1 = await read($, now)

    const free = freePercent(u.contextPercent)
    const top = topTools(used, 3)
    const total = Object.values(used).reduce((sum, n) => sum + n, 0)
    const average =
      u.history.length > 0
        ? u.history.reduce((sum, n) => sum + n, 0) / u.history.length
        : null

    const Row = (props: {
      icon: string
      title: string
      subtitle: string
      value: string
      detail?: string
    }) => (
      <Box flexDirection="column" paddingY={0}>
        <Box>
          <Box width={3}>
            <Text color="magenta">{props.icon}</Text>
          </Box>
          <Box flexGrow={1}>
            <Text bold>{props.title}</Text>
          </Box>
          <Text bold color="magenta">
            {props.value}
          </Text>
        </Box>
        <Box paddingLeft={3}>
          <Text dimColor>{props.subtitle}</Text>
          {props.detail ? <Text dimColor> · {props.detail}</Text> : null}
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="column">
          <Text color="claude">✻ Claude Code</Text>
          <Text bold>TU PANEL DE</Text>
          <Text bold color="magenta">
            CONSUMO
          </Text>
        </Box>

        <Box flexDirection="column" gap={1} borderStyle="single" borderColor="magenta" padding={1}>
          <Row
            icon="$"
            title="Coste por petición"
            subtitle="Qué consume cada tarea"
            value={formatUsd(u.lastRequestUsd)}
            detail={average === null ? undefined : `media ${formatUsd(average)}`}
          />
          <Row
            icon="Σ"
            title="Coste estimado"
            subtitle="Si utilizas la API"
            value={formatUsd(u.costUsd)}
          />
          <Row
            icon="≡"
            title="Contexto disponible"
            subtitle={
              u.contextPercent === null
                ? 'Espacio de la conversación'
                : `${bar(u.contextPercent, 16)} ${formatTokens(u.contextTokens)}/${formatTokens(u.contextWindow)}`
            }
            value={free === null ? '—' : `${free}%`}
          />
          <Row
            icon="⌘"
            title="Herramientas usadas"
            subtitle={
              top.length === 0
                ? 'Actividad del agente'
                : top.map(([name, n]) => `${name} ${n}`).join(' · ')
            }
            value={String(total)}
          />
          <Row
            icon="◷"
            title="Tiempo de sesión"
            subtitle="Duración del trabajo"
            value={t0 === 0 || t1 === 0 ? '—' : formatDuration(t1 - t0)}
          />
        </Box>

        {u.rateLimits.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>Límites de tu plan</Text>
            {u.rateLimits.map(limit => (
              <Text>
                {limit.kind === 'five_hour'
                  ? '5 horas'
                  : limit.kind === 'seven_day'
                    ? '7 días '
                    : limit.kind}{' '}
                {bar(limit.percentUsed, 12)} {Math.round(limit.percentUsed)}%
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
