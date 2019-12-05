module.exports = app => {
  return async () => {
    app.monitor.debug('close')
  }
}
