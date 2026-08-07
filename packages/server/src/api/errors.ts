import type { FastifyReply } from 'fastify';

import type { ValidationFailure } from '../domain/index.js';

// API 層統一錯誤回應格式。
//
// 所有 4xx 錯誤回應同一形狀 { error: { code, message } }：
// - code 為機器可判讀的字串，前端據此分流、不靠比對訊息文字
// - message 為人類可讀說明，可直接顯示
//
// domain 的 ValidationResult 失敗碼在此對應到 HTTP 狀態：
// 目前寫入路徑的完整性檢查（如 validateRelationCreation）皆屬「請求不合法」，
// 一律對應 422（語意正確但違反業務規則）；純輸入格式錯誤走 Fastify schema 的 400。

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** 組出統一錯誤 body。 */
export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

/** 直接送出一則錯誤回應。 */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(status).send(errorBody(code, message));
}

/**
 * 把 domain 的 ValidationResult 失敗轉成 422 錯誤回應。
 * 失敗碼原樣帶出供前端分流，理由取自 domain 的人類可讀說明。
 */
export function sendValidationFailure(
  reply: FastifyReply,
  failure: ValidationFailure<string>,
): FastifyReply {
  return sendError(reply, 422, failure.code, failure.reason);
}

// PostgreSQL 錯誤碼辨識。
//
// 寫入競態下，check-then-write 之間可能被搶插，或引用的外鍵列剛好不存在；
// 這些以 driver 拋出的 SQLSTATE 呈現，路由據此收斂為對應的 HTTP 語意。
// 以鴨子型別判 code 欄位，不 import pg，維持 API 層對 driver 的解耦。

/** PostgreSQL 唯一約束違反。 */
const PG_UNIQUE_VIOLATION = '23505';
/** PostgreSQL 外鍵約束違反。 */
const PG_FOREIGN_KEY_VIOLATION = '23503';

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** 是否為唯一約束違反（如工單集 KEY 撞號）。 */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_UNIQUE_VIOLATION;
}

/** 是否為外鍵約束違反（如寫入未定義欄位的欄位值）。 */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION;
}
