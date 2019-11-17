const config = require('config')
const pino = require('pino')
const Redis = require('ioredis')

const buildId = () =>
  Math.random()
    .toString()
    .slice(2) +
  Math.random()
    .toString()
    .slice(1)

const buildPromise = fn =>
  new Promise((resolve, reject) =>
    fn((err, res) => (err ? reject(err) : resolve(res))),
  )

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

const reduceProps = props => {
  const res = {}
  for (let i = 0; i < props.length; i += 2) {
    res[props[i]] = props[i + 1]
  }
  return res
}

module.exports = {
  buildId,
  buildLogger,
  buildPromise,
  buildRedis,
  endRedis,
  multiAsync,
  reduceProps,
}
