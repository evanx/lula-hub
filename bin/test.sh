#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  exit 1
fi

redis-cli del fr:mystream:x
redis-cli keys 'fr:*' | xargs -n1 redis-cli del

redis-cli hset 'fr:session:abc123:h' 'client' 'test-client'

curl -X 'POST' -d 'type=test&source=test' \
  -H 'Authorization: Bearer abc123x' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xadd/mystream:x 

redis-cli xread streams fr:mystream:x 0 
redis-cli xrange fr:mystream:x - +

