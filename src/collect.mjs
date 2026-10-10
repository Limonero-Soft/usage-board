import path from 'node:path'

import { adapters } from './adapters/index.mjs'
import { summarize } from './aggregate.mjs'
import { baseName } from './format.mjs'
import { DEFAULT_PRICING_FILE, loadPricing } from './pricing.mjs'
import { isInProject, normalizeCwd } from './project.mjs'

export function sinceToMs(value, now = Date.now()) {
  if (value === 'all') return { ms: 0, label: 'todo el historial' }
  if (value === 'today') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return { ms: d.getTime(), label: 'hoy' }
  }
  const m = /^(\d+)([hd])$/.exec(value ?? '')
  if (!m) throw new Error(`--since inválido: ${value} (probá today, 24h, 7d, 30d o all)`)
  const unit = m[2] === 'h' ? 3_600_000 : 86_400_000

  return { ms: now - Number(m[1]) * unit, label: `últimos ${m[1]}${m[2]}` }
}

/** Carpetas distintas con sesiones, la de actividad más reciente primero. */
function listProjects(sessionsByTool) {
  const found = new Map()
  for (const { sessions } of sessionsByTool) {
    for (const s of sessions) {
      if (!s.cwd) continue
      const key = normalizeCwd(s.cwd)
      const entry = found.get(key) ?? { path: s.cwd, name: baseName(s.cwd), sessions: 0, lastAt: 0 }
      entry.sessions += 1
      entry.lastAt = Math.max(entry.lastAt, s.endedAt ?? 0)
      found.set(key, entry)
    }
  }

  return [...found.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 40)
}

/**
 * Lee las herramientas pedidas y arma los resúmenes.
 * `tool`: lista de ids o null para todas. `project`: carpeta o null.
 */
export function collect({ tool = null, since = '7d', project = null, pricingFile = DEFAULT_PRICING_FILE } = {}) {
  const now = Date.now()
  const { ms, label } = sinceToMs(since, now)
  const chosen = tool ? adapters.filter(a => tool.includes(a.id)) : adapters
  if (chosen.length === 0) throw new Error(`Ninguna herramienta coincide con: ${tool.join(', ')}`)

  const pricing = loadPricing(pricingFile)
  const loaded = chosen.map(a => ({ id: a.id, label: a.label, sessions: a.load({ since: ms }) }))
  const sessionsByTool = project
    ? loaded.map(t => ({ ...t, sessions: t.sessions.filter(s => isInProject(s.cwd, project)) }))
    : loaded
  const where = project ? `  ·  proyecto: ${baseName(path.resolve(project))}` : ''

  return {
    summaries: summarize(sessionsByTool, { pricing, since: ms, now }),
    label: label + where,
    projects: listProjects(loaded),
    generatedAt: now,
  }
}
