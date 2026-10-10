/**
 * Formato común que producen todos los adaptadores.
 *
 * Session = {
 *   tool, id, cwd, model, startedAt, endedAt,        // tiempos en ms
 *   requests: [{ ts, model, input, cacheRead, cacheWrite, output }],
 *   toolCalls: { [nombre]: cantidad },
 *   context: { tokens, window } | null,               // la última petición
 *   rateLimits: [{ kind, percentUsed, resetsAt? }],
 * }
 *
 * `input` son los tokens de entrada SIN caché; la lectura y escritura de
 * caché van aparte, para que el coste se calcule igual en cualquier herramienta.
 */
export function newSession(tool, id) {
  return {
    tool,
    id,
    cwd: null,
    model: null,
    startedAt: null,
    endedAt: null,
    requests: [],
    toolCalls: {},
    context: null,
    rateLimits: [],
  }
}

export function touch(session, ts) {
  if (!Number.isFinite(ts)) return
  if (session.startedAt === null || ts < session.startedAt) session.startedAt = ts
  if (session.endedAt === null || ts > session.endedAt) session.endedAt = ts
}

export function tokensOf(request) {
  return request.input + request.cacheRead + request.cacheWrite + request.output
}
