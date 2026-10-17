# =============================================================================
# Stage 1: Build Rust Workspace (Axum Server + WASM Core)
# =============================================================================
FROM rust:1.83-bookworm AS rust-builder
WORKDIR /app
RUN rustup target add wasm32-unknown-unknown && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates

RUN cargo build --release -p notenflow-server && \
    wasm-pack build crates/notenflow-core --target web --out-dir ../../web/src/wasm-pkg

# =============================================================================
# Stage 2: Build React + TypeScript + WASM Web UI
# =============================================================================
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web ./
COPY --from=rust-builder /app/web/src/wasm-pkg ./src/wasm-pkg
RUN npm run build

# =============================================================================
# Stage 3: Ultra-Lightweight Rust API Runtime (~20 MB RAM)
# =============================================================================
FROM debian:bookworm-slim AS server-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=rust-builder /app/target/release/notenflow-server /usr/local/bin/notenflow-server
EXPOSE 8080
CMD ["notenflow-server"]

# =============================================================================
# Stage 4: Nginx Static + Reverse Proxy Runtime
# =============================================================================
FROM nginx:alpine AS web-runtime
COPY --from=web-builder /app/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
