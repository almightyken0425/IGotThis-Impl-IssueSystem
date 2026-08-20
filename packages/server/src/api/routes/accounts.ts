import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { permissionRepo } from '../../db/repositories/index.js';

// 帳號路由：/api/accounts 之下的登入者自我管理端點。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 permissionRepo。
// 寫入授權：預設日曆屬個人偏好，操作者只能改自己的，不設額外權限門檻
// （對比 calendars.ts 的日曆定義本身寫入需 typeAdmin：定義是公司層資料，預設日曆是個人選用）。

export interface AccountRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

const updateMeBodySchema = {
  type: 'object',
  required: ['defaultCalendarName'],
  additionalProperties: false,
  properties: {
    defaultCalendarName: { type: 'string', nullable: true },
  },
} as const;

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  app.addHook('preHandler', requireAuth);

  app.get('/me', async (request, reply) => {
    const { companyId, accountId } = currentIdentity(request);
    const account = await permissionRepo.getAccount(pool, companyId, accountId);
    return reply.status(200).send({ defaultCalendarName: account?.defaultCalendarName ?? null });
  });

  app.patch<{ Body: { defaultCalendarName: string | null } }>(
    '/me',
    { schema: { body: updateMeBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      await permissionRepo.updateAccountDefaultCalendar(
        pool,
        companyId,
        accountId,
        request.body.defaultCalendarName,
      );
      return reply.status(200).send({ defaultCalendarName: request.body.defaultCalendarName });
    },
  );
};
