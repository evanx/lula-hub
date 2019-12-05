const assert = require('assert')

module.exports = {
  async handle({ monitor, end }, { ws }) {
    await end({ source: 'test-end' })
  },
}
