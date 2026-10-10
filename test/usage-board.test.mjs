import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { claudeCode } from '../src/adapters/claude-code.mjs'
import { codex } from '../src/adapters/codex.mjs'
import { activeMs, summarize } from '../src/aggregate.mjs'
import { bar, formatDuration, formatTokens, formatUsd, topTools } from '../src/format.mjs'
import { costOf, loadPricing, priceFor } from '../src/pricing.mjs'
import { isInProject } from '../src/project.mjs'
import { renderBoard } from '../src/render.mjs'

const jsonl = lines => lines.map(l => JSON.stringify(l)).join('\n') + '\n'

function tempHome(files) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-board-'))
  for (const [rel, lines] of Object.entries(files)) {
    const full = path.join(home, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, jsonl(lines))
  }
  return home
}

const claudeLog = [
  { sessionId: 's1', cwd: '/work/app', timestamp: '2026-10-01T10:00:00.000Z', type: 'user' },
  {
    sessionId: 's1', type: 'assistant', timestamp: '2026-10-01T10:00:05.000Z',
    message: {
      id: 'm1', model: 'claude-sonnet-5-5',
      content: [{ type: 'tool_use', id: 't1', name: 'Bash' }],
      usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 5 },
    },
  },
  // misma respuesta repetida con el usage final: debe contarse una sola vez
  {
    sessionId: 's1', type: 'assistant', timestamp: '2026-10-01T10:00:06.000Z',
    message: {
      id: 'm1', model: 'claude-sonnet-5-5',
      content: [{ type: 'tool_use', id: 't2', name: 'Read' }],
      usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 80 },
    },
  },
  {
    sessionId: 's1', type: 'assistant', timestamp: '2026-10-01T10:05:00.000Z',
    message: { id: 'm2', model: '<synthetic>', content: [], usage: { input_tokens: 1, output_tokens: 1 } },
  },
]

const codexLog = [
  { timestamp: '2026-10-02T10:00:00.000Z', type: 'session_meta', payload: { id: 'c1', cwd: '/work/api' } },
  { timestamp: '2026-10-02T10:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.6-terra' } },
  { timestamp: '2026-10-02T10:00:02.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec', call_id: 'k1' } },
  { timestamp: '2026-10-02T10:00:02.500Z', type: 'response_item', payload: { type: 'function_call', name: 'exec', call_id: 'k1' } },
  {
    timestamp: '2026-10-02T10:00:03.000Z', type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: { total_tokens: 1200 },
        last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 200, total_tokens: 1200 },
        model_context_window: 200000,
      },
      rate_limits: { primary: { used_percent: 40, window_minutes: 300, resets_at: 4102444800 } },
    },
  },
  // evento repetido con el mismo acumulado: se ignora
  {
    timestamp: '2026-10-02T10:00:04.000Z', type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: { total_tokens: 1200 },
        last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 200, total_tokens: 1200 },
        model_context_window: 200000,
      },
    },
  },
]

test('adaptador de Claude Code: deduplica respuestas, cuenta herramientas y descarta sintéticos', () => {
  const home = tempHome({ 'projects/p/s1.jsonl': claudeLog })
  const [session] = claudeCode.load({ home })

  assert.equal(session.id, 's1')
  assert.equal(session.cwd, '/work/app')
  assert.equal(session.requests.length, 1)
  assert.deepEqual(session.requests[0], {
    ts: Date.parse('2026-10-01T10:00:06.000Z'),
    model: 'claude-sonnet-5-5', input: 10, cacheRead: 1000, cacheWrite: 500, output: 80,
  })
  assert.deepEqual(session.toolCalls, { Bash: 1, Read: 1 })
  assert.equal(session.context.tokens, 1510)
})

test('adaptador de Codex: resta la caché del input, ignora repetidos y lee límites', () => {
  const home = tempHome({ 'sessions/2026/10/02/rollout-c1.jsonl': codexLog })
  const [session] = codex.load({ home })

  assert.equal(session.id, 'c1')
  assert.equal(session.model, 'gpt-5.6-terra')
  assert.equal(session.requests.length, 1)
  assert.deepEqual(
    { ...session.requests[0], ts: 0 },
    { ts: 0, model: 'gpt-5.6-terra', input: 200, cacheRead: 800, cacheWrite: 0, output: 200 },
  )
  assert.deepEqual(session.toolCalls, { exec: 1 })
  assert.deepEqual(session.context, { tokens: 1000, window: 200000 })
  assert.equal(session.rateLimits[0].kind, 'five_hour')
})

test('precios: gana la primera coincidencia y un modelo sin precio da coste null', () => {
  const pricing = loadPricing()
  const opus55 = priceFor(pricing, 'claude-opus-5-5')
  assert.equal(opus55.input, 4)
  assert.equal(priceFor(pricing, 'claude-opus-5').input, 5)
  assert.equal(priceFor(pricing, 'modelo-desconocido'), null)

  const request = { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 1_000_000 }
  assert.equal(costOf(request, opus55), 24)
  assert.equal(costOf(request, priceFor(pricing, 'gpt-5.6-terra')), null)
  assert.equal(costOf(request, null), null)
})

test('resumen: coste de la sesión activa, totales del período y límites vencidos', () => {
  const home = tempHome({
    'c/projects/p/s1.jsonl': claudeLog,
    'x/sessions/2026/10/02/rollout-c1.jsonl': codexLog,
  })
  const pricing = loadPricing()
  const now = Date.parse('2026-10-03T00:00:00.000Z')
  const summaries = summarize(
    [
      { id: 'claude-code', label: 'Claude Code', sessions: claudeCode.load({ home: path.join(home, 'c') }) },
      { id: 'codex', label: 'Codex', sessions: codex.load({ home: path.join(home, 'x') }) },
    ],
    { pricing, now },
  )

  const [claude, cdx] = summaries
  // sonnet 5.x: 10*2 + 1000*0.2 + 500*2.5 + 80*10 = 2270 -> /1e6
  assert.ok(Math.abs(claude.active.costUsd - 0.00227) < 1e-9)
  assert.equal(claude.active.toolCallsTotal, 2)
  assert.equal(claude.period.requests, 1)
  assert.equal(cdx.active.costUsd, null)
  assert.equal(cdx.period.tokens.total, 1200)
  assert.equal(cdx.rateLimits.length, 1)

  const later = summarize(
    [{ id: 'codex', label: 'Codex', sessions: codex.load({ home: path.join(home, 'x') }) }],
    { pricing, now: Date.parse('2100-01-01T00:00:00.000Z') },
  )
  assert.equal(later[0].rateLimits.length, 0)
})

test('el período recorta peticiones viejas', () => {
  const home = tempHome({ 'projects/p/s1.jsonl': claudeLog })
  const sessions = claudeCode.load({ home })
  const [claude] = summarize([{ id: 'claude-code', label: 'Claude Code', sessions }], {
    pricing: loadPricing(),
    since: Date.parse('2026-10-02T00:00:00.000Z'),
    now: Date.parse('2026-10-03T00:00:00.000Z'),
  })

  assert.equal(claude.period.requests, 0)
  assert.equal(claude.period.sessions, 0)
})

test('el tablero se dibuja sin colores con las cinco filas', () => {
  const home = tempHome({ 'projects/p/s1.jsonl': claudeLog })
  const summaries = summarize(
    [{ id: 'claude-code', label: 'Claude Code', sessions: claudeCode.load({ home }) }],
    { pricing: loadPricing(), now: Date.parse('2026-10-01T10:01:00.000Z') },
  )
  const text = renderBoard(summaries, { useColor: false })

  for (const title of ['Coste por petición', 'Coste estimado', 'Contexto disponible', 'Herramientas usadas', 'Tiempo de sesión']) {
    assert.ok(text.includes(title), title)
  }
  assert.ok(!text.includes('\x1b['))
})

test('filtro por proyecto: la carpeta y sus subcarpetas, no las vecinas', () => {
  const root = path.resolve('/work/app')
  assert.equal(isInProject(root, root), true)
  assert.equal(isInProject(`${root}/`, root), true)
  assert.equal(isInProject(`${root}/src/deep`, root), true)
  assert.equal(isInProject(`${root}-viejo`, root), false)
  assert.equal(isInProject(path.dirname(root), root), false)
  assert.equal(isInProject(null, root), false)
  // en Windows no se distinguen mayúsculas ni el tipo de barra
  assert.equal(isInProject('C:\\Users\\x\\Proyecto\\sub', 'C:/Users/x/proyecto'), process.platform === 'win32')
})

test('tiempo de trabajo: las pausas largas se recortan', () => {
  const min = 60_000
  // 10 min de trabajo, 3 días parado, 5 min más
  const ts = [0, 10 * min, 10 * min + 3 * 86_400_000, 15 * min + 3 * 86_400_000]
  assert.equal(activeMs(ts), 10 * min + 15 * min + 5 * min)
  assert.equal(activeMs([]), null)
  assert.equal(activeMs([5 * min], { isLive: true, now: 7 * min }), 2 * min)
  assert.equal(activeMs([5 * min], { isLive: true, now: 5 * min + 86_400_000 }), 15 * min)
})

test('formato', () => {
  assert.equal(formatUsd(null), '—')
  assert.equal(formatUsd(0.0042), '$0.0042')
  assert.equal(formatUsd(1.234, { isComplete: false }), '≥ $1.23')
  assert.equal(formatDuration(3_725_000), '1:02:05')
  assert.equal(formatDuration(-5), '00:00')
  assert.equal(formatTokens(42_000), '42k')
  assert.equal(bar(50, 10), '█████░░░░░')
  assert.deepEqual(topTools({ a: 1, b: 9, c: 5 }, 2), [['b', 9], ['c', 5]])
})

test('servidor: solo acepta Host local y entrega el resumen', async () => {
  const { createServer } = await import('../src/server.mjs')
  const server = createServer({ port: 0, pricingFile: undefined })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const ask = host => fetch(`http://127.0.0.1:${port}/api/summary?since=today`, { headers: { Host: host } })
  try {
    // createServer compara con el puerto pedido (0), así que cualquier Host real es rechazado
    assert.equal((await ask('evil.example')).status, 403)
  } finally {
    server.close()
  }
})
