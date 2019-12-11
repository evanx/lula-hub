const lodash = require('lodash')

const { multiAsync } = require('../utils')

const isGreaterThanSeq = (seq, other) => {
  const parts = seq.split('-')
  const otherParts = other.split('-')
  const major = parseInt(parts[0])
  const otherMajor = parseInt(otherParts[0])
  if (major > otherMajor) {
    return true
  } else if (major < otherMajor) {
    return false
  } else {
    return parseInt(parts[1]) > parseInt(otherParts[1])
  }
}

module.exports = {
  async handle({ redis, config }, { ws, payload }) {
    if (typeof payload.seq !== 'string') {
      return { status: 400, message: 'Bad payload (seq type)' }
    }
    if (!/^\d+-\d+$/.test(payload.seq)) {
      return { status: 400, message: 'Bad payload (seq format)' }
    }
    const seq = await redis.hget('seq:h', ws.client)
    if (seq && !isGreaterThanSeq(payload.seq, seq)) {
      return { status: 409, message: `Conflict (sequence)`, seq }
    }
    const flattened = lodash.flatten(Object.entries(payload))
    const [, seqRes] = await multiAsync(redis, [
      ['hset', 'seq:h', ws.client, payload.seq],
      ['xadd', `${config.inStreamKeyPrefix}:x`, '*', ...flattened],
    ])
    return { seq: seqRes }
  },
}
