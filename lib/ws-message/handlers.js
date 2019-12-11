module.exports = app => {
  const handlers = {
    authenticate: require('../ws-message-authenticate'),
    echo: require('../ws-message-echo'),
    id: require('../ws-message-id'),
    xread: require('../ws-message-xread'),
    xadd: require('../ws-message-xadd'),
  }
  const testHandlers = {
    'test-end': require('../ws-message-test-end'),
  }
  if (process.env.NODE_ENV !== 'production') {
    Object.assign(handlers, testHandlers)
  }
  return handlers
}
