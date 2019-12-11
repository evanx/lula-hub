module.exports = {
  async handle({ monitor, redis }, { ws, payload }) {
    const { token } = payload
    monitor.assert.truthy('authenticate', { token })
    const client = await redis.hget(`session:${token}:h`, 'client')
    if (client) {
      ws.client = client
      return { client }
    }
  },
}
