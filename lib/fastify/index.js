const config = require('config')

const fastify = require('fastify')({ logger: config.logger })

fastify.register(require('fastify-helmet'))
fastify.register(require('fastify-formbody'))

fastify.register(require('fastify-redis'), config.redis)
fastify.register(require('fastify-bearer-auth'), {
  auth: async (token, request) => {
    debugger
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

/*
fastify.register(require('fastify-websocket'), {
  handle: conn => {
    conn.socket.on('message', message => {
      debugger
    })
    //conn.pipe(conn) // creates an echo server
  },
  options: {
    maxPayload: 1048576,
    path: '/fastify',
    verifyClient: (info, next) => {
      debugger
      fastify.log.info(info.req.headers, 'verifyClient')
      next(true)
    },
  },
})
*/

fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, (connection, req) => {
  connection.socket.on('message', message => {
    // message === 'hi from client'
    console.log('from client:', message)
    connection.socket.send('hi from server')
  })
})

require('./seq')(fastify)
require('./xadd')(fastify)
require('./xread')(fastify)

module.exports = fastify
