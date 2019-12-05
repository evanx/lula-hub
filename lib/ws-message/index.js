module.exports = (app, ws, handlers) => {
  return async messageString => {
    try {
      const message = JSON.parse(messageString)
      const { type, id, payload } = message
      if (typeof type !== 'string') {
        ws.send(
          JSON.stringify({
            type: 'err',
            payload: { field: 'type', req: message },
          }),
        )
      }
      if (typeof id !== 'string') {
        ws.send(
          JSON.stringify({
            type: 'err',
            payload: { field: 'id', req: message },
          }),
        )
      }
      if (type !== 'authenticate') {
        if (!ws.client) {
          ws.close()
        }
      }
      const handler = handlers[type]
      if (!handler) {
        app.monitor.warn(`unsupported type: ${type}`, { messageString })
      } else if (typeof handler.handle !== 'function') {
        app.monitor.warn(`invalid handler: ${type}`, { messageString })
      } else {
        const res = await handler.handle(app, { ws, payload })
        if (typeof res === 'object') {
          const resMessage = {
            type: '_' + message.type,
            id: message.id,
            payload: res,
          }
          ws.send(JSON.stringify(resMessage))
        }
      }
    } catch (err) {
      app.monitor.warn(`message err`, { err, messageString })
    }
  }
}
