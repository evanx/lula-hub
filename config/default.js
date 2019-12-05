module.exports = {
  inStreamKeyPrefix: 'in',
  outStreamKeyPrefix: 'out',
  xreadCount: 9,
  logger: {
    level: 'info',
  },
  redis: {
    keyPrefix: 'lula:',
    url: 'redis://127.0.0.1:6379',
  },
  webSocketServer: {
    port: 3002,
    path: '/',
    maxPayload: 1048576,
  },
}
