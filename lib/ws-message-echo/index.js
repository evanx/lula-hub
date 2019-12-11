module.exports = {
  spec: {},
  async handle({ redis }, { ws, payload }) {
    return { say: 'hi' }
  },
}
