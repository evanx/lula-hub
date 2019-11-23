#!/bin/bash
set -e
if [ $NODE_ENV = 'production' ]
then
  exit 1
fi

echo2() {
  >&2 echo "$*"
}

_review() {
  echo "## review"
  redis-cli hgetall lula:session:abc123:h
  redis-cli xread STREAMS lula:out:test-client:x 0-0
  redis-cli xread STREAMS lula:in:x 0-0
  echo "--"
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

_review 

_xadd() {
  data="${1}"
  echo2 "\n## xadd ${data}"
  curl -s  -w '\n' -S -X 'POST' -d "${data}" \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xadd
}

_seq() {
  echo2 "\n## seq"
  curl -s  -w '\n' \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/seq
  echo
}

_xread() {
  id="${1}"
  echo2 "\n## xread ${id}"
  curl -s -w '\n' \
  -H 'Authorization: Bearer abc123' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xread/${id}
}

_seq | 
  grep '^{"seq":"0-0"}'
_xadd 'type=test1&seq=1555000111000-0' | 
  grep '^{"id":'
_xadd 'type=test-in&seq=1555000111000-0' | 
  grep '^{"code":409,'
_xadd 'type=test2&seq=1555000111000-1' | 
  grep '^{"id":'
_seq | 
  grep '^{"seq":"1555000111000-1"}'
_xread 0-0 | tee /dev/stderr |
  jq '.items[0].seq' | grep -q 1555000111000-0
_xread 0-0 | tee /dev/stderr |
  jq '.items[1].seq' | grep -q 1555000111001-0
_xread 1555000111000-0 | tee /dev/stderr |
  grep ''

echo
echo redis-cli xread streams lula:in:x 0-0 
redis-cli xread streams lula:in:x 0-0 
redis-cli xread streams lula:in:x 0-0 | grep type -A1 | tail -1 | grep -q '^test2$'

echo
echo redis-cli xrange lula:in:x - + 
redis-cli xrange lula:in:x - + 

echo
echo 'OK'

