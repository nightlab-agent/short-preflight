#!/bin/sh
set -e
node --test tests/*.test.js
for f in bin/*.js lib/*.js; do node --check "$f"; done
