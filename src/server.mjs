import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { adapters } from './adapters/index.mjs'
import { collect } from './collect.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PAGE = path.join(HERE, 'web', 'index.html')
const HOST = '127.0.0.1'

const send = (res, status, type, body) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

/**
 * El servidor solo escucha en 127.0.0.1 y rechaza cualquier Host que no sea local,
 * para que una página web cualquiera no pueda leer tus datos de uso (DNS rebinding).
 */
export function isLocalHost(header, port) {
  return header === `127.0.0.1:${port}` || header === `localhost:${port}`
}

// Leer todos los logs tarda varios segundos: se guarda el resultado un rato por consulta.
const CACHE_MS = 10_000

export function createServer({ port, pricingFile, defaults = {} }) {
  const cache = new Map()
  const cached = (key, compute) => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.json
    const json = JSON.stringify(compute())
    cache.set(key, { at: Date.now(), json })
    if (cache.size > 30) cache.delete(cache.keys().next().value)

    return json
  }

  return http.createServer((req, res) => {
    if (!isLocalHost(req.headers.host, port)) return send(res, 403, 'text/plain', 'Forbidden')
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method Not Allowed')

    const url = new URL(req.url, `http://${HOST}:${port}`)

    if (url.pathname === '/') {
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(PAGE))
    }

    if (url.pathname === '/api/summary') {
      try {
        const toolParam = url.searchParams.get('tool')
        const tool = toolParam ? toolParam.split(',').filter(id => adapters.some(a => a.id === id)) : null
        const query = {
          tool: tool?.length ? tool : null,
          since: url.searchParams.get('since') || defaults.since || '7d',
          project: url.searchParams.get('project') || defaults.project || null,
          pricingFile,
        }
        const json = cached(JSON.stringify(query), () => collect(query))

        return send(res, 200, 'application/json; charset=utf-8', json)
      } catch (error) {
        return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: error.message }))
      }
    }

    return send(res, 404, 'text/plain', 'Not Found')
  })
}

export function serve({ port, pricingFile, defaults }) {
  const server = createServer({ port, pricingFile, defaults })
  server.on('error', error => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `El puerto ${port} está ocupado. Probá con --port <otro>.`
        : `Error: ${error.message}`,
    )
    process.exit(1)
  })
  server.listen(port, HOST, () => {
    console.log(`Tablero de consumo en http://${HOST}:${port}  (Ctrl+C para salir)`)
  })

  return server
}
