const WebSocket = require('ws')

const ws = new WebSocket('ws://127.0.0.1:3002?token=abc123')

const app = {}

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      type: 'authenticate',
      id: 'any',
      payload: { token: 'abc123' },
    }),
  )
})

ws.on('message', data => {
  console.log('client received:', data)
  if (!app.testEnd) {
    app.testEnd = Date.now()
    ws.send(JSON.stringify({ type: 'test-end', id: 'any', payload: {} }))
  }
})
