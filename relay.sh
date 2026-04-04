#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
node --import tsx packages/speaq-relay/src/server.ts
