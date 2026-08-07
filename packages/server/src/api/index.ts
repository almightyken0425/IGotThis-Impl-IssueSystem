import Fastify, { type FastifyInstance } from 'fastify';

// HTTP 邊界層。
//
// 角色：路由註冊、輸入驗證、序列化、錯誤對應。
// 邊界：
// - 只做協定轉換，判斷邏輯全下沉到 domain
// - 呼叫 db 取資料、餵給 domain 純函式、把結果轉成回應
// - web 建置產物的靜態託管也掛在本層，待 web build 產出後接上
//
// 待接：認證路由、工單 CRUD 路由、view 查詢路由、靜態檔案掛載。

export function createServer(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // 骨架期唯一路由：存活探測，供部署與本機煙霧檢查使用。
  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
