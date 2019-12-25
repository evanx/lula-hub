const config = require('config')
const crypto = require('crypto')
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

const buildSha1 = string =>
  crypto
    .createHash('sha1')
    .update(string)
    .digest('hex')

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

const reduceRedis = props => {
  const res = {}
  for (let i = 0; i < props.length; i += 2) {
    res[props[i]] = props[i + 1]
  }
  return res
}

module.exports = {
  buildId,
  buildLogger,
  buildMonitor: require('./build-monitor'),
  buildPromise,
  buildRedis,
  buildSha1,
  clock,
  delay,
  endRedis,
  multiAsync,
  parseRedisMs,
  reduceRedis,
}
