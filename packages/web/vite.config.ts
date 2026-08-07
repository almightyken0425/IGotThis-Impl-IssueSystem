import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 桌面瀏覽器單頁應用。
// dev 期由 vite 起獨立 server、API 呼叫 proxy 到單體伺服器；
// 正式期只出 dist 靜態產物，由單體伺服器託管、不獨立部署。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8767,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8768',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
