import { defineConfig } from 'vitest/config';

// 全 workspace 共用單一 vitest 設定。
// domain 層為純函式、跑 node 環境即可；web 之後要跑 DOM 測試時再拆 projects。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['packages/server/src/domain/**'],
    },
  },
});
