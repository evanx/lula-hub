const config = require('config')

const fastify = require('fastify')({ logger: config.logger })

fastify.register(require('fastify-redis'), config.redis)

fastify.register(require('fastify-websocket'), {
  handle: conn => {
    conn.socket.on('message', message => {
      debugger
    })
    //conn.pipe(conn) // creates an echo server
  },
  options: {
    maxPayload: 1048576,
    path: '/',
    verifyClient: (info, next) => {
      fastify.log.info(info.req.headers, 'verifyClient')
      next(true)
    },
  },
})
