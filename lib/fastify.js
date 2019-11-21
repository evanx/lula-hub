const config = require('config')
const lodash = require('lodash')
const fastify = require('fastify')({ logger: config.logger })

const { multiAsync, reduceProps } = require('./utils')

fastify.register(require('fastify-redis'), config.redis)
fastify.register(require('fastify-formbody'))
fastify.register(require('fastify-bearer-auth'), {
  auth: async (token, request) => {
    const client = await fastify.redis.hget(`session:${token}:h`, 'client')
    if (client) {
      request.client = client
      return true
    } else {
      fastify.log.warn({ client }, 'auth')
      return false
    }
  },
  errorResponse: err => {
    return { code: 401, message: err.message }
  },
})

fastify.register(require('fastify-websocket'), {
  handle: conn => {
    conn.pipe(conn) // creates an echo server
  },
  options: { maxPayload: 1048576 },
})

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

fastify.route({
  method: 'GET',
  url: '/seq',
  handler: async (request, reply) => {
    const { redis } = fastify
    const seq = (await redis.hget('seq:h', request.client)) || '0-0'
    reply.send({ seq })
  },
})

fastify.route({
  method: 'GET',
  url: '/xread/:id',
  handler: async (request, reply) => {
    const { redis } = fastify
    const { id } = request.params
    const res = await redis.xread(
      'COUNT',
      config.xreadCount,
      'STREAMS',
      `${config.outStreamKeyPrefix}:${request.client}:x`,
      id,
    )
    if (!res) {
      reply.send({
        items: [],
      })
    } else {
      reply.send({
        items: res[0][1].map(
          ([seq, props]) => Object.assign(reduceProps(props), { seq }),
          {},
        ),
      })
    }
  },
})

fastify.route({
  method: 'POST',
  url: '/xadd',
  handler: async (request, reply) => {
    const { redis } = fastify
    const props = Object.assign({}, request.body, { source: request.client })
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

module.exports = {
  fastify,
  async start() {
    try {
      await fastify.listen(config.port)
      fastify.log.info(`server listening on ${fastify.server.address().port}`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  },
}
