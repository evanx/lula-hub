#!/bin/bash
set -e
if [ $NODE_ENV != 'development' ]
then
  echo "Unsupported NODE_ENV: $NODE_ENV"
  exit 1
fi

set -x 

curl -X 'POST' -d 'type=test&source=test' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Accept: application/json" \
  http://127.0.0.1:3000/xadd/mystream:x 

