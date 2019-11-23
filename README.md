# lula-hub

## Status: WIP

Todo:

- Websockets to avoid polling

Related services:

- Lula-auth is complete, with Jest tests on its two endpoints.
- Lula-client is unstarted, just a placeholder repo at present

## Overview

Lula-hub is a Node.js HTTP microservice to sync Redis streams. It's intended use-case is for reliable distributed messaging.

Its stack includes:

- Fastify
- Redis
- Node

Lula-hub uses Lula-auth for pre-authorized bearer session token authentication - see https://github.com/evanx/lula-auth

Lula-hub is used by Lula-client to sync remote incoming and outgoing messages with the hub - see https://github.com/evanx/lula-client (WIP)

## Goals

On a remote device, we wish to publish messages by adding these to a local Redis stream, e.g.:

```shell
redis-cli XADD lula-client:out:x MAXLEN 10000 * topic 'test' payload '{ "type": "hello" }'
```

Then on our central cloud infrastructure we wish to consume these messages from a stream e.g.:

```shell
redis-cli XREAD STREAMS lula-hub:in:x "${seq}"
```

Visa versa for messages sent from the hub to remote clients e.g.:

```shell
redis-cli XADD lula-hub:out:${clientId}:x MAXLEN 1000 * topic 'test' payload '{ "type": "hello" }'
```

The Lula project achieves this by sync'ing such Redis streams reliably via authenticated HTTPS:

- `lula-hub` and `lula-auth` deployed to the cloud
- `lula-client` deployed to remote devices

Although these repos are tiny and simple, they leverage Redis for reliable exactly-once delivery - voila! :)

### Consumer groups

Alternatively to `XREAD` we can use `XREADGROUP` i.e. Redis "consumer groups" to consume streams e.g.:

```shell
redis-cli XREADGROUP GROUP ${group} ${consumer} STREAMS lula-hub:in:x "${seq}"
```

In this use-case, each message is delivered to only one of a group collaborating consumers.

See https://redis.io/commands/xreadgroup.

### Testing

We wish to enable the paradigm of "Redis-driven microservices" to improve testability.

For example, your custom services that produce and consume messages are readily testable e.g.:

- setup the state of your test Redis instance
- run your function
- assert that the resulting Redis state is as expected - voila! :)

For example:

```javascript
const bcrypt = require('bcrypt')
const config = require('config')
const Redis = require('ioredis')

describe('register', () => {
  const redisClient = new Redis(config.redis)
  const state = {
    clientId: 'test-client',
  }

  beforeAll(async () => {
    state.clientKey = `client:${state.clientId}:h`
    state.redisTime = await redisClient.time()
  }

  beforeEach(async () => {
    await redisClient.del(state.clientKey)
  })

  afterAll(async () => {
    await redisClient.quit()
  })

  it('should accept valid registration', async () => {
    const payload = {
      client: state.clientId,
      secret: 'test-secret',
      regToken: 'test-regToken',
    }
    ... // Run function under test
    await expect(redisClient.hlen(state.clientKey)).resolves.toStrictEqual(1)
    await expect(redisClient.hkeys(state.clientKey)).resolves.toStrictEqual(['secret'])
    const bcryptRes = await redisClient.hget(state.clientKey, 'secret')
    await expect(bcrypt.compare(payload.secret, bcryptRes)).resolves.toStrictEqual(true)
  })

  ... // More tests
})
```

### lula-auth

We pre-authorize a client to register itself to the hub using a specified `regToken` by a deadline `regBy` as follows:

```shell
redis-cli hmset "lula:client:${clientId}:h" regToken "${regToken}" regBy "${regBy}"
```

The Lula-auth microservice provides `/register` and `/login` endpoints.

The Lula-client will `/register` itself once-off, specifying a self-generated authentication `secret.`

Thereafter the client can `/login` using that `secret` in order to receive a `bearerToken` for HTTP requests to Lula-hub.

Lula-auth will create a `session` hashes key in Redis named `session:${bearerToken}:h` with a field `client.`

Lula-hub uses the `bearerToken` from the HTTP `Authorization` header to authenticate the client as follows:

```javascript
const client = await fastify.redis.hget(`session:${bearerToken}:h`, 'client')
```

This session key will expire, and thereafter Lula-client must `/login` again.

### lula-hub

This is an HTTP microservice using https://fastify.io.

It is intended to be scaleable e.g. via Kubernetes, where each instance connects to the same Redis backend
e.g. a managed instance on your infrastructure provider.

Lula-hub uses `fastify-bearer-auth` to authenticate the Bearer token as follows e.g.:

```javascript
fastify.register(require('fastify-bearer-auth'), {
  auth: async (bearerToken, request) => {
    const client = await fastify.redis.hget(
      `session:${bearerToken}:h`,
      'client',
    )
    if (client) {
      request.client = client
      return true
    }
    return false
  },
  errorResponse: err => {
    return { code: 401, message: err.message }
  },
})
```

This authenticates the following HTTP header:

```
Authorization: Bearer ${bearerToken}
```

If the Redis session key `session:${bearerToken}:h` has expired, we'll get a `401` HTTP error code,
to advise the Lula-client to `/login` again.

### lula-client

This is a daemon process that we run on a client to sync the outgoing stream to the hub, and pull any messages.

TBC

## Design

The proposed solution enables simple reliable async messaging with a central hub via HTTPS by leveraging Redis streams.

Remote clients have a unique client ID, which is set as the `source` field of their entries posted to the hub's `in` stream.
This stream includes messages from all clients, in the order in which they are received by the hub.

When an entry is added to a Redis stream, it is assigned an auto-generated sequential ID.
This is essentially the timestamp that the message is added according to Redis' clock.
(See https://redis.io/topics/streams-intro.)

When a message is posted to the hub, this remote ID is specified as a field named `seq.`

Remote clients add outgoing messages to an `out` stream in their local Redis i.e. using `xadd.`
Their Lula-client process syncs this remote `out` stream into the hub's `in` stream.

Messages can be reposted by clients e.g. to retry in the event of a network error. The hub will ignore messages already received
according to the message's sequential ID. This serves to ensure that messages are not duplicated
and that "exactly-once" delivery can be guaranteed.

Messages are sent to a client by adding them to a stream `out:${client}` on the hub.

To support the request/response pattern, the response message should reference the ID of the request message.
For example, a response message sync'ed to the hub has the following fields:

- `seq` field for the remote sequential stream ID
- `req` field matching the request's `seq` field

When the response is added to the hub's `in` stream, it will be assigned an auto-generated ID reflecting the hub's Redis clock,
and this differs from its remote `seq.`

### Client publish to hub

A client publishes messages by adding these into a local Redis stream

```javascript
redis-cli XADD out:x MAXLEN 10000 * topic 'test' payload '{ "type": "hello" }'
```

The Lula-client process on the client syncs this stream up to the hub as follows:

- generate and store secret for authentication (once-off)
- use the `/register` endpoint from Lula-auth (once-off)
- login using the `/login` endpoint from Lula-auth
- use the session token from `/login` as a `Bearer` token for HTTP requests to the hub
- query the hub's `/seq` endpoint for the latest ID received from our client
- read the next entry in the `out` stream using `XREAD` with that ID
- set the entry's `seq` field to its stream ID
- post the entry to the hub using the `/xadd` endpoint
- in the event of a 200 (ok), loop to `XREAD` the next entry
- in the event of a 401 (unauthorized), `/login` again using Lula-auth, then retry
- in the event of a 429 (too many requests), then retry after a delay
- in the event of a 409 (conflict) for a retry, ignore and loop to `XREAD` the next entry
- in the event of a another error, retry the HTTP request to Lula-hub

Note that a 409 indicates the posted `seq` is equal or less than the last `seq` on record,
and so is treated as a duplicate. We expect this in the event of a retry of a
posting where the response was not received, and so we did not know that
it was successfully processed.

### Client polling

When not using websockets (TODO), we poll for messages for the client from the hub's `out:${client}` stream as follows:

- query the local Redis for the latest received ID for hub messages
- if we have not yet received any messages from the hub, then use `0-0` for the ID
- with that ID, read the next message from the hub using its `/xread` endpoint
- set the entry's `seq` field to its remote stream ID
- add that message to the `in` stream of the local Redis
- atomically store this latest `seq` for future resumption
- loop to `/xread` the next hub message

TODO: Note that the `/xread` endpoint supports a blocking timeout e.g. 30 seconds, to support polling.

### Authentication

We authenticate bearer tokens managed by https://github.com/evanx/lula-auth,
which provides `/register` and `/login` endpoints. If the bearer token is valid, then the Redis
hashes key `session:${token}:h` will exist.

```javascript
fastify.register(require('fastify-bearer-auth'), {
  auth: async (bearerToken, request) => {
    const client = await fastify.redis.hget(
      `session:${bearerToken}:h`,
      'client',
    )
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

- https://github.com/evanx/lula-auth
- https://github.com/evanx/lula-client
