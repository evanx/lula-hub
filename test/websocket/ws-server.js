const config = require('config')
const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: config.port })

wss.on('connection', ws => {
  ws.on('message', message => {
    console.log('received message:', message)
  })
  ws.send('something from server')
})
