import path from 'node:path'

/** Ruta comparable: barras hacia adelante, sin barra final, sin distinguir mayúsculas en Windows. */
export function normalizePath(p) {
  const slashed = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '')

  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

export function normalizeCwd(cwd) {
  const slashed = String(cwd).replace(/\\/g, '/').replace(/\/+$/, '')

  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

/** Verdadero si `cwd` es la carpeta del proyecto o está dentro de ella. */
export function isInProject(cwd, project) {
  if (!cwd) return false
  const here = normalizeCwd(cwd)
  const root = normalizePath(project)

  return here === root || here.startsWith(`${root}/`)
}
