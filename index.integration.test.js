const config = require('config')
const WebSocket = require('ws')

const {
  buildId,
  buildMonitor,
  buildRedis,
  delay,
  endRedis,
  parseRedisMs,
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

const open = token => openUrl(`ws://127.0.0.1:3002?token=${token}`)

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
    state.seq = state.startTimeMs + '-0'
    const res = await exchange({
      type: 'xadd',
      payload: Object.assign(
        {
          seq: state.seq,
        },
        data,
      ),
    })
    expect(parseInt(res.payload.seq)).toBeGreaterThan(state.startTimeMs)
    monitor.debug('xadd', { seq: state.seq })
    return res
  }

  beforeAll(async () => {
    const sessionKey = `session:${state.sessionToken}:h`
    const [time] = await multiAsync(redis, [
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
    monitor.debug({ startTimeMs: state.startTimeMs }, 'beforeAll')
    expect(state.startTimeMs).toBeGreaterThan(1555e9)
    expect(state.startTimeMs).toBeLessThan(1999e9)
  })

  afterAll(async () => {
    await endRedis(redis)
  })

  it('should open when correct credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?token=abc123')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).resolves.toMatchObject({
      type: '^echo',
      id,
      payload: { say: 'hi' },
    })
    ws.close()
  })

  it('should close when invalid credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?token=a')
    const id = buildId()
    await expect(
      send(ws, { type: 'echo', id, payload: { say: 'hello' } }),
    ).rejects.toEqual({ event: 'close' })
  })

  it('should close when empty credentials', async () => {
    const ws = await openUrl('ws://127.0.0.1:3002/?token=')
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

  it('should advise 0-0 seq initially', async () => {
    const res = await exchange({ type: 'seq' })
    expect(res).toMatchObject({
      type: '^seq',
      payload: { seq: '0-0' },
    })
  })

  it('should reject message with seq not string', async () => {
    const res = await exchange({
      type: 'xadd',
      payload: {
        seq: state.startTimeMs,
      },
    })
    expect(res).toMatchObject({
      type: '!xadd',
      payload: {
        status: 400,
        message: 'Bad payload (seq type)',
      },
    })
  })

  it('should reject message with invalid seq format', async () => {
    const res = await exchange({
      type: 'xadd',
      payload: {
        seq: toString(state.startTimeMs),
      },
    })
    expect(res).toMatchObject({
      type: '!xadd',
      payload: {
        status: 400,
        message: 'Bad payload (seq format)',
      },
    })
  })

  it('should accept message', async () => {
    await xadd({ say: 'hello' })
  })

  it('should advise nonzero seq', async () => {
    const res = await exchange({ type: 'seq' })
    expect(res.payload.seq).toBe(state.seq)
  })

  it('should get empty items when reading empty stream', async () => {
    const res = await exchange({ type: 'xread', payload: { seq: '0-0' } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(0)
  })

  it('should read data added to stream', async () => {
    state.seq = await redis.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out',
      'payload',
      '{}',
    )
    const res = await exchange({ type: 'xread', payload: { seq: '0-0' } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(1)
    const item = res.payload.items[0]
    expect(item).toMatchObject({
      type: 'test-out',
      payload: '{}',
      seq: state.seq,
    })
  })

  it('should get empty items when reading past end of stream', async () => {
    const res = await exchange({ type: 'xread', payload: { seq: state.seq } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(0)
  })

  it('should read latest data added to stream', async () => {
    const seq = state.seq
    state.seq = await redis.xadd(
      'out:test-client:x',
      '*',
      'type',
      'test-out-2',
      'payload',
      '{}',
    )
    const res = await exchange({ type: 'xread', payload: { seq } })
    expect(Array.isArray(res.payload.items)).toBe(true)
    expect(res.payload.items).toHaveLength(1)
    const item = res.payload.items[0]
    expect(item).toMatchObject({
      type: 'test-out-2',
      payload: '{}',
      seq: state.seq,
    })
  })

  it('should block waiting for data', async () => {
    const now = Date.now()
    const seq = state.seq
    const blockMs = 100
    const res = await exchange({ type: 'xread', payload: { seq, blockMs } })
    const duration = Date.now() - now
    expect(duration).toBeGreaterThanOrEqual(100)
    expect(duration).toBeLessThan(500)
    expect(res.payload.items).toHaveLength(0)
    process.stdout.write('\n')
  })
})
