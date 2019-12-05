const assert = require('assert')
const config = require('config')

const { buildMonitor, buildRedis, endRedis } = require('.')

const redis = buildRedis(config.redis)
const monitor = buildMonitor({ redis }, { name: 'app' })

module.exports = async ({ start }) => {
  const app = { config, redis, monitor }

  app.end = async ({ err, source }) => {
    try {
      monitor.error(`end ${source}`, { err })
      if (app.hooks && app.hooks.end) {
        await app.hooks.end({ err, source })
      }
      await endRedis(redis)
      monitor.logger.flush()
    } catch (err) {
      monitor.error(`end ${source}`, { err })
    }
    process.exit(1)
  }

  process.on('unhandledRejection', err => {
    app.end({ err, source: 'unhandledRejection' })
  })

  process.on('uncaughtException', err => {
    app.end({ err, source: 'uncaughtException' })
  })

  app.hooks = await start(app)
}
