// useAsync · 最小資料抓取機制
//
// 不引入 react-query：畫面只需要 loading / error / data 三態與一個手動 reload。
// 本 hook 承擔這件事，跨畫面共用同一組語彙。
//
// 競態處理：每次執行帶序號，只有最後一次的結果會落地，避免快速 reload 時舊回應覆蓋新資料。

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api';

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  /** 重新抓取；回傳同一個 promise 供呼叫端在需要時 await。 */
  readonly reload: () => Promise<void>;
}

/** 把未知例外轉成可顯示訊息。ApiError 用其人類可讀 message，其餘給泛用語。 */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '發生未預期的錯誤';
}

/**
 * 執行 fetcher 並追蹤三態。deps 變動時自動重跑；reload 手動重跑。
 * fetcher 應以 useCallback 穩定，避免每次 render 都重抓。
 */
export function useAsync<T>(fetcher: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const runId = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetcher();
      if (aliveRef.current && id === runId.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err: unknown) {
      if (aliveRef.current && id === runId.current) {
        setError(toMessage(err));
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
