module.exports = app => {
  const handlers = {
    authenticate: require('../ws-message-authenticate'),
  }
  const testHandlers = {
    'test-end': require('../ws-message-test-end'),
  }
  if (process.env.NODE_ENV !== 'production') {
    Object.assign(handlers, testHandlers)
  }
  return handlers
}
