import { contextWindowFor, costOf, priceFor } from './pricing.mjs'
import { tokensOf } from './session.mjs'

const LIVE_MS = 15 * 60 * 1000

const sum = list => list.reduce((a, b) => a + b, 0)

function priced(session, pricing) {
  return session.requests.map(r => ({
    ...r,
    costUsd: costOf(r, priceFor(pricing, r.model ?? session.model)),
  }))
}

function costTotals(requests) {
  const known = requests.filter(r => r.costUsd !== null)
  return {
    costUsd: known.length > 0 ? sum(known.map(r => r.costUsd)) : null,
    // false cuando alguna petición no tiene precio: el total es un mínimo
    isCostComplete: known.length === requests.length,
  }
}

// Una pausa más larga que esto no cuenta como trabajo (la sesión quedó abierta o parada).
const IDLE_CAP_MS = 15 * 60 * 1000

/** Tiempo de trabajo: suma de los intervalos entre peticiones, con cada pausa recortada. */
export function activeMs(timestamps, { isLive = false, now = 0 } = {}) {
  const ordered = timestamps.filter(Number.isFinite).sort((a, b) => a - b)
  if (ordered.length === 0) return null
  let total = 0
  for (let i = 1; i < ordered.length; i++) {
    total += Math.min(ordered[i] - ordered[i - 1], IDLE_CAP_MS)
  }
  if (isLive) total += Math.min(Math.max(0, now - ordered.at(-1)), IDLE_CAP_MS)

  return total
}

function summarizeSession(session, pricing, now) {
  const requests = priced(session, pricing)
  const last = requests.at(-1)
  const known = requests.filter(r => r.costUsd !== null)
  const window =
    session.context?.window ?? contextWindowFor(pricing, session.model) ?? null
  const tokens = session.context?.tokens ?? null
  const percent = tokens !== null && window ? Math.min(100, (tokens / window) * 100) : null
  const isLive = session.endedAt !== null && now - session.endedAt < LIVE_MS
  const end = isLive ? now : session.endedAt
  const wallMs = session.startedAt !== null && end !== null ? end - session.startedAt : null

  return {
    id: session.id,
    cwd: session.cwd,
    model: session.model,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    isLive,
    elapsedMs: activeMs(session.requests.map(r => r.ts), { isLive, now }) ?? wallMs,
    wallMs,
    requests: requests.length,
    ...costTotals(requests),
    lastRequestUsd: last?.costUsd ?? null,
    averageRequestUsd: known.length > 0 ? sum(known.map(r => r.costUsd)) / known.length : null,
    toolCalls: session.toolCalls,
    toolCallsTotal: sum(Object.values(session.toolCalls)),
    context: { tokens, window, percent, freePercent: percent === null ? null : 100 - percent },
    rateLimits: session.rateLimits,
  }
}

const pad2 = n => String(n).padStart(2, '0')
const dayKey = ts => {
  const d = new Date(ts)

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Peticiones, tokens y coste por día (hora local), del más viejo al más nuevo. */
export function byDay(requests) {
  const days = new Map()
  for (const r of requests) {
    const key = dayKey(r.ts)
    const day = days.get(key) ?? { day: key, requests: 0, tokens: 0, costUsd: null }
    day.requests += 1
    day.tokens += tokensOf(r)
    if (r.costUsd !== null) day.costUsd = (day.costUsd ?? 0) + r.costUsd
    days.set(key, day)
  }

  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * Resume las sesiones de cada herramienta: la sesión activa (la de actividad más
 * reciente) y los totales del período desde `since`.
 */
export function summarize(sessionsByTool, { pricing, since = 0, now = Date.now() }) {
  return sessionsByTool.map(({ id, label, sessions }) => {
    const ordered = [...sessions].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    const inPeriod = ordered
      .map(s => ({ ...s, requests: s.requests.filter(r => r.ts >= since) }))
      .filter(s => s.requests.length > 0)
    const requests = inPeriod.flatMap(s => priced(s, pricing))

    const tools = {}
    for (const s of inPeriod) {
      for (const [name, n] of Object.entries(s.toolCalls)) tools[name] = (tools[name] ?? 0) + n
    }

    // Las sesiones vienen de la más nueva a la más vieja: la primera con
    // límites es la lectura más reciente.
    // Un límite cuya ventana ya se reinició es una lectura vieja: se oculta.
    const rateLimits = (ordered.find(s => s.rateLimits.length > 0)?.rateLimits ?? []).filter(
      l => !l.resetsAt || Date.parse(l.resetsAt) > now,
    )

    return {
      tool: id,
      label,
      active: ordered[0] ? summarizeSession(ordered[0], pricing, now) : null,
      period: {
        sessions: inPeriod.length,
        requests: requests.length,
        tokens: {
          input: sum(requests.map(r => r.input)),
          cacheRead: sum(requests.map(r => r.cacheRead)),
          cacheWrite: sum(requests.map(r => r.cacheWrite)),
          output: sum(requests.map(r => r.output)),
          total: sum(requests.map(tokensOf)),
        },
        ...costTotals(requests),
        toolCalls: tools,
        daily: byDay(requests),
      },
      rateLimits,
    }
  })
}
