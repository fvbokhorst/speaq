# SPEAQ Chain Node - Docker build
# Multi-stage: build in Rust, run minimal
FROM rust:1.86-bookworm AS builder

# Install RocksDB dependencies
RUN apt-get update && apt-get install -y \
    librocksdb-dev \
    libclang-dev \
    clang \
    cmake \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY tests/ tests/

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    librocksdb7.8 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/speaq-chain /app/speaq-chain

# Data directory
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

# Cloud Run uses PORT env var
ENV PORT=9334

# Init + Start script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 9334

CMD ["/app/entrypoint.sh"]
