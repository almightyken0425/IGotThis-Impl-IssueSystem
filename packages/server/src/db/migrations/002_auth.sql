-- IGotThis 認證與 session schema。
-- 自帶帳密登入所需的三項延伸：帳號的登入識別、密碼雜湊、伺服器端 session。
--
-- 對齊 001 的慣例：租戶鍵 company_id、時間戳為 Unix ms 存 bigint、
-- 表名 snake_case、repository 負責 snake_case 與 camelCase 兩側轉換。
--
-- 邊界說明：
-- - accounts 既有列由權限層建立、不帶登入憑證，故 email 與 password_hash 皆可空。
--   自助註冊路徑一次寫齊兩欄；管理面建帳號可暫不設密碼。
-- - email 為登入識別，單一 Company 模式下全域唯一即可，登入不需先指定 Company。
--   以部分唯一索引僅約束非空值，既有無 email 的列不受影響。

ALTER TABLE accounts ADD COLUMN email         text;
ALTER TABLE accounts ADD COLUMN password_hash text;

-- 登入識別全域唯一；只約束有值的列。
CREATE UNIQUE INDEX uq_accounts_email ON accounts (email) WHERE email IS NOT NULL;

-- 伺服器端 session：cookie 只存不可猜的 session id，狀態全落此表。
-- id 為高熵隨機字串（非 UUID），故型別為 text。
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  company_id uuid   NOT NULL REFERENCES companies (id),
  account_id uuid   NOT NULL REFERENCES accounts (id),
  created_on bigint NOT NULL,
  expires_on bigint NOT NULL     -- 逾期即失效；過期列由讀取路徑順手清除
);
CREATE INDEX idx_sessions_account ON sessions (account_id);
CREATE INDEX idx_sessions_company ON sessions (company_id);
