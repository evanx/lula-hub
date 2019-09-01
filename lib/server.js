const config = require('config')
const lodash = require('lodash')
const fastify = require('fastify')({ logger: config.logger })

fastify.register(require('fastify-redis'), config.redis)
fastify.register(require('fastify-formbody'))
fastify.register(require('fastify-bearer-auth'), {
  auth: async (token, request) => {
    const client = await fastify.redis.hget(`session:${token}:h`, 'client')
    if (client) {
      request.client = client
      return true
    }
    return false
  },
  errorResponse: err => {
    return { code: 401, error: err.message }
  },
})

fastify.route({
  method: 'POST',
  url: '/xadd/:key',
  handler: async (request, reply) => {
    const { redis } = fastify
    if (!/^\w+?(\:x)?$/.test(request.params.key)) {
      reply.code(400).send({ code: 400, message: 'Bad request (key)' })
      return
    }
    const props = Object.assign({}, request.body, { source: request.client })
    const flattened = lodash.flatten(Object.entries(props))
    const idRes = await redis.xadd(request.params.key, '*', ...flattened)
    reply.send({ id: idRes })
  },
})

const start = async () => {
  try {
    await fastify.listen(config.port)
    fastify.log.info(`server listening on ${fastify.server.address().port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
