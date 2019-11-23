const config = require('config')

const fastify = require('fastify')({ logger: config.logger })

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

require('./seq')(fastify)
require('./xadd')(fastify)
require('./xread')(fastify)

module.exports = fastify
