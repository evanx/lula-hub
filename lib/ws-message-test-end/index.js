const assert = require('assert')

module.exports = {
  async handle({ end }, { ws }) {
    await end({ source: 'test-end' })
    return {}
  },
}
