export const formatUsd = (usd, { isComplete = true } = {}) => {
  if (usd === null || usd === undefined) return '—'
  const text = usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`

  return isComplete ? text : `≥ ${text}`
}

export const formatDuration = ms => {
  if (ms === null || ms === undefined) return '—'
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = n => String(n).padStart(2, '0')

  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

export const formatTokens = tokens => {
  if (tokens === null || tokens === undefined) return '—'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`

  return String(tokens)
}

export const bar = (percent, width) => {
  const clamped = Math.min(100, Math.max(0, percent))
  const filled = Math.round((clamped / 100) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const topTools = (tools, limit) =>
  Object.entries(tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

const RATE_LABELS = { five_hour: '5 horas', seven_day: '7 días', thirty_day: '30 días' }
export const rateLabel = kind => RATE_LABELS[kind] ?? kind

export const baseName = p => (p ? p.split(/[\\/]/).filter(Boolean).at(-1) : null)
