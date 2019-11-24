const config = require('config')
const lodash = require('lodash')

const { multiAsync } = require('../../utils')

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

module.exports = fastify =>
  fastify.route({
    method: 'POST',
    url: '/xadd',
    handler: async (request, reply) => {
      const { redis } = fastify
      const props = Object.assign({}, request.body, {
        client: request.client,
      })
      if (typeof props.seq !== 'string') {
        reply.code(400).send({ code: 400, message: 'Bad request (seq type)' })
        return
      }
      if (!/^\d+-\d+$/.test(props.seq)) {
        reply.code(400).send({ code: 400, message: 'Bad request (seq format)' })
        return
      }
      const seq = await redis.hget('seq:h', request.client)
      if (seq && !isGreaterThanSeq(props.seq, seq)) {
        reply.code(409).send({ code: 409, message: `Conflict (sequence)`, seq })
        return
      }
      const flattened = lodash.flatten(Object.entries(props))
      const [, idRes] = await multiAsync(redis, [
        ['hset', 'seq:h', request.client, props.seq],
        ['xadd', `${config.inStreamKeyPrefix}:x`, '*', ...flattened],
      ])
      reply.send({ id: idRes })
    },
  })
