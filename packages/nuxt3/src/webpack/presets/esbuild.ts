import { ESBuildPlugin, ESBuildMinifyPlugin } from 'esbuild-loader'
import { WebpackConfigContext } from '../utils/config'

export function esbuild (ctx: WebpackConfigContext) {
  const { config } = ctx

  config.optimization.minimizer.push(new ESBuildMinifyPlugin())

  config.plugins.push(new ESBuildPlugin())

  config.module.rules.push(
    {
      test: /\.[jt]sx?$/,
      loader: 'esbuild-loader',
      exclude: (file) => {
        file = file.split('node_modules', 2)[1]

        // Not exclude files outside node_modules
        if (!file) {
          return false
        }

        // Item in transpile can be string or regex object
        return !ctx.transpile.some(module => module.test(file))
      },
      options: {
        loader: 'ts',
        target: 'es2015'
      }
    },
    {
      test: /\.tsx$/,
      loader: 'esbuild-loader',
      options: {
        loader: 'tsx',
        target: 'es2015'
      }
    }
  )
}
