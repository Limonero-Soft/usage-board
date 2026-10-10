import fs from 'node:fs'
import path from 'node:path'

export function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

/** Archivos .jsonl bajo `dir` modificados desde `since` (ms). */
export function jsonlFiles(dir, since = 0) {
  const out = []
  for (const file of walk(dir)) {
    if (!file.endsWith('.jsonl')) continue
    try {
      if (fs.statSync(file).mtimeMs >= since) out.push(file)
    } catch {
      // archivo borrado mientras se recorría
    }
  }
  return out
}

/** Líneas JSON de un archivo; las líneas rotas se saltean. */
export function* readJsonl(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {
      // línea truncada (escritura en curso)
    }
  }
}
