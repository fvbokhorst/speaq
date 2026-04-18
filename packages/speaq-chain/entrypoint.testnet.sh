#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
API_PORT="${PORT:-9334}"

echo "*********************************************************"
echo "*** SPEAQ TESTNET NODE                                ***"
echo "*** development only, tokens have no real value       ***"
echo "*********************************************************"

if [ ! -f "$DATA_DIR/node.json" ]; then
    echo "=== Initializing SPEAQ TESTNET Chain Node ==="
    /app/speaq-chain --data-dir "$DATA_DIR" init
fi

echo "=== Starting SPEAQ TESTNET Node (API on port $API_PORT) ==="
exec /app/speaq-chain --data-dir "$DATA_DIR" start --api-only --api-port "$API_PORT"
