import fetch from 'node-fetch'
import { resolve } from 'upath'
import { build, generate, prepare } from '../build'
import { getsigmaContext, SigmaContext } from '../context'
import { createDevServer } from '../server'
import wpfs from '../utils/wpfs'

export default function (nuxt, moduleContainer) {
  // Build in node_modules/.cache/nuxt
  const oldBuildDir = nuxt.options.buildDir
  nuxt.options.buildDir = resolve(nuxt.options.rootDir, 'node_modules/.cache/nuxt')
  nuxt.options.build.transpile = nuxt.options.build.transpile || []
  nuxt.options.build.transpile.push(nuxt.options.buildDir)
  nuxt.options.appTemplatePath = nuxt.options.appTemplatePath
    .replace(oldBuildDir, nuxt.options.buildDir)

  // Create contexts
  const sigmaContext = getsigmaContext(nuxt.options, nuxt.options.sigma || {})
  const sigmaDevContext = getsigmaContext(nuxt.options, { preset: 'local' })

  // Connect hooks
  nuxt.addHooks(sigmaContext.nuxtHooks)
  nuxt.hook('close', () => sigmaContext._internal.hooks.callHook('close'))

  nuxt.addHooks(sigmaDevContext.nuxtHooks)
  nuxt.hook('close', () => sigmaDevContext._internal.hooks.callHook('close'))
  sigmaDevContext._internal.hooks.hook('renderLoading',
    (req, res) => nuxt.callHook('server:nuxt:renderLoading', req, res))

  // Expose process.env.SIGMA_PRESET
  nuxt.options.env.SIGMA_PRESET = sigmaContext.preset

  // .ts is supported for serverMiddleware
  nuxt.options.extensions.push('ts')

  // Replace nuxt server
  if (nuxt.server) {
    nuxt.server.__closed = true
    nuxt.server = createNuxt2DevServer(sigmaDevContext)
  }

  // Sigma client plugin
  moduleContainer.addPlugin({
    fileName: 'sigma.client.js',
    src: resolve(sigmaContext._internal.runtimeDir, 'app/sigma.client.js')
  })

  // serverMiddleware bridge
  // TODO: render:setupMiddleware hook
  // TODO: support m.prefix and m.route
  nuxt.hook('modules:done', () => {
    const unsupported = []
    for (let m of nuxt.options.serverMiddleware) {
      if (typeof m === 'string') { m = { handler: m } }
      const route = m.path || m.route || '/'
      let handle = m.handler || m.handle
      if (typeof handle !== 'string' || typeof route !== 'string') {
        if (route === '/_loading') {
          nuxt.server.setLoadingMiddleware(handle)
          continue
        }
        unsupported.push(m)
        continue
      }
      handle = nuxt.resolver.resolvePath(handle)
      sigmaContext.middleware.push({ ...m, route, handle })
      sigmaDevContext.middleware.push({ ...m, route, handle })
    }
    nuxt.options.serverMiddleware = [...unsupported]
    if (unsupported.length) {
      console.warn('[sigma] Unsupported Server middleware used: \n', ...unsupported)
      console.info('Supported format is `{ path: string, handler: string }` and handler should export `(req, res) => {}`')
    }
  })

  // nuxt build/dev
  nuxt.options.build._minifyServer = false
  nuxt.options.build.standalone = false
  nuxt.hook('build:done', async () => {
    if (nuxt.options.dev) {
      await build(sigmaDevContext)
    } else if (!sigmaContext._nuxt.isStatic) {
      await prepare(sigmaContext)
      await generate(sigmaContext)
      await build(sigmaContext)
    }
  })

  // nude dev
  if (nuxt.options.dev) {
    sigmaDevContext._internal.hooks.hook('sigma:compiled', () => { nuxt.server.watch() })
    nuxt.hook('build:compile', ({ compiler }) => { compiler.outputFileSystem = wpfs })
    nuxt.hook('server:devMiddleware', (m) => { nuxt.server.setDevMiddleware(m) })
  }

  // nuxt generate
  nuxt.options.generate.dir = sigmaContext.output.publicDir
  nuxt.hook('generate:cache:ignore', (ignore: string[]) => {
    ignore.push(sigmaContext.output.dir)
    ignore.push(sigmaContext.output.serverDir)
    if (sigmaContext.output.publicDir) {
      ignore.push(sigmaContext.output.publicDir)
    }
    ignore.push(...sigmaContext.ignore)
  })
  nuxt.hook('generate:before', async () => {
    await prepare(sigmaContext)
  })
  nuxt.hook('generate:extendRoutes', async () => {
    await build(sigmaDevContext)
    await nuxt.server.reload()
  })
  nuxt.hook('generate:done', async () => {
    await nuxt.server.close()
    await build(sigmaContext)
  })
}

function createNuxt2DevServer (sigmaContext: SigmaContext) {
  const server = createDevServer(sigmaContext)

  const listeners = []
  async function listen (port) {
    const listener = await server.listen(port)
    listeners.push(listener)
    return listeners
  }

  async function renderRoute (route = '/', renderContext = {}) {
    const [listener] = listeners
    if (!listener) {
      throw new Error('There is no server listener to call `server.renderRoute()`')
    }
    const html = await fetch(listener.url + route, {
      headers: { 'nuxt-render-context': encodeQuery(renderContext) }
    }).then(r => r.text())

    return { html }
  }

  return {
    ...server,
    listeners,
    renderRoute,
    listen,
    serverMiddlewarePaths () { return [] },
    ready () {}
  }
}

function encodeQuery (obj) {
  return Object.entries(obj).map(
    ([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(val))}`
  ).join('&')
}
