import { promises as fsp } from 'fs'
import { join, relative, resolve } from 'pathe'
import { Nuxt, TSReference } from '@nuxt/kit'
import defu from 'defu'
import type { TSConfig } from 'pkg-types'
import { getModulePaths, getNearestPackage } from './cjs'

export const writeTypes = async (nuxt: Nuxt) => {
  const modulePaths = getModulePaths(nuxt.options.modulesDir)

  const tsConfig: TSConfig = defu(nuxt.options.typescript?.tsConfig, {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Node',
      skipLibCheck: true,
      strict: nuxt.options.typescript.strict,
      allowJs: true,
      noEmit: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
      types: ['node'],
      baseUrl: relative(nuxt.options.buildDir, nuxt.options.rootDir),
      paths: {}
    },
    include: [
      './nuxt.d.ts',
      join(relative(nuxt.options.buildDir, nuxt.options.rootDir), '**/*'),
      ...nuxt.options.srcDir !== nuxt.options.rootDir ? [join(relative(nuxt.options.buildDir, nuxt.options.srcDir), '**/*')] : []
    ]
  })

  const aliases = {
    ...nuxt.options.alias,
    '#build': nuxt.options.buildDir,
    // The `@nuxt/nitro` types will be overwritten by packages/nitro/types/shims.d.ts
    '#config': '@nuxt/nitro',
    '#storage': '@nuxt/nitro',
    '#assets': '@nuxt/nitro'
  }

  for (const alias in aliases) {
    const relativePath = relative(nuxt.options.rootDir, aliases[alias]).replace(/(?<=\w)\.\w+$/g, '') /* remove extension */ || '.'
    tsConfig.compilerOptions.paths[alias] = [relativePath]

    try {
      const { isDirectory } = await fsp.stat(resolve(nuxt.options.rootDir, relativePath))
      if (isDirectory) {
        tsConfig.compilerOptions.paths[`${alias}/*`] = [`${relativePath}/*`]
      }
    } catch { }
  }

  const references: TSReference[] = [
    ...nuxt.options.buildModules,
    ...nuxt.options.modules,
    ...nuxt.options._modules
  ]
    .filter(f => typeof f === 'string')
    .map(id => ({ types: getNearestPackage(id, modulePaths)?.name || id }))

  const declarations: string[] = []

  await nuxt.callHook('builder:generateApp')
  await nuxt.callHook('prepare:types', { references, declarations, tsConfig })

  const declaration = [
    ...references.map((ref) => {
      if ('path' in ref) {
        ref.path = relative(nuxt.options.buildDir, ref.path)
      }
      return `/// <reference ${renderAttrs(ref)} />`
    }),
    ...declarations,
    '',
    'export {}',
    ''
  ].join('\n')

  async function writeFile () {
    const GeneratedBy = '// Generated by nuxi'

    const tsConfigPath = resolve(nuxt.options.buildDir, 'tsconfig.json')
    await fsp.writeFile(tsConfigPath, GeneratedBy + '\n' + JSON.stringify(tsConfig, null, 2))

    const declarationPath = resolve(nuxt.options.buildDir, 'nuxt.d.ts')
    await fsp.writeFile(declarationPath, GeneratedBy + '\n' + declaration)
  }

  // This is needed for Nuxt 2 which clears the build directory again before building
  // https://github.com/nuxt/nuxt.js/blob/dev/packages/builder/src/builder.js#L144
  nuxt.hook('builder:prepared', writeFile)

  await writeFile()
}

function renderAttrs (obj: Record<string, string>) {
  return Object.entries(obj).map(e => renderAttr(e[0], e[1])).join(' ')
}

function renderAttr (key: string, value: string) {
  return value ? `${key}="${value}"` : ''
}
