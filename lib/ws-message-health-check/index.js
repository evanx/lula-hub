module.exports = {
  spec: {},
  async handle({ redis }, { ws, message }) {
    const { payload } = message
    return { health: 100 }
  },
}
