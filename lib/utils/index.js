const config = require('config')
const pino = require('pino')
const Redis = require('ioredis')

const buildId = () =>
  Math.random()
    .toString(36)
    .slice(2) +
  Math.random()
    .toString(36)
    .slice(1)

const buildPromise = fn =>
  new Promise((resolve, reject) =>
    fn((err, res) => (err ? reject(err) : resolve(res))),
  )

const buildLogger = loggerConfig =>
  pino(Object.assign({}, config.logger, loggerConfig))

const buildRedis = redisConfig => new Redis(redisConfig)

const clock = () => Date.now()

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

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

const parseRedisMs = res => {
  return parseInt(res[0] + res[1].padStart(6, '0').slice(0, 3))
}

module.exports = {
  buildId,
  buildLogger,
  buildMonitor: require('./build-monitor'),
  buildPromise,
  buildRedis,
  clock,
  delay,
  endRedis,
  multiAsync,
  parseRedisMs,
}
