const config = require('config')
const lodash = require('lodash')
const fastify = require('fastify')({ logger: config.logger })

fastify.register(require('fastify-redis'), config.redis)
fastify.register(require('fastify-formbody'))

fastify.route({
  method: 'POST',
  url: '/xadd/:key',
  handler: async (request, reply) => {
    const { redis } = fastify
    const { id = '*', ...props } = request.body
    const flattened = lodash.flatten(Object.entries(props))
    const idRes = await redis.xadd(request.params.key, id, ...flattened)
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
