module.exports = app => {
  return async (ws, req) => {
    app.monitor.debug(`connect:${req.headers.host}`)
    const token = (req.url.match(/^\/\?sessionToken=(\S+)$/) || []).pop()
    if (!token) {
      app.monitor.debug('close:token')
      ws.close()
      return
    }
    const client = await app.redis.hget(`session:${token}:h`, 'client')
    if (!client) {
      app.monitor.debug('close:session')
      ws.close()
      return
    }
    ws.client = client
    app.websockets.set(client, ws)
    ws.on('close', require('../ws-close')(app))
    ws.on(
      'message',
      require('../ws-message')(app, ws, require('../ws-message/handlers')(app)),
    )
  }
}
