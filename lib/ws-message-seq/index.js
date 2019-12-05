const assert = require('assert')

module.exports = {
  spec: {},
  async handle({ redis }, { ws }) {
    const seq = (await redis.hget('seq:h', ws.client)) || '0-0'
    return { seq }
  },
}
