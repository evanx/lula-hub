const config = require('config')

const { buildLogger, buildRedis, endRedis, multiAsync } = require('./lib/utils')

const redisClient = buildRedis(config.redis)
const logger = buildLogger({ name: 'lula.integration', level: 'debug' })

describe('lula-hub', () => {
  const state = {
    clientId: 'test-client',
    sessionToken: 'abc123',
    authHeader: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc123',
    },
    fastify: require('./lib/fastify'),
  }

  beforeAll(async () => {
    const sessionKey = `session:${state.sessionToken}:h`
    const [time] = await multiAsync(redisClient, [
      ['time'],
      ['del', 'in:x'],
      ['del', `out:${state.clientId}:x`],
      ['del', 'seq:h'],
      ['del', sessionKey],
      ['hset', sessionKey, 'client', state.clientId],
      ['expire', sessionKey, 20],
    ])
    state.startTimeMs = Math.floor(
      parseInt(time[0]) * 1000 + parseInt(time[1]) / 1000,
    )
    logger.debug({ startTimeMs: state.startTimeMs }, 'beforeAll')
    expect(state.startTimeMs).toBeGreaterThan(1555e9)
    expect(state.startTimeMs).toBeLessThan(1999e9)
  })

  afterAll(async () => {
    state.fastify.close()
    await endRedis(redisClient)
  })

  it('should forbid without credentials', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/seq',
      headers: {},
    })
    expect(JSON.parse(res.body)).toStrictEqual({
      code: 401,
      message: 'missing authorization header',
    })
  })

  it('should forbid when invalid credentials', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/seq',
      headers: {
        Authorization: 'Bearer abc111',
      },
    })
    expect(JSON.parse(res.body)).toStrictEqual({
      code: 401,
      message: 'invalid authorization header',
    })
  })

  it('should advise 0-0 seq initially', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/seq',
      headers: state.authHeader,
    })
    const body = JSON.parse(res.body)
    expect(body.seq).toBe('0-0')
  })

  it('should reject message with seq not string', async () => {
    const message = {
      type: 'test',
      seq: state.startTimeMs,
    }
    const res = await state.fastify.inject({
      method: 'POST',
      url: '/xadd',
      headers: state.authHeader,
      payload: JSON.stringify(message),
    })
    expect(JSON.parse(res.body)).toStrictEqual({
      code: 400,
      message: 'Bad request (seq type)',
    })
  })

  it('should reject message with invalid seq format', async () => {
    const message = {
      type: 'test',
      seq: toString(state.startTimeMs),
    }
    const res = await state.fastify.inject({
      method: 'POST',
      url: '/xadd',
      headers: state.authHeader,
      payload: JSON.stringify(message),
    })
    expect(JSON.parse(res.body)).toStrictEqual({
      code: 400,
      message: 'Bad request (seq format)',
    })
  })

  it('should accept message', async () => {
    const message = {
      type: 'test',
      seq: `${state.startTimeMs}-0`,
    }
    const res = await state.fastify.inject({
      method: 'POST',
      url: '/xadd',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer abc123',
      },
      payload: JSON.stringify(message),
    })
    const body = JSON.parse(res.body)
    expect(parseInt(body.id)).toBeGreaterThan(state.startTimeMs)
  })

  it('should advise nonzero seq', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/seq',
      headers: state.authHeader,
    })
    const body = JSON.parse(res.body)
    expect(parseInt(body.seq)).toBeGreaterThanOrEqual(state.startTimeMs)
  })

  it('should get empty items when reading empty stream', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/xread/0-0',
      headers: state.authHeader,
    })
    expect(JSON.parse(res.body).items).toHaveLength(0)
  })

  it('should read data added to stream', async () => {
    await redisClient.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out',
      'payload',
      '{}',
    )
    const res = await state.fastify.inject({
      method: 'GET',
      url: '/xread/0-0',
      headers: state.authHeader,
    })
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    expect(item).toMatchObject({ type: 'test-out', payload: '{}' })
    expect(parseInt(item.seq)).toBeGreaterThanOrEqual(state.startTimeMs)
    state.seq = item.seq
  })

  it('should get empty items when reading past end of stream', async () => {
    const res = await state.fastify.inject({
      method: 'GET',
      url: `/xread/${state.seq}`,
      headers: state.authHeader,
    })
    expect(JSON.parse(res.body).items).toHaveLength(0)
  })

  it('should read latest data added to stream', async () => {
    await redisClient.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out-again',
      'payload',
      '{}',
    )
    const res = await state.fastify.inject({
      method: 'GET',
      url: `/xread/${state.seq}`,
      headers: state.authHeader,
    })
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    expect(item).toMatchObject({ type: 'test-out-again', payload: '{}' })
    expect(parseInt(item.seq)).toBeGreaterThanOrEqual(parseInt(state.seq))
    state.seq = item.seq
  })
})
