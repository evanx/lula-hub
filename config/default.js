module.exports = {
  inStreamKeyPrefix: 'in',
  outStreamKeyPrefix: 'out',
  xreadCount: 9,
  port: 3000,
  logger: {
    level: 'info',
  },
  redis: {
    keyPrefix: 'fr:',
    url: 'redis://127.0.0.1:6379',
  },
}
