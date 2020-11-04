import consola from 'consola'

export default {
  entry: require.resolve('./entry'),
  dynamicImporter: false,
  hooks: {
    'done' () {
      consola.info('Run `vercel serverless` to serverless!')
    }
  }
}
