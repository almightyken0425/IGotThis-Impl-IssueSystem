// API 呼叫的型別安全包裝
//
// 角色：所有對後端的 fetch 收斂於此。JSON 序列化、憑證帶送、錯誤對應統一一處。
// 邊界：
// - 一律 credentials: 'include'，session cookie 隨每次請求帶送
// - 非 2xx 轉成 ApiError，帶後端的機器碼 code 與人類可讀 message
// - 401 額外派發全域事件，讓 AuthProvider 清空登入態、守衛導回登入頁
//
// 不引入 react-query：資料抓取交給畫面層的簡單 hook（useAsync），本檔只管單次呼叫。

/** 401 未認證的全域事件名。AuthProvider 監聽、清空帳號態。 */
export const UNAUTHORIZED_EVENT = 'igotthis:unauthorized';

/** 後端統一錯誤回應形狀 { error: { code, message } } 的投影。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

/** 解析錯誤回應；非 JSON 或缺欄位時退回泛用碼與狀態文字。 */
async function toApiError(res: Response): Promise<ApiError> {
  let code = 'ERROR';
  let message = res.statusText || '請求失敗';
  try {
    const body = (await res.json()) as ErrorBody;
    if (body.error?.code !== undefined) code = body.error.code;
    if (body.error?.message !== undefined) message = body.error.message;
  } catch {
    // 非 JSON 回應：維持退回值。
  }
  return new ApiError(res.status, code, message);
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
}

/**
 * 打一支 API 並解析 JSON 回應。
 *
 * 204 無內容回 undefined。非 2xx 拋 ApiError；401 先派發全域未認證事件。
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };

  const res = await fetch(path, init);

  if (res.status === 401) {
    // 登入失效：通知全域，讓守衛導回登入頁。
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw await toApiError(res);
  }

  if (!res.ok) throw await toApiError(res);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
