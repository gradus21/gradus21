/// <reference types="vitest" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveGitCommitSha(): string {
  const envSha = process.env.VITE_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (envSha.trim() && envSha.trim() !== 'unknown') {
    return envSha.trim().slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function resolveGitBranch(): string {
  const envBranch = process.env.VITE_GIT_BRANCH || process.env.GITHUB_REF_NAME || '';
  if (envBranch.trim() && envBranch.trim() !== 'unknown') {
    return envBranch.trim();
  }
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT_SHA__: JSON.stringify(resolveGitCommitSha()),
    __APP_GIT_BRANCH__: JSON.stringify(resolveGitBranch()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['gradus21-core'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/qrcode')
          ) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
});

