# lula-hub

## Status: WIP

Todo:

- Blocking timeout for `/xread` for long polling
- Refactor for Jest tests on endpoints similar to Lula-auth
- Websockets to avoid polling

Related services:

- Lula-auth is complete, with Jest tests on its two endpoints.
- Lula-remote is unstarted

## Overview

Lula-hub is an HTTP microservice to sync Redis streams intended for reliable distributed messaging.

Its stack includes:

- Fastify
- Redis
- Node

Lula-hub uses Lula-auth for pre-authorized bearer session token authentication - see https://github.com/evanx/lula-auth

Lula-hub is used by Lula-remote to sync remote incoming and outgoing messages with the hub - see https://github.com/evanx/lula-remote (WIP)

## Design

The proposed solution enables simple reliable async messaging with a central hub via HTTPS by leveraging Redis streams.

Remote clients have a unique client ID, which is set as the `source` field of their entries posted to the hub's `in` stream.
This stream includes messages from all clients, in the order in which they are received by the hub.

When an entry is added to a Redis stream, it is assigned an auto-generated sequential ID.
This is essentially the timestamp that the message is added according to Redis' clock.
(See https://redis.io/topics/streams-intro.)

When a message is posted to the hub, this remote ID is specified as a field named `seq.`

Remote clients add outgoing messages to an `out` stream in their local Redis i.e. using `xadd.` Their Lula-remote process syncs this remote `out` stream
into the hub's `in` stream.

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

The Lula-remote process on the client syncs this stream up to the hub as follows:

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

- https://github.com/evanx/lula-auth
- https://github.com/evanx/lula-remote
