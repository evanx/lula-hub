# frx-sync-mlk

Microservice for Redis message streams via bearer session token.

`frx` prefix: the stack includes Fastify and Redis streams

`mlk` postfix: named in honour of MLK

## Design 



### Authentication

We wish to use https://github.com/evanx/fr-bearer-auth-mlk

See https://github.com/evanx/fastify-auth-mlk

```javascript
fastify.register(require('fastify-bearer-auth'), {
  auth: async (token, request) => {
    const client = await fastify.redis.hget(`session:${token}:h`, 'client')
    if (client) {
      request.client = client
      return true
    }
    return false
  },
  errorResponse: err => {
    return { code: 401, error: err.message }
  },
})
```

## Related

https://github.com/evanx/fastify-xadd-mlk
