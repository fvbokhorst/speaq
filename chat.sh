#!/bin/bash
NAME="${1:-User}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
node --import tsx packages/speaq-relay/src/cli-chat.ts --name "$NAME" --relay ws://localhost:8080
