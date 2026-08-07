-- IGotThis 工單系統初始 schema。
-- 對齊 spec no1_data_models 的實體：container、relation、field、permission、calendar、view、issue。
-- deployment model 為部署端本地狀態、不帶租戶鍵，不建表。
--
-- 命名：實體 PascalCase 對映為 snake_case 表名，欄位 camelCase 對映為 snake_case 欄名，repository 負責兩側轉換。
-- 租戶鍵：全表帶 company_id、非空、加索引，租戶邊界即 Company。
-- 時間戳：Unix ms，以 bigint 儲存。
-- 交易：本檔不寫 BEGIN/COMMIT，由 migrate runner 逐檔包一層交易。

-- ============================================================
-- 容器骨架 (no1_container_model)
-- ============================================================

CREATE TABLE companies (
  id   uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE teams (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  name       text NOT NULL
);
CREATE INDEX idx_teams_company ON teams (company_id);

CREATE TABLE products (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  team_id    uuid NOT NULL REFERENCES teams (id),
  name       text NOT NULL
);
CREATE INDEX idx_products_company ON products (company_id);
CREATE INDEX idx_products_team ON products (team_id);

-- mgmts 與 issue_sets 互相參照：container_issue_set_id -> issue_sets、mgmt_id -> mgmts。
-- 先建 mgmts（環狀 FK 延後補），再建 issue_sets，最後以 deferrable 約束閉環。
CREATE TABLE mgmts (
  id                     uuid PRIMARY KEY,
  company_id             uuid NOT NULL REFERENCES companies (id),
  product_id             uuid NOT NULL REFERENCES products (id),
  name                   text NOT NULL,
  container_issue_set_id uuid NOT NULL
);
CREATE INDEX idx_mgmts_company ON mgmts (company_id);
CREATE INDEX idx_mgmts_product ON mgmts (product_id);

CREATE TABLE issue_sets (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  mgmt_id    uuid NOT NULL REFERENCES mgmts (id),
  name       text NOT NULL,
  key        text NOT NULL,
  next_seq   integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_issue_sets_company_key UNIQUE (company_id, key)
);
CREATE INDEX idx_issue_sets_company ON issue_sets (company_id);
CREATE INDEX idx_issue_sets_mgmt ON issue_sets (mgmt_id);

-- 主題單位置現任工單集；deferrable 讓同一交易內先插 mgmt 再插 issue_set。
ALTER TABLE mgmts
  ADD CONSTRAINT fk_mgmts_container_issue_set
  FOREIGN KEY (container_issue_set_id) REFERENCES issue_sets (id)
  DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- 權限 (no4_permission_model)
-- ============================================================

CREATE TABLE accounts (
  id                    uuid PRIMARY KEY,
  company_id            uuid NOT NULL REFERENCES companies (id),
  name                  text NOT NULL,
  default_calendar_name text,   -- 以名稱軟參照同 Company 的日曆定義，不宣告 FK
  tags                  jsonb,
  created_on            bigint NOT NULL,
  updated_on            bigint NOT NULL
);
CREATE INDEX idx_accounts_company ON accounts (company_id);

CREATE TABLE level_definitions (
  id              uuid PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES companies (id),
  name            text NOT NULL,
  system          boolean NOT NULL,
  can_read        boolean NOT NULL,
  can_comment     boolean NOT NULL,
  can_create      boolean NOT NULL,
  can_edit_own    boolean NOT NULL,
  can_edit_any    boolean NOT NULL,
  can_archive     boolean NOT NULL,
  can_structure   boolean NOT NULL,
  can_assign_role boolean NOT NULL,
  created_on      bigint NOT NULL,
  updated_on      bigint NOT NULL
);
CREATE INDEX idx_level_definitions_company ON level_definitions (company_id);

CREATE TABLE roles (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  role_title text NOT NULL,
  level_id   uuid NOT NULL REFERENCES level_definitions (id),
  type_admin boolean NOT NULL,
  org_admin  boolean NOT NULL,
  perm_admin boolean NOT NULL,
  tags       jsonb,
  created_on bigint NOT NULL,
  updated_on bigint NOT NULL
);
CREATE INDEX idx_roles_company ON roles (company_id);

CREATE TABLE account_roles (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  account_id uuid NOT NULL REFERENCES accounts (id),
  role_id    uuid NOT NULL REFERENCES roles (id),
  created_on bigint NOT NULL,
  updated_on bigint NOT NULL
);
CREATE INDEX idx_account_roles_company ON account_roles (company_id);
CREATE INDEX idx_account_roles_account ON account_roles (account_id);
CREATE INDEX idx_account_roles_role ON account_roles (role_id);

CREATE TABLE role_scopes (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  role_id    uuid NOT NULL REFERENCES roles (id),
  scope_kind text NOT NULL,          -- company / team / product / mgmt
  scope_id   uuid NOT NULL,          -- 多型指向，不宣告單一 FK
  created_on bigint NOT NULL,
  updated_on bigint NOT NULL
);
CREATE INDEX idx_role_scopes_company ON role_scopes (company_id);
CREATE INDEX idx_role_scopes_role ON role_scopes (role_id);

CREATE TABLE tag_groups (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  name       text NOT NULL,
  target     text NOT NULL,          -- account / role
  system     boolean NOT NULL,
  created_on bigint NOT NULL,
  updated_on bigint NOT NULL
);
CREATE INDEX idx_tag_groups_company ON tag_groups (company_id);

CREATE TABLE tag_values (
  id           uuid PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES companies (id),
  tag_group_id uuid NOT NULL REFERENCES tag_groups (id),
  value        text NOT NULL,
  created_on   bigint NOT NULL,
  updated_on   bigint NOT NULL
);
CREATE INDEX idx_tag_values_company ON tag_values (company_id);
CREATE INDEX idx_tag_values_group ON tag_values (tag_group_id);

CREATE TABLE rate_histories (
  id           uuid PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES companies (id),
  tag_value_id uuid NOT NULL REFERENCES tag_values (id),
  effective_on bigint NOT NULL,
  hourly_rate  numeric(14, 4) NOT NULL,
  created_on   bigint NOT NULL,
  updated_on   bigint NOT NULL
);
CREATE INDEX idx_rate_histories_company ON rate_histories (company_id);
CREATE INDEX idx_rate_histories_tag_value ON rate_histories (tag_value_id);
CREATE INDEX idx_rate_histories_effective ON rate_histories (effective_on);

-- ============================================================
-- 工作日曆 (no5_calendar_model)
-- ============================================================

CREATE TABLE calendar_definitions (
  company_id  uuid NOT NULL REFERENCES companies (id),
  name        text NOT NULL,
  weekly_off  jsonb NOT NULL,        -- 每週固定休息的星期代碼清單
  CONSTRAINT pk_calendar_definitions PRIMARY KEY (company_id, name)
);
CREATE INDEX idx_calendar_definitions_company ON calendar_definitions (company_id);

CREATE TABLE calendar_exceptions (
  company_id    uuid NOT NULL REFERENCES companies (id),
  calendar_name text NOT NULL,
  date          date NOT NULL,       -- 例外生效日，不含時間部分
  is_working    boolean NOT NULL,    -- 真：補班日；假：國定假日
  CONSTRAINT pk_calendar_exceptions PRIMARY KEY (company_id, calendar_name, date),
  CONSTRAINT fk_calendar_exceptions_calendar
    FOREIGN KEY (company_id, calendar_name) REFERENCES calendar_definitions (company_id, name)
);
CREATE INDEX idx_calendar_exceptions_company ON calendar_exceptions (company_id);
CREATE INDEX idx_calendar_exceptions_calendar ON calendar_exceptions (company_id, calendar_name);

-- ============================================================
-- 欄位系統 (no3_field_model)
-- ============================================================

CREATE TABLE field_set_defs (
  company_id uuid NOT NULL REFERENCES companies (id),
  name       text NOT NULL,
  system     boolean NOT NULL,
  CONSTRAINT pk_field_set_defs PRIMARY KEY (company_id, name)
);
CREATE INDEX idx_field_set_defs_company ON field_set_defs (company_id);

CREATE TABLE field_defs (
  company_id     uuid NOT NULL REFERENCES companies (id),
  name           text NOT NULL,
  field_set_name text NOT NULL,
  kind           text NOT NULL,      -- single / multi / relation
  value_type     text NOT NULL,      -- 值型別原語
  system         boolean NOT NULL,
  readonly       boolean NOT NULL,
  rollupable     boolean NOT NULL,
  rollup_fn      text,               -- earliest / latest / sum；不可彙總恆為 NULL
  tracked        boolean NOT NULL,
  label          text NOT NULL,
  CONSTRAINT pk_field_defs PRIMARY KEY (company_id, name),
  CONSTRAINT fk_field_defs_field_set
    FOREIGN KEY (company_id, field_set_name) REFERENCES field_set_defs (company_id, name)
);
CREATE INDEX idx_field_defs_company ON field_defs (company_id);
CREATE INDEX idx_field_defs_field_set ON field_defs (company_id, field_set_name);

-- ============================================================
-- 工單型別與流程 (no7_issue_model)
-- ============================================================

CREATE TABLE issue_type_definitions (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  name       text NOT NULL,
  label      text NOT NULL,
  field_sets jsonb NOT NULL,         -- 欄位組配方清單
  system     boolean NOT NULL,
  CONSTRAINT uq_issue_type_definitions_company_name UNIQUE (company_id, name)
);
CREATE INDEX idx_issue_type_definitions_company ON issue_type_definitions (company_id);

CREATE TABLE workflow_states (
  company_id    uuid NOT NULL REFERENCES companies (id),
  issue_type_id uuid NOT NULL REFERENCES issue_type_definitions (id),
  name          text NOT NULL,
  sort_order    integer NOT NULL,
  is_initial    boolean NOT NULL,
  is_terminal   boolean NOT NULL,
  CONSTRAINT pk_workflow_states PRIMARY KEY (company_id, issue_type_id, name)
);
CREATE INDEX idx_workflow_states_company ON workflow_states (company_id);
CREATE INDEX idx_workflow_states_issue_type ON workflow_states (company_id, issue_type_id);

CREATE TABLE workflow_transitions (
  company_id      uuid NOT NULL REFERENCES companies (id),
  issue_type_id   uuid NOT NULL REFERENCES issue_type_definitions (id),
  from_state      text NOT NULL,
  to_state        text NOT NULL,
  required_role   text,              -- NULL 代表不限角色
  required_fields jsonb NOT NULL,    -- 必填欄位名稱清單，空清單代表無必填
  CONSTRAINT pk_workflow_transitions PRIMARY KEY (company_id, issue_type_id, from_state, to_state),
  CONSTRAINT fk_workflow_transitions_from
    FOREIGN KEY (company_id, issue_type_id, from_state)
    REFERENCES workflow_states (company_id, issue_type_id, name),
  CONSTRAINT fk_workflow_transitions_to
    FOREIGN KEY (company_id, issue_type_id, to_state)
    REFERENCES workflow_states (company_id, issue_type_id, name)
);
CREATE INDEX idx_workflow_transitions_company ON workflow_transitions (company_id);
CREATE INDEX idx_workflow_transitions_issue_type ON workflow_transitions (company_id, issue_type_id);

CREATE TABLE resolution_options (
  company_id    uuid NOT NULL REFERENCES companies (id),
  issue_type_id uuid NOT NULL REFERENCES issue_type_definitions (id),
  value         text NOT NULL,
  system        boolean NOT NULL,
  CONSTRAINT pk_resolution_options PRIMARY KEY (company_id, issue_type_id, value)
);
CREATE INDEX idx_resolution_options_company ON resolution_options (company_id);
CREATE INDEX idx_resolution_options_issue_type ON resolution_options (company_id, issue_type_id);

-- ============================================================
-- 關聯型別 (no2_relation_model) — 型別定義先於工單引用
-- ============================================================

CREATE TABLE relation_type_definitions (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  name       text NOT NULL,
  exclusive  boolean NOT NULL,
  acyclic    boolean NOT NULL,
  ordered    boolean NOT NULL,
  "symmetric" boolean NOT NULL,   -- symmetric 為 SQL 保留字，識別碼須加引號；repository 引用時同樣加引號
  rollup     boolean NOT NULL,
  system     boolean NOT NULL,
  created_on bigint NOT NULL,
  updated_on bigint NOT NULL,
  CONSTRAINT uq_relation_type_definitions_company_name UNIQUE (company_id, name)
);
CREATE INDEX idx_relation_type_definitions_company ON relation_type_definitions (company_id);

-- ============================================================
-- 工單 (no7_issue_model)
-- ============================================================

CREATE TABLE issues (
  id            uuid PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES companies (id),
  issue_set_id  uuid NOT NULL REFERENCES issue_sets (id),
  issue_type_id uuid NOT NULL REFERENCES issue_type_definitions (id),
  issue_key     text NOT NULL,       -- 產生後永不改，移動保留原號
  CONSTRAINT uq_issues_company_key UNIQUE (company_id, issue_key)
);
CREATE INDEX idx_issues_company ON issues (company_id);
CREATE INDEX idx_issues_issue_set ON issues (issue_set_id);

-- ============================================================
-- 工單關聯 (no2_relation_model)
-- ============================================================

CREATE TABLE issue_relations (
  id               uuid PRIMARY KEY,
  company_id       uuid NOT NULL REFERENCES companies (id),
  from_issue_id    uuid NOT NULL REFERENCES issues (id),   -- 持有端；關聯只存這一側
  to_issue_id      uuid NOT NULL REFERENCES issues (id),   -- 被指端
  relation_type_id uuid NOT NULL REFERENCES relation_type_definitions (id),
  ordinal          integer NOT NULL DEFAULT 0,
  exclusive        boolean NOT NULL,   -- 獨佔複製欄；值恆同型別定義，讓被指端唯一約束靜態成立
  created_on       bigint NOT NULL,
  updated_on       bigint NOT NULL,
  -- 同一持有端、被指端、型別的組合只存一列
  CONSTRAINT uq_issue_relations_edge UNIQUE (company_id, from_issue_id, to_issue_id, relation_type_id)
);
CREATE INDEX idx_issue_relations_company ON issue_relations (company_id);
-- 正查：持有端 + 型別 + 序位
CREATE INDEX idx_issue_relations_forward ON issue_relations (from_issue_id, relation_type_id, ordinal);
-- 反查：被指端 + 型別
CREATE INDEX idx_issue_relations_reverse ON issue_relations (to_issue_id, relation_type_id);
-- 獨佔：複製欄為真時，被指端 + 型別的組合唯一（部分唯一索引）
CREATE UNIQUE INDEX uq_issue_relations_exclusive
  ON issue_relations (company_id, to_issue_id, relation_type_id)
  WHERE exclusive;

-- ============================================================
-- 工單欄位值 (no3_field_model)
-- ============================================================

CREATE TABLE issue_field_values (
  company_id  uuid NOT NULL REFERENCES companies (id),
  issue_id    uuid NOT NULL REFERENCES issues (id),
  field_name  text NOT NULL,
  value       jsonb NOT NULL,        -- 單一值；無值的欄位不存列
  rollup_mode text,                  -- auto / manual，僅可彙總欄位使用
  CONSTRAINT pk_issue_field_values PRIMARY KEY (issue_id, field_name),
  CONSTRAINT fk_issue_field_values_field
    FOREIGN KEY (company_id, field_name) REFERENCES field_defs (company_id, name)
);
CREATE INDEX idx_issue_field_values_company ON issue_field_values (company_id);

CREATE TABLE issue_field_records (
  id         uuid PRIMARY KEY,       -- 單筆可獨立定位
  company_id uuid NOT NULL REFERENCES companies (id),
  issue_id   uuid NOT NULL REFERENCES issues (id),
  field_name text NOT NULL,
  value      jsonb NOT NULL,         -- 單筆記錄內容
  author_id  uuid NOT NULL REFERENCES accounts (id),
  created_on bigint NOT NULL,
  CONSTRAINT fk_issue_field_records_field
    FOREIGN KEY (company_id, field_name) REFERENCES field_defs (company_id, name)
);
CREATE INDEX idx_issue_field_records_company ON issue_field_records (company_id);
CREATE INDEX idx_issue_field_records_issue ON issue_field_records (issue_id);

-- ============================================================
-- 檢視層 (no6_view_model)
-- ============================================================

CREATE TABLE views (
  id              uuid PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES companies (id),
  name            text NOT NULL,
  owner_id        uuid NOT NULL REFERENCES accounts (id),
  view_type       text NOT NULL,
  source_mgmt_ids jsonb NOT NULL,    -- 展開後的來源 Mgmt 識別清單
  filter_config   jsonb,
  display_level   integer NOT NULL,
  column_config   jsonb,
  calendar_name   text               -- 以名稱軟參照日曆定義；NULL 跟隨帳號預設
);
CREATE INDEX idx_views_company ON views (company_id);
CREATE INDEX idx_views_owner ON views (owner_id);

CREATE TABLE view_sort_entries (
  id         uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  view_id    uuid NOT NULL REFERENCES views (id),
  issue_id   uuid NOT NULL REFERENCES issues (id),
  sort_value double precision NOT NULL,
  -- 同檢視內每工單至多一筆
  CONSTRAINT uq_view_sort_entries_view_issue UNIQUE (view_id, issue_id)
);
CREATE INDEX idx_view_sort_entries_company ON view_sort_entries (company_id);
CREATE INDEX idx_view_sort_entries_view ON view_sort_entries (view_id);
CREATE INDEX idx_view_sort_entries_issue ON view_sort_entries (issue_id);

-- 檢視分享 (no4_permission_model) — 需 views 先存在
CREATE TABLE view_shares (
  id          uuid PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES companies (id),
  view_id     uuid NOT NULL REFERENCES views (id),
  target_kind text NOT NULL,         -- account / team / company
  target_id   uuid NOT NULL,         -- 多型指向，不宣告單一 FK
  share_level text NOT NULL,         -- readonly / editable / owner
  created_on  bigint NOT NULL,
  updated_on  bigint NOT NULL
);
CREATE INDEX idx_view_shares_company ON view_shares (company_id);
CREATE INDEX idx_view_shares_view ON view_shares (view_id);
