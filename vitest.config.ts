import { defineConfig } from 'vitest/config';

// 全 workspace 共用單一 vitest 設定。
// domain 層為純函式、跑 node 環境即可；web 之後要跑 DOM 測試時再拆 projects。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    // DB 整合測試共用單一 igotthis_test 庫，schema.test 於 beforeAll DROP SCHEMA 重建。
    // 檔案層平行執行會讓該 DDL 與其他檔的讀寫互撞，故關閉檔案平行、逐檔序列跑。
    // 純函式的 domain 測試不受影響，代價僅是總時間略增。
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['packages/server/src/domain/**'],
    },
  },
});
