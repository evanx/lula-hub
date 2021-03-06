module.exports = app => {
  return async (req, socket) => {
    const token = (req.url.match(/^\/\?sessionToken=(\S+)$/) || []).pop()
    if (!token) {
      socket.destroy()
    }
  }
}
