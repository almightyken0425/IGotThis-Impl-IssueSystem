-- 結案原因選項排序：listResolutionOptions 原本 ORDER BY value 字母序，跟宣告的
-- 預設順序（已完成、不做）常常對不上。比照 workflow_states 補 sort_order，
-- 由管理端整包替換時依陣列位置寫入。
-- 既有資料沒有天然可推導的順序來源，一律預設 0，等下次整包替換即依新順序覆寫。
ALTER TABLE resolution_options ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
