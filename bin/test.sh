#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  exit 1
fi


redis-cli del fr:session:abc123:h
redis-cli del fr:in:x
redis-cli del fr:out:test-client:x
redis-cli del fr:seq:h

echo keys:
redis-cli keys 'fr:*'

echo redis-cli hset fr:session:abc123:h client test-client
redis-cli hset fr:session:abc123:h client test-client

echo redis-cli xadd fr:out:test-client:x 1555000111000-0 type test-out payload '{}' 
redis-cli xadd fr:out:test-client:x 1555000111000-0 type test-out payload '{}' 

_xadd() {
  data="$1"
  echo _xadd "${data}"
  curl -s -X 'POST' -d "${data}" \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xadd 
  echo
}

_seq() {
  echo _seq
  curl -s \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/seq
  echo
}

_xread() {
  id="$1"
  curl -s \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xread/${id}
}

_xadd 'type=test-in&seq=1555000111000-0'
_seq
_xread 0-0 | grep '\["1555000111000-0",\["type","test-out","payload","{}"'

echo redis-cli xread streams fr:in:x 0-0 
redis-cli xread streams fr:in:x 0-0 
redis-cli xread streams fr:in:x 0-0 | grep type -A1 | tail -1 | grep -q '^test-in$'

echo 'OK'

