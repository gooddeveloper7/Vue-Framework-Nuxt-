import { resolve } from 'path'
import defu from 'defu'
import { NuxtOptions } from '@nuxt/types'
import { tryImport, LIB_DIR, resolvePath } from './utils'

export type UnresolvedPath = string | ((SLSOptions) => string)

export interface SLSOptions {
  node: false
  target: string
  entry: string
  slsDir: string
  outName: string
  logStartup: boolean
  inlineChunks: boolean
  buildDir: string
  publicDir: string
  staticDir: string
  targetDir: string
  rootDir: string
  templates: { src: string, dst: UnresolvedPath }[]
  static: string[]
  renderer: string
  nuxt: 2 | 3
  analyze: boolean
  minify: boolean
  rollupConfig?: any
  fullStatic: boolean,
  staticAssets: {
    base: string
    versionBase: string
    dir: string
    version: string
  }
  hooks: { [key: string]: any } // TODO: export from hookable
}

export interface SLSConfig extends Omit<Partial<SLSOptions>, 'targetDir'> {
  targetDir: UnresolvedPath
}

export function getoptions (nuxtOptions: NuxtOptions): SLSOptions {
  const defaults: SLSConfig = {
    rootDir: nuxtOptions.rootDir,
    buildDir: nuxtOptions.buildDir,
    publicDir: nuxtOptions.generate.dir,
    fullStatic: nuxtOptions.target === 'static' && !nuxtOptions._legacyGenerate,
    // @ts-ignore
    staticAssets: nuxtOptions.generate.staticAssets,
    outName: 'server.js',
    templates: [],
    static: [],
    nuxt: 2,
    logStartup: true,
    inlineChunks: true,
    targetDir: null
  }

  let target = process.env.NUXT_SLS_TARGET || nuxtOptions.serverless.target || 'node'
  if (typeof target === 'function') {
    target = target(nuxtOptions)
  }
  let targetDefaults = tryImport(LIB_DIR, `./targets/${target}`) || tryImport(nuxtOptions.rootDir, target)
  if (!targetDefaults) {
    throw new Error('Cannot resolve target: ' + target)
  }
  targetDefaults = targetDefaults.default || targetDefaults

  const options: SLSOptions = defu(nuxtOptions.serverless, targetDefaults, defaults, { target })

  options.buildDir = resolve(options.rootDir, options.buildDir || '.nuxt')
  options.publicDir = resolve(options.rootDir, options.publicDir || 'dist')
  options.slsDir = resolve(options.rootDir, options.slsDir || '.sls')
  options.targetDir = options.targetDir ? resolvePath(options, options.targetDir) : resolve(options.slsDir, target)

  return options
}
