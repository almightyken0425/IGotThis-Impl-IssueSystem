import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { resolveAuthConfig, type AuthConfig } from '../auth/config.js';
import { makeRequireAuth } from '../auth/middleware.js';
import { defaultAuthDeps, type AuthDeps } from '../auth/service.js';
import { getPool } from '../db/index.js';
import { errorBody, sendError } from './errors.js';
import { accountRoutes } from './routes/accounts.js';
import { authRoutes } from './routes/auth.js';
import { calendarRoutes } from './routes/calendars.js';
import { containerRoutes } from './routes/containers.js';
import { fieldRoutes } from './routes/fields.js';
import { issueRoutes } from './routes/issues.js';
import { permissionRoutes } from './routes/permissions.js';
import { relationRoutes } from './routes/relations.js';
import { viewRoutes } from './routes/views.js';
import { workspaceRoutes } from './routes/workspace.js';
import { registerStatic } from './static.js';

// HTTP 邊界層。
//
// 角色：路由註冊、輸入驗證、序列化、錯誤對應。
// 邊界：
// - 只做協定轉換，判斷邏輯全下沉到 domain 與 auth service
// - 呼叫 db 取資料、餵給 domain 純函式、把結果轉成回應
// - web 建置產物的靜態託管也掛在本層，待 web build 產出後接上
//
// 待接：工單 CRUD 路由、view 查詢路由、靜態檔案掛載。

export interface CreateServerOptions {
  /** 連線池；預設為 DATABASE_URL 的單例，測試注入 test 庫池。 */
  readonly pool?: Pool;
  /** 認證設定；預設自環境變數解析，測試以明值注入。 */
  readonly authConfig?: AuthConfig;
  /** 認證流程的注入點；預設為真實時鐘與亂數，測試可餵定值。 */
  readonly authDeps?: AuthDeps;
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  const pool = options.pool ?? getPool();
  const authConfig = options.authConfig ?? resolveAuthConfig(process.env);
  const authDeps = options.authDeps ?? defaultAuthDeps;

  // cookie 讀寫；secret 供 session cookie 簽章。
  void app.register(fastifyCookie, { secret: authConfig.sessionSecret });

  // 統一錯誤格式：schema 驗證失敗轉 400 INVALID_INPUT，未預期例外轉 500 且不外洩細節。
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      void sendError(reply, 400, 'INVALID_INPUT', error.message);
      return;
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      void reply.status(500).send(errorBody('INTERNAL', '伺服器內部錯誤'));
      return;
    }
    void reply.status(status).send(errorBody(error.code ?? 'ERROR', error.message));
  });

  // 骨架期唯一路由：存活探測，供部署與本機煙霧檢查使用。
  app.get('/api/health', () => ({ status: 'ok' }));

  // 認證路由，掛在 /api/auth 前綴下。
  const requireAuth = makeRequireAuth(pool, authConfig);
  void app.register(
    (instance) => authRoutes(instance, { pool, config: authConfig, deps: authDeps, requireAuth }),
    { prefix: '/api/auth' },
  );

  // 容器骨架與工單路由，掛在 /api 前綴下，全數帶認證與租戶範圍。
  void app.register((instance) => containerRoutes(instance, { pool, requireAuth }), {
    prefix: '/api',
  });
  void app.register((instance) => issueRoutes(instance, { pool, requireAuth }), { prefix: '/api' });

  // 權限與日曆路由，各掛自身前綴下，全數帶認證與租戶範圍。
  void app.register((instance) => permissionRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/permissions',
  });
  void app.register((instance) => calendarRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/calendars',
  });
  void app.register((instance) => accountRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/accounts',
  });

  // 關聯、欄位定義、檢視路由，各掛自身前綴下，全數帶認證與租戶範圍。
  void app.register((instance) => relationRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/relations',
  });
  void app.register((instance) => fieldRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/fields',
  });
  void app.register((instance) => viewRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/views',
  });

  // 前端工作區啟動與加值工單列，掛在 /api/workspace 前綴下，帶認證與租戶範圍。
  void app.register((instance) => workspaceRoutes(instance, { pool, requireAuth }), {
    prefix: '/api/workspace',
  });

  // 單體靜態託管：以 web 建置產物供前端。未 build（dist 不存在）時退回 JSON 404。
  registerStatic(app);

  return app;
}
