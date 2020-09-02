import path from 'path'
// import ExtractCssChunksPlugin from 'extract-css-chunks-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'

import type { Nuxt } from 'src/core'
import type { NormalizedConfiguration } from 'src/config'
import { wrapArray } from 'src/utils'

import PostcssConfig from './postcss'

export default class StyleLoader {
  options: NormalizedConfiguration

  constructor (nuxt: Nuxt, { isServer }) {
    this.options = nuxt.options
    this.isServer = isServer

    if (this.options.build.postcss) {
      this.postcssConfig = new PostcssConfig(nuxt)
    }
  }

  get extractCSS () {
    return this.options.build.extractCSS
  }

  normalize (loaders) {
    loaders = wrapArray(loaders)
    return loaders.map(loader => (typeof loader === 'string' ? { loader } : loader))
  }

  styleResource (ext) {
    const { build: { styleResources }, rootDir } = this.options
    const extResource = styleResources[ext]
    // style-resources-loader
    // https://github.com/yenshih/style-resources-loader
    if (!extResource) {
      return
    }
    const patterns = wrapArray(extResource).map(p => path.resolve(rootDir, p))

    return {
      loader: 'style-resources-loader',
      options: Object.assign(
        { patterns },
        styleResources.options || {}
      )
    }
  }

  postcss () {
    // postcss-loader
    // https://github.com/postcss/postcss-loader
    if (!this.postcssConfig) {
      return
    }

    const config = this.postcssConfig.config()

    if (!config) {
      return
    }

    return {
      loader: 'postcss-loader',
      options: Object.assign({ sourceMap: this.options.build.cssSourceMap }, config)
    }
  }

  css (options) {
    const cssLoader = { loader: 'css-loader', options }

    if (this.isServer && this.extractCSS) {
      options.modules = options.modules || {}
      options.modules.exportOnlyLocals = true
      return [cssLoader]
    }

    return [this.styleLoader(), cssLoader]
  }

  cssModules (options) {
    return this.css(options)
  }

  extract () {
    if (this.extractCSS) {
      const isDev = this.options.dev
      return {
        loader: MiniCssExtractPlugin.loader,
        options: {
          // TODO: https://github.com/faceyspacey/extract-css-chunks-webpack-plugin/issues/132
          // https://github.com/faceyspacey/extract-css-chunks-webpack-plugin/issues/161#issuecomment-500162574
          reloadAll: isDev,
          hot: isDev
        }
      }
    }
  }

  styleLoader () {
    return this.extract() || {
      loader: 'vue-style-loader',
      options: this.options.build.loaders.vueStyle
    }
  }

  apply (ext, loaders = []) {
    const { css, cssModules } = this.options.build.loaders

    const customLoaders = [].concat(
      this.postcss(),
      this.normalize(loaders),
      this.styleResource(ext)
    ).filter(Boolean)

    css.importLoaders = cssModules.importLoaders = customLoaders.length

    return [
      // This matches <style module>
      {
        resourceQuery: /module/,
        use: [
          this.cssModules(cssModules),
          customLoaders
        ]
      },
      // This matches plain <style> or <style scoped>
      {
        use: [
          this.css(css),
          customLoaders
        ]
      }
    ]
  }
}
