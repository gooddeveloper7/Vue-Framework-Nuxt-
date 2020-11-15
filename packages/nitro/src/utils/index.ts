import { relative, dirname, resolve } from 'path'
import fse from 'fs-extra'
import jiti from 'jiti'
import defu from 'defu'
import Hookable from 'hookable'
import consola from 'consola'
import type { SLSOptions, UnresolvedPath, SLSTarget, SLSTargetFn, SLSConfig } from '../config'

export const MODULE_DIR = resolve(__dirname, '..')

export function hl (str: string) {
  return '`' + str + '`'
}

export function prettyPath (p: string, highlight = true) {
  p = relative(process.cwd(), p)
  return highlight ? hl(p) : p
}

export function compileTemplate (contents: string) {
  return (params: Record<string, any>) => contents.replace(/{{ ?(\w+) ?}}/g, (_, match) => params[match] || '')
}

export function serializeTemplate (contents: string) {
  // eslint-disable-next-line no-template-curly-in-string
  return `(params) => \`${contents.replace(/{{ (\w+) }}/g, '${params.$1}')}\``
}

export function jitiImport (dir: string, path: string) {
  return jiti(dir)(path)
}

export function tryImport (dir: string, path: string) {
  try {
    return jitiImport(dir, path)
  } catch (_err) { }
}

export async function writeFile (file, contents) {
  await fse.mkdirp(dirname(file))
  await fse.writeFile(file, contents, 'utf-8')
  consola.info('Generated', prettyPath(file))
}

export function resolvePath (options: SLSOptions, path: UnresolvedPath, resolveBase: string = '') {
  if (typeof path === 'function') {
    path = path(options)
  }

  if (typeof path !== 'string') {
    throw new TypeError('Invalid path: ' + path)
  }

  path = compileTemplate(path)(options)

  return resolve(resolveBase, path)
}

export function detectTarget () {
  if (process.env.NETLIFY) {
    return 'netlify'
  }

  if (process.env.NOW_BUILDER) {
    return 'vercel'
  }

  return 'node'
}

export function extendTarget (base: SLSTarget, target: SLSTarget): SLSTargetFn {
  return (config: SLSConfig) => {
    if (typeof target === 'function') {
      target = target(config)
    }
    if (typeof base === 'function') {
      base = base(config)
    }
    return defu({
      hooks: Hookable.mergeHooks(base.hooks, target.hooks),
      nuxtHooks: Hookable.mergeHooks(base.nuxtHooks as any, target.nuxtHooks as any)
    }, target, base)
  }
}

const _getDependenciesMode = {
  dev: ['devDependencies'],
  prod: ['dependencies'],
  all: ['devDependencies', 'dependencies']
}
export function getDependencies (dir: string, mode: keyof typeof _getDependenciesMode = 'all') {
  const fields = _getDependenciesMode[mode]
  const pkg = require(resolve(dir, 'package.json'))
  const dependencies = []
  for (const field of fields) {
    if (pkg[field]) {
      for (const name in pkg[field]) {
        dependencies.push(name)
      }
    }
  }
  return dependencies
}
