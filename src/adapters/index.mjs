import { claudeCode } from './claude-code.mjs'
import { codex } from './codex.mjs'

/**
 * Para sumar otra herramienta (Gemini CLI, OpenCode, ...): un archivo que exporte
 * `{ id, label, load({ since, home }) -> Session[] }` y agregarlo acá.
 */
export const adapters = [claudeCode, codex]
