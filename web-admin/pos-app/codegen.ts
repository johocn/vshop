import type { CodegenConfig } from '@graphql-codegen/cli';

// codegen 不在 build 流程中执行；schema 通过 ADMIN_API_URL 注入（默认指向开发后端），避免硬编码。
export default {
  schema: process.env.ADMIN_API_URL || 'http://localhost:3000/admin-api',
  documents: ['src/api/operations/**/*.graphql'],
  generates: { 'src/api/types.ts': { preset: 'client' } },
} satisfies CodegenConfig;