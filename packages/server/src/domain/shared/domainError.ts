/**
 * domain 層擲錯的共同基底。
 *
 * 呼叫端只需 `error instanceof DomainError` 一個判斷，再讀 `code` 分流；
 * 各 domain 以泛型參數收窄自己的代碼值域，錯拼的代碼由編譯器擋下。
 */
export class DomainError<Code extends string = string> extends Error {
  constructor(
    readonly code: Code,
    message: string,
  ) {
    super(message);
    // 子類別不必各自覆寫，name 恆為實際被 new 的類別名。
    this.name = new.target.name;
  }
}
