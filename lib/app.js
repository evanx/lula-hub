const WebSocket = require('ws')

module.exports = {
  async start(app) {
    const { config, monitor, redis } = app
    Object.assign(app, { websockets: new Map() })
    const wss = new WebSocket.Server(config.webSocketServer)
    wss._server.on('upgrade', require('./wss-upgrade')(app))
    wss.on('connection', require('./wss-connection')(app))
    return {
      async end() {},
    }
  },
}
