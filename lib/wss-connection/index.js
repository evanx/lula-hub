module.exports = app => {
  return async (ws, req) => {
    const token = (req.url.match(/^\/\?token=(\w+)$/) || []).pop()
    if (!token) {
      ws.close()
      return
    }
    const client = await app.redis.hget(`session:${token}:h`, 'client')
    if (!client) {
      ws.close()
      return
    }
    ws.client = client
    app.websockets.set(client, ws)
    ws.on('close', require('../ws-close')(app))
    ws.on(
      'message',
      require('../ws-message')(
        app,
        app.monitor.child({ name: 'message' }),
        ws,
        require('../ws-message/handlers')(app),
      ),
    )
  }
}
