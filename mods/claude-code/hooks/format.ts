export const formatUsd = (usd: number | null): string => {
  if (usd === null) return '—'
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`

  return `$${usd.toFixed(2)}`
}

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, '0')

  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

export const formatTokens = (tokens: number | null): string => {
  if (tokens === null) return '—'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`

  return String(tokens)
}

export const bar = (percent: number, width: number): string => {
  const clamped = Math.min(100, Math.max(0, percent))
  const filled = Math.round((clamped / 100) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Cuánto contexto queda libre, en porcentaje entero. */
export const freePercent = (used: number | null): number | null =>
  used === null ? null : Math.max(0, Math.round(100 - used))

export const topTools = (
  tools: Record<string, number>,
  limit: number,
): [string, number][] =>
  Object.entries(tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
