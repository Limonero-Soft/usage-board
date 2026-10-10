export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  /** Coste acumulado de la sesión en USD (null hasta la primera medición). */
  costUsd: number | null
  /** Coste de la última petición (diferencia entre dos mediciones). */
  lastRequestUsd: number | null
  /** Últimas peticiones, de la más vieja a la más nueva. */
  history: number[]
  /** Porcentaje de contexto usado, 0 a 100. */
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number | null
  rateLimits: RateLimit[]
}

declare module 'claude-code' {
  interface PluginState {
    'claude-usage-dashboard': {
      usage: Usage
      tools: Record<string, number>
      startedAt: number
      now: number
    }
  }
}
