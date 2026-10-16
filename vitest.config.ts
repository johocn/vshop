/**
 * vitest 独立配置：不合并项目 vite.config.ts（uni-app 插件依赖 uni 环境，node 单测用不到）。
 * 运行：pnpm test（= vitest run --config vitest.config.ts）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/pkg-diy/**/*.test.ts', 'src/utils/**/*.test.ts', 'src/templates/**/*.test.ts'],
        // html.test.ts 基于 node:test（node --test 运行），vitest 无法收集其用例
        exclude: ['**/node_modules/**', '**/dist/**', 'src/utils/html.test.ts'],
        environment: 'node',
    },
});
