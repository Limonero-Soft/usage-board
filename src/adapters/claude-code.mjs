import os from 'node:os'
import path from 'node:path'

import { jsonlFiles, readJsonl } from '../files.mjs'
import { newSession, touch } from '../session.mjs'

export const defaultHome = () =>
  process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')

/**
 * Claude Code guarda cada conversación en ~/.claude/projects/<proyecto>/<sesión>.jsonl.
 * Una misma respuesta puede aparecer en varias líneas (una por bloque de contenido)
 * con el mismo message.id; se cuenta una vez, con el último `usage`, que es el final.
 */
export const claudeCode = {
  id: 'claude-code',
  label: 'Claude Code',

  load({ since = 0, home = defaultHome() } = {}) {
    const sessions = new Map()
    const messages = new Map() // sessionId -> Map(message.id -> petición)
    const calls = new Map() // sessionId -> Map(tool_use.id -> nombre)

    for (const file of jsonlFiles(path.join(home, 'projects'), since)) {
      for (const line of readJsonl(file)) {
        const sid = line.sessionId
        if (!sid) continue

        let session = sessions.get(sid)
        if (!session) {
          session = newSession('claude-code', sid)
          sessions.set(sid, session)
          messages.set(sid, new Map())
          calls.set(sid, new Map())
        }

        const ts = Date.parse(line.timestamp)
        touch(session, ts)
        if (!session.cwd && line.cwd) session.cwd = line.cwd

        const message = line.message
        if (line.type !== 'assistant' || !message) continue

        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block?.type === 'tool_use' && block.id) {
            calls.get(sid).set(block.id, block.name ?? 'desconocida')
          }
        }

        const usage = message.usage
        if (!usage || message.model === '<synthetic>') continue

        const key = message.id ?? line.uuid
        messages.get(sid).set(key, {
          ts,
          model: message.model ?? null,
          input: usage.input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          cacheWrite: usage.cache_creation_input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
        })
      }
    }

    const out = []
    for (const [sid, session] of sessions) {
      session.requests = [...messages.get(sid).values()].sort((a, b) => a.ts - b.ts)
      for (const name of calls.get(sid).values()) {
        session.toolCalls[name] = (session.toolCalls[name] ?? 0) + 1
      }
      const last = session.requests.at(-1)
      if (last) {
        session.model = last.model
        // La ventana no está en el log: la completa quien agrega, según el modelo.
        session.context = { tokens: last.input + last.cacheRead + last.cacheWrite, window: null }
      }
      if (session.requests.length > 0 || Object.keys(session.toolCalls).length > 0) {
        out.push(session)
      }
    }
    return out
  },
}
