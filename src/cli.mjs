#!/usr/bin/env node
import { adapters } from './adapters/index.mjs'
import { collect } from './collect.mjs'
import { DEFAULT_PRICING_FILE } from './pricing.mjs'
import { renderBoard } from './render.mjs'
import { serve } from './server.mjs'

const HELP = `usage-board — tablero de consumo para agentes de código

Uso: usage-board [opciones]

  --serve           abre el tablero visual en http://127.0.0.1:3939
  --port <n>        puerto para --serve (por defecto 3939)
  --tool <ids>      herramientas separadas por coma (por defecto: todas)
                    disponibles: ${adapters.map(a => a.id).join(', ')}
  --since <valor>   período de los totales: today, 24h, 7d, 30d, all (por defecto 7d)
  --project [ruta]  solo sesiones de esa carpeta (y sus subcarpetas);
                    sin ruta usa la carpeta actual
  --watch           refresca el tablero de la terminal cada 2 segundos
  --json            imprime los datos en JSON en lugar del tablero
  --pricing <ruta>  tabla de precios alternativa (por defecto pricing.json)
  --no-color        sin colores
  -h, --help        esta ayuda
`

function parseArgs(argv) {
  const args = {
    tool: null, since: '7d', project: null, watch: false, json: false, serve: false,
    port: 3939, pricing: DEFAULT_PRICING_FILE, color: process.stdout.isTTY,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') args.help = true
    else if (arg === '--watch') args.watch = true
    else if (arg === '--json') args.json = true
    else if (arg === '--serve') args.serve = true
    else if (arg === '--no-color') args.color = false
    else if (arg === '--port') args.port = Number(argv[++i])
    else if (arg === '--tool') args.tool = (argv[++i] ?? '').split(',').filter(Boolean)
    else if (arg === '--project') {
      const next = argv[i + 1]
      const hasPath = next !== undefined && !next.startsWith('-')
      args.project = hasPath ? argv[++i] : process.cwd()
    } else if (arg === '--since') args.since = argv[++i] ?? args.since
    else if (arg === '--pricing') args.pricing = argv[++i] ?? args.pricing
    else throw new Error(`Opción desconocida: ${arg}`)
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    throw new Error('--port debe ser un número entre 1 y 65535')
  }

  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return console.log(HELP)

  if (args.serve) {
    return serve({ port: args.port, pricingFile: args.pricing, defaults: { since: args.since, project: args.project } })
  }

  const draw = () => {
    const { summaries, label } = collect({
      tool: args.tool, since: args.since, project: args.project, pricingFile: args.pricing,
    })

    return args.json
      ? JSON.stringify(summaries, null, 2)
      : renderBoard(summaries, { useColor: args.color, periodLabel: label })
  }

  if (!args.watch || args.json) return console.log(draw())

  const tick = () => process.stdout.write(`\x1b[2J\x1b[H${draw()}\n\n(Ctrl+C para salir)\n`)
  tick()
  setInterval(tick, 2000)
}

try {
  main()
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
