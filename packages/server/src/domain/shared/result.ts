/**
 * 檢查結果的共同形狀。
 *
 * 寫入前的檢查是預期內的分流、不是例外，一律回傳本型別而非擲錯；
 * 例外路徑走 `DomainError`。兩者的分界即「呼叫端該不該接住」。
 */

export interface ValidationOk {
  readonly ok: true;
}

export interface ValidationFailure<Code extends string> {
  readonly ok: false;
  /** 機器可判讀的失敗代碼，呼叫端依此分流。 */
  readonly code: Code;
  /** 人類可讀的失敗理由，取自 Spec 的回傳說明。 */
  readonly reason: string;
}

export type ValidationResult<Code extends string> = ValidationOk | ValidationFailure<Code>;

export const valid: ValidationOk = { ok: true };

export function invalid<Code extends string>(code: Code, reason: string): ValidationFailure<Code> {
  return { ok: false, code, reason };
}
