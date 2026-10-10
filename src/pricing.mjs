import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PRICING_FILE = path.join(HERE, '..', 'pricing.json')

export function loadPricing(file = DEFAULT_PRICING_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  return {
    models: (raw.models ?? []).map(m => ({ ...m, regex: new RegExp(m.match, 'i') })),
  }
}

/** Entrada de la tabla para un modelo, o null si no hay ninguna. */
export function priceFor(pricing, model) {
  if (!model) return null
  return pricing.models.find(m => m.regex.test(model)) ?? null
}

/**
 * Coste en USD de una petición normalizada, o null si falta algún precio
 * de los componentes que la petición usó.
 */
export function costOf(request, price) {
  if (!price) return null
  const parts = [
    [request.input, price.input],
    [request.cacheRead, price.cacheRead],
    [request.cacheWrite, price.cacheWrite],
    [request.output, price.output],
  ]
  let total = 0
  for (const [tokens, perMillion] of parts) {
    if (!tokens) continue
    if (perMillion === null || perMillion === undefined) return null
    total += (tokens * perMillion) / 1_000_000
  }
  return total
}

export function contextWindowFor(pricing, model) {
  return priceFor(pricing, model)?.context ?? null
}
