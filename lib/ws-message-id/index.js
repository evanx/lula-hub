module.exports = {
  spec: {},
  async handle({ redis }, { ws }) {
    const id = (await redis.hget('id:h', ws.client)) || '0-0'
    return { id }
  },
}
