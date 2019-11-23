module.exports = fastify =>
  fastify.route({
    method: 'GET',
    url: '/seq',
    handler: async (request, reply) => {
      const { redis } = fastify
      const seq = (await redis.hget('seq:h', request.client)) || '0-0'
      reply.send({ seq })
    },
  })
