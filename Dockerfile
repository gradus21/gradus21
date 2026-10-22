# =============================================================================
# Stage 1a: Build Rust WASM Core for Web
# =============================================================================
FROM rust:bookworm AS wasm-builder
WORKDIR /app
RUN rustup target add wasm32-unknown-unknown && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates
COPY src-tauri ./src-tauri

RUN wasm-pack build crates/gradus21-core --target web --out-dir ../../web/src/wasm-pkg

# =============================================================================
# Stage 1b: Build Rust Server Binary
# =============================================================================
FROM rust:bookworm AS server-builder
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates
COPY src-tauri ./src-tauri

RUN cargo build --release -p gradus21-server

# Backward compatibility alias
FROM server-builder AS rust-builder

# =============================================================================
# Stage 2: Build React + TypeScript + WASM Web UI
# =============================================================================
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
COPY --from=wasm-builder /app/web/src/wasm-pkg ./src/wasm-pkg
RUN npm run build

# =============================================================================
# Stage 3: Ultra-Lightweight Rust API Runtime (~20 MB RAM)
# =============================================================================
FROM debian:bookworm-slim AS server-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && \
    groupadd -r gradus21 && useradd -r -g gradus21 -d /app -s /sbin/nologin gradus21 && \
    mkdir -p /app/data && chown -R gradus21:gradus21 /app
WORKDIR /app
COPY --from=server-builder /app/target/release/gradus21-server /usr/local/bin/gradus21-server
USER gradus21
EXPOSE 8080
CMD ["gradus21-server"]

# =============================================================================
# Stage 4: Nginx Static + Reverse Proxy Runtime
# =============================================================================
FROM nginx:alpine AS web-runtime
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

