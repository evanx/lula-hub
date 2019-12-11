const reduceProps = props => {
  const res = {}
  for (let i = 0; i < props.length; i += 2) {
    res[props[i]] = props[i + 1]
  }
  return res
}

module.exports = {
  async handle({ config, redis, monitor }, { ws, payload }) {
    const { seq, blockMs } = payload
    monitor.assert.string('payload', { seq })
    const options = ['COUNT', config.xreadCount]
    if (blockMs) {
      options.push('BLOCK', blockMs)
    }
    const res = await redis.xread(
      ...options,
      'STREAMS',
      `${config.outStreamKeyPrefix}:${ws.client}:x`,
      seq,
    )
    if (!res) {
      return {
        items: [],
      }
    } else {
      return {
        items: res[0][1].map(
          ([seq, props]) => Object.assign(reduceProps(props), { seq }),
          {},
        ),
      }
    }
  },
}
