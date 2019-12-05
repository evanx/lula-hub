const { buildRedis, endRedis } = require('../../lib/utils')
const redis = buildRedis()

const state = {
  clientId: 'test-client',
  bearerToken: 'test-token',
}

redis.hset(`lula:session:${state.bearerToken}:h`, 'client', state.clientId)

const socketio = require('socket.io-client')

const socket = socketio('http://127.0.0.1:3002', {
  path: '/',
  transports: ['websocket'],
  extraHeaders: {
    Authorization: `Bearer ${state.bearerToken}`,
  },
})

socket.on('connect', () => {
  console.log('connect')
  socket.send('hello', (...args) => {
    console.log('ack')
  })
})

socket.on('message', data => {
  console.log('message', data)
})

socket.on('error', err => {
  console.log('event', err)
})

socket.on('disconnect', () => {
  console.log('disconnect')
})
