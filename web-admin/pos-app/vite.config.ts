import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 生产部署到同域 /guanli/pos/，与路由 history base 保持一致
  base: '/guanli/pos/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: {
      // dev 代理仅本地开发用，target 通过 VITE_API_URL 指定，避免硬编码并避免依赖本地后端
      '/admin-api': { target: process.env.VITE_API_URL || 'http://localhost:3000', changeOrigin: true },
      // 商品图片资源代理（featuredAsset.preview 返回 /assets/... 相对路径）
      '/assets': { target: process.env.VITE_API_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
});