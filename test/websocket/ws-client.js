const WebSocket = require('ws')

const start = () => {
  const ws = new WebSocket('ws://127.0.0.1:3002/accessToken=abc123')

  const app = {}

  ws.on('error', err => {
    console.error('error', err)
  })

  ws.on('close', () => {
    console.warn('close')
  })

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
      //ws.send(JSON.stringify({ type: 'test-end', id: 'any', payload: {} }))
    }
  })
}

start()
