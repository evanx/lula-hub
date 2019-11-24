# lula-hub

## Status: WIP

Todo:

- Websockets to avoid polling

Related services:

- lula-auth is complete, with Jest tests on its two endpoints.
- lula-client is unstarted, just a placeholder repo at present

## Overview

Lula-hub is a Node.js HTTP microservice to sync Redis streams. It's intended use-case is for reliable distributed messaging.

Its stack includes:

- Fastify
- Redis
- Node

Lula-hub uses lula-auth for bearer token authentication - see https://github.com/evanx/lula-auth

Lula-hub is an HTTP server used by lula-client to sync events - see https://github.com/evanx/lula-client (WIP)

## Goals

On a remote device, we wish to publish events by adding these to a local Redis stream, e.g.:

```shell
redis-cli XADD lula-client:out:x MAXLEN 10000 * topic 'test' payload '{ "type": "hello" }'
```

Then on our central cloud infrastructure we can consume these events by reading a sync'ed stream e.g.:

```shell
redis-cli XREAD STREAMS lula-hub:in:x "${seq}"
```

Vice versa for messages sent from the hub to remote clients e.g.:

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

Custom functions whose side effects are limited to Redis are readily testable e.g.:

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
    const bcryptRes = await redisClient.hget(state.clientKey, 'secret')
    expect(bcryptRes).toBeTruthy()
    await expect(bcrypt.compare(payload.secret, bcryptRes)).resolves.toEqual(true)
  })

  ... // More tests
})
```

### lula-auth

We pre-authorize a client to register itself to the hub using a specified `regToken` before `regDeadline` as follows:

```shell
redis-cli hmset "lula-auth:client:${clientId}:h" regToken "${regToken}" regDeadline "${regDeadline}"
```

where `regToken` is bcrypted, and `regDeadline` is an epoch in milliseconds.

The lula-auth microservice provides `/register` and `/login` endpoints.

The lula-client will `/register` itself once-off, specifying a self-generated authentication `secret,` together with its provisioned `regToken.` If the `regDeadline` has expired, then it must be extended (in Redis) in order for the client's registration to succeed.

Thereafter the client can `/login` using that `secret` in order to receive a `bearerToken` for HTTP requests to lula-hub.

Lula-auth will create a `session` hashes key in Redis named `session:${bearerToken}:h` with a field `client.`

Lula-hub uses the `bearerToken` from the HTTP `Authorization` header to authenticate the client as follows:

```javascript
const client = await fastify.redis.hget(`session:${bearerToken}:h`, 'client')
```

This session key will expire, and thereafter lula-client must `/login` again.

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
to advise the lula-client to `/login` again.

### lula-client

This is a daemon process that we run on a client to sync the outgoing stream to the hub, and pull any messages.

#### Client publish to hub

On the client device, custom processes publish messages to the hub simply by adding these into a local Redis stream e.g.:

```javascript
redis-cli XADD 'lula-client:out:x' MAXLEN 10000 * topic 'test' payload '{ "type": "hello" }'
```

Incoming messages from the hub are synced into the stream `lula-client:in:x.` Custom processes on the device can consume this stream.

#### Client registration

The client device is provisioned with a `regToken.`

When the lula-client starts up for the first time, it must generate and store its secret for authentication.

The client posts its provisioned `regToken` and chosen `secret` to lula-auth's `/register` endpoint:

- in the event of a 200 (ok), change the client state to registered
- in the event of an error, then retry `/register` at long intervals

#### Client sync

A registered client can then `/login` via lula-auth and sync to lula-hub:

- login using the `/login` endpoint from lula-auth
- use the session token from `/login` as a `Bearer` token for HTTP requests to the hub
- query the hub's `/seq` endpoint for the latest ID received from our client
- read the next entry in the `out` stream using `XREAD` with that ID
- set the entry's `seq` field to its stream ID
- post the entry to the hub using the `/xadd` endpoint
- in the event of a 200 (ok), loop to `XREAD` the next entry
- in the event of a 401 (unauthorized), `/login` again using lula-auth, then retry
- in the event of a 429 (too many requests), then retry after a delay
- in the event of a 409 (conflict) for a retry, ignore and loop to `XREAD` the next entry
- in the event of a another error, retry the HTTP request to lula-hub

Note that a 409 indicates the posted `seq` is equal or less than the last `seq` on record,
and so is treated as a duplicate. We expect this in the event of a retry of a
posting where the response was not received, and so we did not know that
it was successfully processed.

### Client polling

When not using websockets (TODO), we poll for messages for the client from the hub's `out:${client}` stream as follows:

- query the local Redis for the latest received ID for hub messages
- if we have not yet received any messages from the hub, then use `0-0` for the ID
- with that ID, read the next message from the hub using its `/xread` endpoint with a long `blockMs` timeout
- if no new message is available, then retry `/xread`
- ensure the last entry's `seq` field to its remote stream ID
- add that message to the `in` stream of the local Redis
- atomically store this latest `seq` for future resumption
- loop to `/xread` the next hub message

Note that the `/xread` endpoint supports a blocking timeout to support "long polling" e.g. via query parameter `?blockMs=30000.`

## Design

The proposed solution enables simple reliable async messaging with a central hub via HTTPS by leveraging Redis streams.

Clients have a unique client ID, which is set as the `client` field of their entries posted to the hub's `in` stream.
This stream includes messages from all clients, in the order in which they are received by the hub.

### Sequence

When an entry is added to a Redis stream, it is assigned an auto-generated sequential ID.
This is essentially the timestamp that the message is added according to Redis' clock.
(See https://redis.io/topics/streams-intro.)

When a client message is posted to the hub, its local stream ID is specified as a field named `seq.`

Clients add outgoing messages to an `out` stream in their local Redis i.e. using `xadd.`
Their lula-client process syncs this remote `out` stream into the hub's `in` stream.

Messages can be reposted by clients e.g. to retry in the event of a network error. The hub will ignore messages already received
according to the message's sequential ID. This serves to ensure that messages are not duplicated
and that "exactly-once" delivery can be guaranteed.

### Hub outgoing

Messages are sent to a client by adding them to a stream `out:${client}` on the hub.

### Request/response message pairing

To support the request/response pattern, the response message should reference the ID of the request message.
For example, a response message sync'ed to the hub has the following fields:

- `seq` field for the remote sequential stream ID
- `req` field matching the request's `seq` field

When the response is added to the hub's `in` stream, it will be assigned an auto-generated ID reflecting the hub's Redis clock,
and this differs from its remote `seq.`

## Related

- https://github.com/evanx/lula-auth
- https://github.com/evanx/lula-client
