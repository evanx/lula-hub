module.exports = app => {
  return async (req, socket) => {
    const token = (req.url.match(/^\/\?accessToken=(\S+)$/) || []).pop()
    if (!token) {
      socket.destroy()
    }
  }
}
