module.exports = (app, monitor, ws, handlers) => {
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
        const res = await handler.handle(app, { ws, payload })
        if (typeof res === 'object') {
          const resStatus = res.status
          const resMessage = {
            type: (resStatus ? '!' : '^') + message.type,
            id: message.id,
            payload: res,
          }
          monitor.debug('res', { resMessage })
          ws.send(JSON.stringify(resMessage))
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // TODO: remove
        console.log(err)
      }
      monitor.warn('catch', { err, messageString })
      ws.send(
        JSON.stringify({
          type: '*err',
          payload: {
            messageString: messageString,
            err: { message: err.message },
          },
        }),
      )
    }
  }
}
