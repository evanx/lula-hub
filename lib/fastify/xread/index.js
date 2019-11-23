const config = require('config')

const { reduceProps } = require('../../utils')

module.exports = fastify =>
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
