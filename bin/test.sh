#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  exit 1
fi

echo_err() {
  >&2 echo "$*"
}

_clear() {
  redis-cli del lula:in:x
  redis-cli del lula:out:test-client:x
  redis-cli del lula:seq:h
}

_clear

redis-cli del lula:session:abc123:h

echo keys:
redis-cli keys 'lula:*'

echo redis-cli hset lula:session:abc123:h client test-client
redis-cli hset lula:session:abc123:h client test-client

echo redis-cli xadd lula:out:test-client:x 1555000111000-0 type test-out payload '{}' 
redis-cli xadd lula:out:test-client:x 1555000111000-0 type test-out payload '{}' 

echo redis-cli xadd lula:out:test-client:x 1555000111001-0 type test-out payload '{}' 
redis-cli xadd lula:out:test-client:x 1555000111001-0 type test-out payload '{}' 

_xadd() {
  data="${1}"
  echo "xadd ${data}"
  curl -s  -w '\n' -S -X 'POST' -d "${data}" \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xadd
}

_seq() {
  echo "seq"
  curl -s  -w '\n' \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/seq
  echo
}

_xread() {
  id="${1}"
  echo "xread ${id}"
  curl -s -w '\n' \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xread/${id}
  echo
}

_seq | 
  grep '^{"seq":"0-0"}'
_xadd 'type=test-in&seq=1555000111000-0' | 
  grep '^{"id":'
_xadd 'type=test-in&seq=1555000111000-0' | 
  grep '^{"code":409,'
_xadd 'type=test-in&seq=1555000111000-1' | 
  grep '^{"id":'
_seq | 
  grep '^{"seq":"1555000111000-1"}'
_xread 0-0 | 
  grep '\["1555000111000-0",\["type","test-out","payload","{}"'
_xread 1555000111000-0 | 
  grep '\["1555000111001-0",\["type","test-out","payload","{}"'

echo redis-cli xread streams lula:in:x 0-0 
redis-cli xread streams lula:in:x 0-0 
redis-cli xread streams lula:in:x 0-0 | grep type -A1 | tail -1 | grep -q '^test-in$'

echo redis-cli xrange lula:in:x - + 
redis-cli xrange lula:in:x - + 

echo 'OK'

