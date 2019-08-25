#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  echo "Unsupported NODE_ENV: $NODE_ENV"
  exit 1
fi

redis-cli del fr:mystream:x
redis-cli keys 'fr:*' | xargs -n1 echo redis-cli del
