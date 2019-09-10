const Redis = require('ioredis')
const redis = new Redis(process.env.MDEL_URL || {})

const exit = err => {
  console.error(err)
  process.exit(1)
}

const mdel = match => {
  const stream = redis.scanStream({ match, count: 100 })
  const pipeline = redis.pipeline()
  stream.on('data', keys => {
    if (keys.length) {
      console.log(keys.join('\n'))
      keys.map(key => pipeline.del(key))
    }
  })
  stream.on('end', () => pipeline.exec(() => redis.quit()))
  stream.on('error', err => exit(err))
}

if (process.env.MDEL_MATCH) {
  mdel(process.env.MDEL_MATCH)
} else {
  exit({ message: 'Expecting: MDEL_MATCH' })
}
