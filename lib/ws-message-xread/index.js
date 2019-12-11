const reduceProps = props => {
  const res = {}
  for (let i = 0; i < props.length; i += 2) {
    res[props[i]] = props[i + 1]
  }
  return res
}

module.exports = {
  async handle({ config, redis, monitor }, { ws, payload }) {
    const { id, blockMs } = payload
    monitor.assert.string('payload', { id })
    const options = ['COUNT', config.xreadCount]
    if (blockMs) {
      options.push('BLOCK', blockMs)
    }
    const res = await redis.xread(
      ...options,
      'STREAMS',
      `${config.outStreamKeyPrefix}:${ws.client}:x`,
      id,
    )
    if (!res) {
      return {
        items: [],
      }
    } else {
      return {
        items: res[0][1].map(
          ([id, props]) => Object.assign(reduceProps(props), { id }),
          {},
        ),
      }
    }
  },
}
