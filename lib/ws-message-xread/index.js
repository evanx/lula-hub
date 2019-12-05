const assert = require('assert')
const config = require('config')
const { reduceProps } = require('../utils')

module.exports = {
  async handle({ redis, monitor }, { payload }) {
    const { id, blockMs } = payload
    monitor.assert('payload', { id })
    const options = ['COUNT', config.xreadCount]
    if (blockMs) {
      options.push('BLOCK', blockMs)
    }
    const res = await redis.xread(
      ...options,
      'STREAMS',
      `${config.outStreamKeyPrefix}:${request.client}:x`,
      id,
    )
    if (!res) {
      return {
        items: [],
      }
    } else {
      return {
        items: res[0][1].map(
          ([seq, props]) => Object.assign(reduceProps(props), { seq }),
          {},
        ),
      }
    }
  },
}
