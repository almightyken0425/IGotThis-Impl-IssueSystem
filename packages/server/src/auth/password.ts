import { hash, verify } from '@node-rs/argon2';

// 密碼雜湊：argon2id。
//
// 選型：@node-rs/argon2（napi-rs 預編譯，免 node-gyp 本機編譯，Windows 直裝可用），
// 演算法為 argon2id，抗 GPU 與側通道兼顧、為 OWASP 現行首選。
// 邊界：
// - 只吐雜湊字串（自帶演算法、參數、鹽的 PHC 編碼），呼叫端不需另存鹽或參數
// - 明文密碼不落任何 log、錯誤訊息、回傳值
// - 驗證失敗與雜湊格式壞掉都收斂為「不通過」，不對外區分

/** 雜湊明文密碼，回傳自帶鹽與參數的 PHC 編碼字串。 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** 驗證明文密碼是否對應雜湊；雜湊格式異常一律當不通過，不拋錯。 */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
