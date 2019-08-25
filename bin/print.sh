#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  echo "Unsupported NODE_ENV: $NODE_ENV"
  exit 1
fi

set -x

redis-cli keys 'fr:*'
redis-cli xread streams fr:mystream:x 0 
redis-cli xrange fr:mystream:x - +
