const config = require('config')
const {
  buildLogger,
  buildRedis,
  endRedis,
  multiAsync,
} = require('../lib/utils')
const redisClient = buildRedis(config.redis)
const logger = buildLogger({ name: 'lula.integration' })

describe('lula', () => {
  const state = {
    clientId: 'test-client',
    sessionToken: 'abc123',
  }

  afterAll(async () => {
    await endRedis(redisClient)
    logger.info('afterAll')
  })

  beforeAll(async () => {
    const sessionKey = `session:${state.sessionToken}:h`
    await multiAsync(redisClient, [
      ['del', 'in:x'],
      ['del', `out:${state.clientId}:x`],
      ['del', 'seq:h'],
      ['del', sessionKey],
      ['hset', sessionKey, 'client', state.clientId],
      ['expire', sessionKey, 60],
    ])
    const sessionTtl = await redisClient.ttl(sessionKey)
    const keys = await redisClient.keys('fr:*')
    logger.debug({ keys, sessionTtl }, 'beforeAll')
  })

  it('should push message', async () => {
    
  })
})
