const { buildSha1 } = require('lula-common')

module.exports = app => {
  return async (ws, req) => {
    app.monitor.debug(`connect:${req.headers.host}`)
    const sessionToken = (req.url.match(/^\/\?sessionToken=(\S+)$/) || []).pop()
    if (!sessionToken) {
      app.monitor.debug('close:token')
      ws.close()
      return
    }
    const client = await app.redis.hget(
      `session:${buildSha1(sessionToken)}:h`,
      'client',
    )
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
