import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
// base: 默认 /(Vercel + 本地 dev)。仅 GitHub Pages 构建走子路径 /pvzh-webapp/,
// 由 CI 设 DEPLOY_TARGET=pages 触发。
export default defineConfig(() => ({
  base: process.env.DEPLOY_TARGET === 'pages' ? '/pvzh-webapp/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
