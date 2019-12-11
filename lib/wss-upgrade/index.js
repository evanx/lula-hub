module.exports = app => {
  return async (req, socket) => {
    const token = (req.url.match(/^\/\?token=(\w+)$/) || []).pop()
    if (!token) {
      socket.destroy()
    }
  }
}
