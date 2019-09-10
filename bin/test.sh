#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  exit 1
fi

redis-cli del fr:client:x
redis-cli keys 'fr:client:*' | xargs -n1 redis-cli del

redis-cli hset 'fr:session:abc123:h' 'client' 'test-client'

_sync() {
  data="$1"
  curl -X 'POST' -d "${data}" \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/sync 
}

_sync 'type=test&source=test&id=1555000111000-0'

redis-cli xread streams fr:client:in:x 0 
redis-cli xrange fr:client:in:x - +

