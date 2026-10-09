import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  // 部署子路径 /workbench/，产物资源引用 /workbench/assets/*
  base: '/workbench/',
  plugins: [uni()],
  server: {
    host: '0.0.0.0',
    port: 5177,
    strictPort: true,
    proxy: {
      // 本地联调：admin-api 代理到 dev-fixture（Task 9 起，端口 3930）；
      // 可用 VITE_API_TARGET 覆盖（如指向 dev-server 3050）
      '/admin-api': { target: process.env.VITE_API_TARGET || 'http://localhost:3930', changeOrigin: true },
    },
  },
  css: {
    preprocessorOptions: { scss: { additionalData: '@import "@/uni.scss";' } }
  }
})
