# usage-board

Tablero de consumo para agentes de código. Lee los logs locales de cada herramienta
y muestra, en el mismo formato, lo que consume cada una:

| Fila | Qué muestra |
|---|---|
| **Coste por petición** | Costo de la última petición y la media de la sesión |
| **Coste estimado** | Costo acumulado de la sesión a precio de API |
| **Contexto disponible** | % libre de la ventana de contexto, con barra y tokens |
| **Herramientas usadas** | Total de llamadas y las 3 más usadas |
| **Tiempo de sesión** | Duración de la sesión (en vivo si sigue activa) |

Además, si la herramienta lo registra (Codex), los límites de tu plan, y los totales del período.

## Herramientas soportadas

| Herramienta | De dónde lee | Notas |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | Respeta `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` y `archived_sessions/` | Respeta `CODEX_HOME`; trae límites del plan y ventana de contexto |

Todo se lee en local: no hay red, cuentas ni claves.

## Uso

Necesita Node 18 o más. No tiene dependencias.

```
node src/cli.mjs                       # tablero de todas las herramientas
node src/cli.mjs --watch               # se refresca cada 2 segundos
node src/cli.mjs --tool codex          # solo una herramienta
node src/cli.mjs --since today         # totales de hoy (24h, 7d, 30d, all)
node src/cli.mjs --project             # solo las sesiones de la carpeta actual
node src/cli.mjs --project ~/mi-app    # solo las de esa carpeta (y sus subcarpetas)
node src/cli.mjs --json                # datos crudos, para otros programas
```

Instalado como paquete queda el comando `usage-board`.

## El coste es una estimación

Los logs guardan tokens, no dólares (Codex ni siquiera registra el coste). El
coste se calcula multiplicando los tokens por los precios de [`pricing.json`](pricing.json).

- Los precios de caché son supuestos (lectura 10% y escritura 125% del input),
  marcados con `"estimated": true`. Verificalos contra la lista oficial.
- Un modelo sin precio (por ejemplo los de OpenAI, que vienen con `null`) muestra
  tokens pero coste `—`. Completá la tabla con los precios de tu plan.
- Si solo algunas peticiones tienen precio, el total se muestra como `≥ $X`.
- Con un plan por suscripción no pagás esa cifra: es lo que costaría por API.

## Sumar otra herramienta

Un adaptador es un archivo que exporta `{ id, label, load({ since, home }) }` y
devuelve sesiones en el formato de [`src/session.mjs`](src/session.mjs). Mirá
[`src/adapters/codex.mjs`](src/adapters/codex.mjs) como ejemplo y registralo en
[`src/adapters/index.mjs`](src/adapters/index.mjs). Gemini CLI y OpenCode guardan datos
parecidos y son los candidatos naturales.

## Mod de Claude Code (experimental)

> **Experimental:** todavía no se ha confirmado que el panel se renderice en una
> instalación real. Para uso fiable, usa el CLI o el tablero visual.

[`mods/claude-code`](mods/claude-code) es un panel en vivo dentro de Claude Code
(`/usage`). Solo ve la sesión en la que está corriendo, a diferencia del CLI, que
ve todas las herramientas. Requiere una versión de Claude Code con soporte de mods
(las versiones antiguas, como la 2.1.97, no sirven).

```
/plugin install claude-usage-dashboard --marketplace <usuario>/<repo>
```

## Tests

```
npm test
```

## Licencia

MIT

## Tablero visual (pestaña en la app de escritorio)

```bash
npm run dashboard        # http://127.0.0.1:3939
```

Abre un servidor local (solo `127.0.0.1`, sin dependencias) con el tablero en HTML: las cinco tarjetas,
límites de uso, gráfico por día y selectores de período y proyecto. Se actualiza solo cada 15 s.
En la app de escritorio de Claude, abrí una pestaña nueva en el panel **Navegador** y pegá esa URL.
