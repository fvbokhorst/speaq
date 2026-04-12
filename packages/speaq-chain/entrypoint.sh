#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
API_PORT="${PORT:-9334}"

# Initialize if not already done
if [ ! -f "$DATA_DIR/node.json" ]; then
    echo "=== Initializing SPEAQ Chain Node ==="
    /app/speaq-chain --data-dir "$DATA_DIR" init
fi

# Start node in API-only mode (Cloud Run supports only 1 port)
echo "=== Starting SPEAQ Chain Node (API on port $API_PORT) ==="
exec /app/speaq-chain --data-dir "$DATA_DIR" start --api-only --api-port "$API_PORT"
