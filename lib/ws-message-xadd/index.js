const lodash = require('lodash')

const { multiAsync } = require('../utils')

const isGreaterThanSeq = (id, other) => {
  const parts = id.split('-')
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
  async handle({ redis, config }, { ws, message }) {
    const { payload } = message
    const { id } = payload
    if (typeof id !== 'string') {
      return { status: 400, message: 'Bad payload (id type)' }
    }
    if (!/^\d+-\d+$/.test(id)) {
      return { status: 400, message: 'Bad payload (id format)' }
    }
    const idSaved = await redis.hget('id:h', ws.client)
    if (idSaved && !isGreaterThanSeq(id, idSaved)) {
      return { status: 409, message: `Conflict (id)`, id: idSaved }
    }
    const flattened = lodash.flatten(Object.entries(payload))
    const [, idRes] = await multiAsync(redis, [
      ['hset', 'id:h', ws.client, id],
      ['xadd', `${config.inStreamKeyPrefix}:x`, '*', ...flattened],
    ])
    return { id: idRes }
  },
}
