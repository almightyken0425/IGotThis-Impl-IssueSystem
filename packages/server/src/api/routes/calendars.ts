import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from 'fastify';
import type { Pool } from 'pg';

import { currentIdentity } from '../../auth/middleware.js';
import { calendarRepo, permissionRepo } from '../../db/repositories/index.js';
import type { WeekdayCode } from '../../domain/index.js';
import { hasCompanySwitch } from '../../permission/index.js';
import { sendError } from '../errors.js';

// 日曆路由：/api/calendars 之下的日曆定義與例外讀寫。
//
// 本層只做協定轉換：schema 驗輸入、帶租戶鍵呼叫 calendarRepo。
// 寫入授權：日曆定義屬公司層型別維護開關 typeAdmin（spec no4：typeAdmin 管日曆定義）。
// 讀取一律需登入、帶租戶範圍。

export interface CalendarRoutesOptions {
  readonly pool: Pool;
  readonly requireAuth: preHandlerHookHandler;
}

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

// ---- 輸入 schema ----

const weeklyOffSchema = {
  type: 'array',
  items: { type: 'string', enum: WEEKDAY_CODES as unknown as string[] },
  uniqueItems: true,
} as const;

const createBodySchema = {
  type: 'object',
  required: ['name', 'weeklyOff'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    weeklyOff: weeklyOffSchema,
  },
} as const;

const weeklyOffBodySchema = {
  type: 'object',
  required: ['weeklyOff'],
  additionalProperties: false,
  properties: {
    weeklyOff: weeklyOffSchema,
  },
} as const;

const exceptionBodySchema = {
  type: 'object',
  required: ['isWorking'],
  additionalProperties: false,
  properties: {
    isWorking: { type: 'boolean' },
  },
} as const;

const nameParamSchema = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 100 } },
} as const;

const exceptionParamSchema = {
  type: 'object',
  required: ['name', 'date'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    date: { type: 'string', pattern: ISO_DATE_PATTERN },
  },
} as const;

export const calendarRoutes: FastifyPluginAsync<CalendarRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { pool, requireAuth } = opts;

  app.addHook('preHandler', requireAuth);

  /** 要求操作者持有型別維護開關，否則回 403。 */
  async function requireTypeAdmin(
    reply: FastifyReply,
    companyId: string,
    accountId: string,
    message: string,
  ): Promise<boolean> {
    const bundles = await permissionRepo.getEffectivePermissionInputs(pool, companyId, accountId);
    if (!hasCompanySwitch(bundles, 'typeAdmin')) {
      void sendError(reply, 403, 'FORBIDDEN', message);
      return false;
    }
    return true;
  }

  // ---- 讀取 ----

  app.get('/', async (request, reply) => {
    const { companyId } = currentIdentity(request);
    const calendars = await calendarRepo.listCalendars(pool, companyId);
    return reply.status(200).send({ calendars });
  });

  app.get<{ Params: { name: string } }>(
    '/:name',
    { schema: { params: nameParamSchema } },
    async (request, reply) => {
      const { companyId } = currentIdentity(request);
      const calendar = await calendarRepo.getCalendar(pool, companyId, request.params.name);
      if (calendar === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', '日曆不存在');
      }
      return reply.status(200).send({ calendar });
    },
  );

  // ---- 寫入定義 ----

  app.post<{ Body: { name: string; weeklyOff: WeekdayCode[] } }>(
    '/',
    { schema: { body: createBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireTypeAdmin(reply, companyId, accountId, '需型別維護才能新增日曆'))) {
        return reply;
      }
      const { name, weeklyOff } = request.body;
      const existing = await calendarRepo.getCalendar(pool, companyId, name);
      if (existing !== undefined) {
        return sendError(reply, 409, 'CALENDAR_EXISTS', '同名日曆已存在');
      }
      await calendarRepo.insertCalendarDefinition(pool, { companyId, name, weeklyOff });
      return reply.status(201).send({ calendar: { companyId, name, weeklyOff, exceptions: [] } });
    },
  );

  app.put<{ Params: { name: string }; Body: { weeklyOff: WeekdayCode[] } }>(
    '/:name/weekly-off',
    { schema: { params: nameParamSchema, body: weeklyOffBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireTypeAdmin(reply, companyId, accountId, '需型別維護才能改日曆週規則'))) {
        return reply;
      }
      const { name } = request.params;
      const existing = await calendarRepo.getCalendar(pool, companyId, name);
      if (existing === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', '日曆不存在');
      }
      await calendarRepo.updateCalendarWeeklyOff(pool, companyId, name, request.body.weeklyOff);
      const calendar = await calendarRepo.getCalendar(pool, companyId, name);
      return reply.status(200).send({ calendar });
    },
  );

  // ---- 寫入例外 ----

  app.put<{ Params: { name: string; date: string }; Body: { isWorking: boolean } }>(
    '/:name/exceptions/:date',
    { schema: { params: exceptionParamSchema, body: exceptionBodySchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireTypeAdmin(reply, companyId, accountId, '需型別維護才能改日曆例外'))) {
        return reply;
      }
      const { name, date } = request.params;
      const existing = await calendarRepo.getCalendar(pool, companyId, name);
      if (existing === undefined) {
        return sendError(reply, 404, 'NOT_FOUND', '日曆不存在');
      }
      await calendarRepo.upsertCalendarException(pool, companyId, name, {
        date,
        isWorking: request.body.isWorking,
      });
      return reply.status(200).send({ exception: { date, isWorking: request.body.isWorking } });
    },
  );

  app.delete<{ Params: { name: string; date: string } }>(
    '/:name/exceptions/:date',
    { schema: { params: exceptionParamSchema } },
    async (request, reply) => {
      const { companyId, accountId } = currentIdentity(request);
      if (!(await requireTypeAdmin(reply, companyId, accountId, '需型別維護才能刪日曆例外'))) {
        return reply;
      }
      const { name, date } = request.params;
      await calendarRepo.deleteCalendarException(pool, companyId, name, date);
      return reply.status(200).send({ ok: true });
    },
  );
};
