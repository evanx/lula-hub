const assert = require('assert')
const pino = require('pino')

const env = {
  debugNames: !process.env.DEBUG ? [] : process.env.DEBUG.split(','),
  defaultLevel: process.env.LOG_LEVEL || 'info',
  prettyPrint: !process.env.LOG_PRETTY
    ? false
    : { colorize: true, translateTime: true },
}

const incrementLevelType = ({ redis }, { name, started }, level, type) =>
  redis
    .multi()
    .hincrby(`count:$${name}:${level}:h`, type, 1)
    .hincrby(`time:${name}:h`, type, Date.now() - started)
    .exec()
    .catch(err => logger.error({ err, name, level, type }, 'monitor hincrby'))

const methods = state =>
  ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].reduce(
    (result, level) => {
      result[level] = (type, data = {}) => {
        state.logger[level](data, type)
        incrementLevelType(state, level, type)
      }
      return result
    },
    {},
  )

const assertProps = (state, name, type, object) => {
  const fields = Object.entries(object)
    .filter(([key, value]) => !value)
    .map(([key, value]) => key)
  if (fields.length) {
    throw new Error(`${name}: assert: ${type}: ${fields}`)
  }
  state.logger.info(object, type, 'assert')
}

const buildMonitor = ({ redis }, { name }, context = {}) => {
  assert.strictEqual(typeof name, 'string', 'name')
  const state = {
    name,
    started: Date.now(),
    level: env.debugNames.includes(name) ? 'debug' : env.defaultLevel,
    redis,
  }
  state.logger = pino({
    name,
    level: state.level,
    prettyPrint: env.prettyPrint,
  })
  incrementLevelType(state, 'info', 'start')
  state.logger.info(context, 'start')

  return Object.assign(
    {},
    state,
    {
      assert: (type, object) => assertProps(state, name, type, object),
      child: ({ name }, context = {}) => {
        return buildMonitor({ name }, context)
      },
    },
    methods(state),
  )
}

module.exports = buildMonitor
