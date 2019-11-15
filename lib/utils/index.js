const config = require('config')
const pino = require('pino')
const Redis = require('ioredis')

const buildLogger = loggerConfig =>
  pino(Object.assign({}, config.logger, loggerConfig))

const buildRedis = redisConfig => new Redis(redisConfig)

const endRedis = redisClient => redisClient.quit()

const multiAsync = async (redis, commands, hook) => {
  const results = await redis.multi(commands).exec()
  const err = results.find(([err]) => err)
  if (err) {
    throw new Error(err)
  }
  const res = results.map(([, res]) => res)
  if (hook) {
    hook({ commands, res })
  }
  return res
}

module.exports = {
  buildLogger,
  buildRedis,
  endRedis,
  multiAsync,
}
