module.exports = {
  spec: {},
  async handle({ redis }, { ws, payload }) {
    return { health: 100 }
  },
}
