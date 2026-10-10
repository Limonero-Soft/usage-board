import os from 'node:os'
import path from 'node:path'

import { jsonlFiles, readJsonl } from '../files.mjs'
import { newSession, touch } from '../session.mjs'

export const defaultHome = () => process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')

const RATE_KINDS = { 300: 'five_hour', 10080: 'seven_day', 43200: 'thirty_day' }

function rateLimitsOf(payload) {
  const out = []
  for (const slot of [payload?.rate_limits?.primary, payload?.rate_limits?.secondary]) {
    if (!slot || typeof slot.used_percent !== 'number') continue
    out.push({
      kind: RATE_KINDS[slot.window_minutes] ?? `${slot.window_minutes ?? '?'}m`,
      percentUsed: slot.used_percent,
      resetsAt: slot.resets_at ? new Date(slot.resets_at * 1000).toISOString() : undefined,
    })
  }
  return out
}

/**
 * Codex guarda un archivo por sesión en ~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl
 * (y los viejos en archived_sessions/). Cada `token_count` trae el uso de la última
 * petición y el acumulado; el mismo evento se repite, así que solo se cuenta cuando
 * el acumulado crece.
 *
 * En OpenAI `input_tokens` ya incluye los tokens en caché: se restan para que
 * `input` signifique "sin caché", igual que en el resto de los adaptadores.
 */
export const codex = {
  id: 'codex',
  label: 'Codex',

  load({ since = 0, home = defaultHome() } = {}) {
    const files = [
      ...jsonlFiles(path.join(home, 'sessions'), since),
      ...jsonlFiles(path.join(home, 'archived_sessions'), since),
    ]
    const out = []

    for (const file of files) {
      const session = newSession('codex', path.basename(file, '.jsonl'))
      const seenCalls = new Set()
      let lastTotal = -1

      for (const line of readJsonl(file)) {
        const ts = Date.parse(line.timestamp)
        touch(session, ts)
        const payload = line.payload ?? {}

        if (line.type === 'session_meta') {
          session.id = payload.id ?? session.id
          session.cwd = payload.cwd ?? session.cwd
        } else if (line.type === 'turn_context') {
          session.model = payload.model ?? session.model
          session.cwd = session.cwd ?? payload.cwd ?? null
        } else if (line.type === 'response_item') {
          if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
            const id = payload.call_id ?? payload.id
            if (id && seenCalls.has(id)) continue
            if (id) seenCalls.add(id)
            const name = payload.name ?? 'desconocida'
            session.toolCalls[name] = (session.toolCalls[name] ?? 0) + 1
          }
        } else if (line.type === 'event_msg' && payload.type === 'token_count') {
          const limits = rateLimitsOf(payload)
          if (limits.length > 0) session.rateLimits = limits

          const info = payload.info
          if (!info) continue
          const total = info.total_token_usage?.total_tokens ?? 0
          const last = info.last_token_usage
          if (!last || total <= lastTotal) continue
          lastTotal = total

          const cached = last.cached_input_tokens ?? 0
          session.requests.push({
            ts,
            model: session.model,
            input: Math.max(0, (last.input_tokens ?? 0) - cached),
            cacheRead: cached,
            cacheWrite: last.cache_write_input_tokens ?? 0,
            output: last.output_tokens ?? 0,
          })
          session.context = {
            tokens: last.input_tokens ?? 0,
            window: info.model_context_window ?? null,
          }
        }
      }

      if (session.requests.length > 0 || Object.keys(session.toolCalls).length > 0) {
        out.push(session)
      }
    }
    return out
  },
}
