const config = require('config')
const WebSocket = require('ws')

const {
  buildId,
  buildMonitor,
  buildRedis,
  endRedis,
  multiAsync,
} = require('./lib/utils')

const redis = buildRedis(config.redis)
const monitor = buildMonitor(
  { redis },
  { name: 'lula-hub:integration', level: 'debug' },
)

console.log()

const openUrl = async url =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => {
      resolve(ws)
    })
    ws.on('close', () => {
      reject({ event: 'close' })
    })
    setTimeout(reject, 2000)
  })

const open = token => openUrl(`ws://127.0.0.1:3002?sessionToken=${token}`)

const send = (ws, message) =>
  new Promise((resolve, reject) => {
    ws.on('message', message => {
      resolve(JSON.parse(message))
    })
    ws.on('close', () => {
      reject({ event: 'close' })
    })
    setTimeout(() => ws.send(JSON.stringify(message)), 10)
    setTimeout(reject, 2000)
  })

describe('lula-hub', () => {
  const state = {
    clientId: 'test-client',
    sessionToken: 'abc123',
  }

  const exchange = async message => {
    const ws = await open(state.sessionToken)
    const id = buildId()
    message.id = id
    monitor.debug('exchange', message)
    const res = await send(ws, message)
    monitor.assert.equal('exchange', res, {
      id: message.id,
    })
    ws.close()
    return res
  }

  const xadd = async data => {
    state.id = state.startTimeMs + '-0'
    const res = await exchange({
      type: 'xadd',
      payload: Object.assign(
        {
          id: state.id,
        },
        data,
      ),
    })
    expect(parseInt(res.payload.id)).toBeGreaterThan(state.startTimeMs)
    monitor.debug('xadd', { id: state.id })
    return res
  }

  beforeAll(async () => {
    const sessionKey = `session:${state.sessionToken}:h`
    const [time] = await multiAsync(redis, [
      ['time'],
      ['del', 'in:x'],
      ['del', `out:${state.clientId}:x`],
      ['del', 'id:h'],
      ['del', sessionKey],
      ['hset', sessionKey, 'client', state.clientId],
      ['expire', sessionKey, 20],
    ])
    state.startTimeMs = Math.floor(
      parseInt(time[0]) * 1000 + parseInt(time[1]) / 1000,
    )
    monitor.debug({ startTimeMs: state.startTimeMs }, 'beforeAll')
    expect(state.startTimeMs).toBeGreaterThan(1555e9)
    expect(state.startTimeMs).toBeLessThan(1999e9)
  })

  afterAll(async () => {
    await endRedis(redis)
  })

  it('should open when correct credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?sessionToken=abc123')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).resolves.toMatchObject({
      type: 'echo',
      id,
      payload: { say: 'hi' },
    })
    ws.close()
  })

  it('should close when invalid credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?sessionToken=a')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).rejects.toEqual({ event: 'close' })
  })

  it('should close when empty credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?sessionToken=')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).rejects.toEqual({ event: 'close' })
  })

  it('should close when no credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).rejects.toEqual({ event: 'close' })
  })

  it('should advise 0-0 id initially', async () => {
    const res = await exchange({ type: 'id' })
    expect(res).toMatchObject({
      type: 'id',
      payload: { id: '0-0' },
    })
  })

  it('should reject message with id not string', async () => {
    const res = await exchange({
      type: 'xadd',
      payload: {
        id: state.startTimeMs,
      },
    })
    expect(res).toMatchObject({
      type: 'xadd',
      payload: {
        status: 400,
        message: 'Bad payload (id type)',
      },
    })
  })

  it('should reject message with invalid id format', async () => {
    const res = await exchange({
      type: 'xadd',
      payload: {
        id: toString(state.startTimeMs),
      },
    })
    expect(res).toMatchObject({
      type: 'xadd',
      payload: {
        status: 400,
        message: 'Bad payload (id format)',
      },
    })
  })

  it('should accept message', async () => {
    await xadd({ say: 'hello' })
  })

  it('should advise nonzero id', async () => {
    const res = await exchange({ type: 'id' })
    expect(res.payload.id).toBe(state.id)
  })

  it('should get empty items when reading empty stream', async () => {
    const res = await exchange({ type: 'xread', payload: { id: '0-0' } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(0)
  })

  it('should read data added to stream', async () => {
    state.id = await redis.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out',
      'payload',
      '{}',
    )
    const res = await exchange({ type: 'xread', payload: { id: '0-0' } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(1)
    const item = res.payload.items[0]
    expect(item).toMatchObject({
      type: 'test-out',
      payload: '{}',
      id: state.id,
    })
  })

  it('should get empty items when reading past end of stream', async () => {
    const res = await exchange({ type: 'xread', payload: { id: state.id } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(0)
  })

  it('should read latest data added to stream', async () => {
    const id = state.id
    state.id = await redis.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out-2',
      'payload',
      '{}',
    )
    const res = await exchange({ type: 'xread', payload: { id } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(1)
    const item = res.payload.items[0]
    expect(item).toMatchObject({
      type: 'test-out-2',
      payload: '{}',
      id: state.id,
    })
  })

  it('should block waiting for data', async () => {
    const now = Date.now()
    const id = state.id
    const blockTimeout = 100
    const res = await exchange({
      type: 'xread',
      payload: { id, blockTimeout },
    })
    expect(res.payload.items).toHaveLength(0)
    const duration = Date.now() - now
    expect(duration).toBeGreaterThanOrEqual(100)
    expect(duration).toBeLessThan(500)
    process.stdout.write('\n')
  })
})
