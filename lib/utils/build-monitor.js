const assert = require('assert')
const expect = require('expect')
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

const buildAssert = (state, name) => ({
  truthy(type, object) {
    const fields = Object.entries(object)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (fields.length) {
      throw new Error(`${name}: assert: ${type}: ${fields.join(', ')}`)
    }
    state.logger.info(object, `assert: ${type}`)
  },
  string(type, object) {
    const fields = Object.entries(object)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (fields.length) {
      throw new Error(`${name}: assert: ${type}: ${fields.join(', ')}`)
    }
    state.logger.info(object, `assert: ${type}`)
  },
  equal(type, object, expected) {
    const fields = Object.entries(expected)
      .map(([key, value]) => [key, value, object[key]])
      .filter(([, value, actualValue]) => actualValue !== value)
    if (fields.length) {
      const string = fields
        .map(tuple =>
          tuple.map(value => (value ? value.toString() : 'empty')).join(':'),
        )
        .join(', ')
      throw new Error(`${name}: assert: ${type}: ${string}`)
    }
    state.logger.debug(object, `assert: ${type}`)
  },
})

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
      assert: buildAssert(state, name),
      child: ({ name }, context = {}) => {
        return buildMonitor({ redis }, { name }, context)
      },
    },
    methods(state),
  )
}

module.exports = buildMonitor
