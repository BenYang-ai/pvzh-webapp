import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
// base: 生产构建走 GitHub Pages 子路径 /pvzh-webapp/;本地 dev 保持 /(方便 iPad 局域网直连)。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pvzh-webapp/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
