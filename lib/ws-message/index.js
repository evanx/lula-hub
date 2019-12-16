module.exports = (app, ws, handlers) => {
  const monitor = app.monitor.child({ name: 'message' })
  return async messageString => {
    try {
      if (!ws.client) {
        ws.close()
      }
      const message = JSON.parse(messageString)
      const { type, id, payload } = message
      monitor.assert.string('received', { id, type })
      const handler = handlers[type]
      if (!handler) {
        monitor.warn(`unsupported type: ${type}`, { messageString })
      } else if (typeof handler.handle !== 'function') {
        monitor.warn(`invalid handler: ${type}`, { messageString })
      } else {
        const payload = await handler.handle(app, { ws, message })
        if (typeof payload === 'object') {
          const res = {
            type: message.type,
            id: message.id,
            payload,
          }
          monitor.debug('res', { resMessage: res })
          ws.send(JSON.stringify(res))
        }
      }
    } catch (err) {
      monitor.warn('catch', { err, messageString })
      ws.send(
        JSON.stringify({
          type: 'err',
          payload: {
            messageString: messageString,
            err: { message: err.message },
          },
        }),
      )
    }
  }
}
