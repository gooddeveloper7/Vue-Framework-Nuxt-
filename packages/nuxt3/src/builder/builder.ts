import { join, relative } from 'path'
import fsExtra from 'fs-extra'
import { debounce } from 'lodash'
import { BundleBuilder } from 'src/webpack'
import { Nuxt } from '../core'
import {
  templateData,
  compileTemplates,
  scanTemplates,
  NuxtTemplate
} from './template'
import { createWatcher } from './watch'
import { resolveApp, NuxtApp } from './app'
import Ignore from './ignore'

export class Builder {
  nuxt: Nuxt
  ignore: Ignore
  app: NuxtApp
  templates: NuxtTemplate[]

  constructor (nuxt) {
    this.nuxt = nuxt
    this.ignore = new Ignore({
      rootDir: nuxt.options.srcDir,
      ignoreArray: nuxt.options.ignore.concat(
        relative(nuxt.options.rootDir, nuxt.options.buildDir)
      )
    })
  }

  build () {
    return build(this)
  }
}

// Extends VueRouter
async function build (builder: Builder) {
  const { nuxt } = builder

  await generate(builder)

  if (nuxt.options.dev) {
    watch(builder)
  }

  await bundle(builder)
}

function watch (builder: Builder) {
  const { nuxt, ignore } = builder

  // Watch internal templates
  const options = nuxt.options.watchers.chokidar
  const nuxtAppWatcher = createWatcher(nuxt.options.appDir, { ...options, cwd: nuxt.options.appDir }, ignore)
  nuxtAppWatcher.watchAll(debounce(() => compileTemplates(builder.templates, nuxt.options.buildDir), 100))

  // Watch user app
  const appPattern = `${builder.app.srcDir}/**/*.{${nuxt.options.extensions.join(',')}}`
  const appWatcher = createWatcher(appPattern, { ...options, cwd: builder.app.srcDir }, ignore)
  // appWatcher.debug('srcDir')
  const refreshTemplates = debounce(() => generate(builder), 100)
  // Watch for App.vue creation
  appWatcher.watch(/^(A|a)pp\.[a-z]{2,3}/, refreshTemplates, ['add', 'unlink'])
  // Watch for page changes
  appWatcher.watch(new RegExp(`^${nuxt.options.dir.pages}/`), refreshTemplates, ['add', 'unlink'])
}

export async function generate (builder: Builder) {
  const { nuxt } = builder

  await fsExtra.mkdirp(nuxt.options.buildDir)
  builder.app = await resolveApp(builder, nuxt.options.srcDir)

  const templatesDir = join(builder.nuxt.options.appDir, '_templates')
  const appTemplates = await scanTemplates(templatesDir, templateData(builder))

  builder.templates = [...appTemplates]

  await compileTemplates(builder.templates, nuxt.options.buildDir)
}

async function bundle ({ nuxt }: Builder) {
  // TODO: get rid of this context and directly pass nuxt to BundleBuilder
  const bundleBuilder = new BundleBuilder({
    nuxt,
    options: nuxt.options,
    buildOptions: nuxt.options.build,
    target: nuxt.options.target,
    plugins: []
  })
  await bundleBuilder.build()
}
