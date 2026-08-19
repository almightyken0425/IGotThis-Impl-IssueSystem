# IGotThis 工單系統實作

- 多產品開發團隊的 web 工單系統，定位先自用後商品化
- 本 repo 為 Module Impl git，module_id 為 `no1_issue_system`
- 已完成地基層與多數引擎層，應用層局部完成
- changelog_engine 與 workflow_engine 只有儲存與定義層，執行邏輯待補
- 行為規格的仲裁端為對側 Module Spec git，視覺標準的仲裁端為對側 Module Design git

---

## 起步

- 環境需求
    - Node 22 以上
    - npm 10 以上
    - PostgreSQL 17，本機安裝或容器擇一
- 安裝依賴，在 repo 根目錄執行一次即涵蓋兩個 workspace

    ```bash
    npm ci
    ```

- 準備環境變數，複製範本後填入實際值

    ```bash
    cp .env.example .env
    ```

    - `TEST_DATABASE_URL` 缺漏時整合測試靜默略過，不報錯，接手時最易漏
- 備妥資料庫，開發庫與測試庫各一，兩者不共用
    - 走本機安裝時自行建立角色與兩個資料庫，密碼須與 `.env` 一致

        ```bash
        psql -d postgres -c "CREATE ROLE igotthis LOGIN PASSWORD 'change_me_local_only' CREATEDB"
        createdb --owner igotthis igotthis_dev
        createdb --owner igotthis igotthis_test
        ```

    - 走容器時 compose 只建開發庫，測試庫另行補建

        ```bash
        docker compose up -d db
        docker compose exec db createdb --username igotthis igotthis_test
        ```

- 套用 migration，開發庫與測試庫各跑一次

    ```bash
    npm run migrate --workspace @igotthis/server
    npm run migrate:test --workspace @igotthis/server
    ```

    - 前向式執行，已套過的自動略過，可安全重跑
- 啟動開發伺服器，前端與後端同時起

    ```bash
    npm run dev
    ```

    - 前端 vite dev server 落 `8767`
    - 後端單體伺服器落 `8768`
    - 前端對 `/api` 的請求由 vite proxy 轉給後端
- 跑測試與靜態檢查

    ```bash
    npm test
    npm run typecheck
    npm run lint
    ```

---

## 技術棧決策摘要

- 執行環境走 Node 加 TypeScript
    - 前後端同語言，型別可跨層共用，減少介面漂移
- 型別嚴格度全開
    - `strict` 之外另開 `noUncheckedIndexedAccess` 與 `exactOptionalPropertyTypes`
    - 索引存取與選擇性屬性是工單系統動態欄位的高風險區，交給編譯器擋
- 資料庫走 PostgreSQL 17
    - 工單關聯為有向圖，無環判定與遞迴彙總需要 recursive CTE
    - 動態欄位值走 `jsonb`，交易保證由資料庫承擔
- 部署形態走單體伺服器
    - 前端建置產物由後端靜態託管，只有單一部署單元
    - 自用階段的規模不需要拆服務，拆分成本大於收益
- HTTP 層走 Fastify
    - TypeScript 型別支援原生，schema 驗證與序列化內建
    - 靜態託管以官方外掛掛載，無需另引 web server
- 前端走 React 加 Vite
    - 對側 Design git 的設計工件即 React 元件，可逐名對應搬入、不需跨框架翻譯
    - Vite 只出 `dist` 靜態產物，與單體部署形態相容
- 測試框架走 vitest
    - 與 Vite 共用 transform 管線，TypeScript 免額外編譯步驟
    - 啟動快、watch 迴圈短，撐得住全面 TDD 的紅綠節奏
- 認證走自帶帳密
    - 自用階段不引外部身分提供者，密碼只存雜湊
    - session 密鑰由環境變數注入

---

## 目錄導覽

```
.
├── package.json              npm workspaces 根，統管 script 與共用開發依賴
├── tsconfig.base.json        嚴格模式基準，兩個 workspace 各自 extends
├── tsconfig.json             根層設定檔本身的 typecheck 範圍
├── vitest.config.ts          全 workspace 共用測試設定
├── eslint.config.js          flat config，typescript-eslint 推薦組
├── docker-compose.yml        PostgreSQL 17 服務與資料 volume
├── .env.example              環境變數範本
└── packages
    ├── server                單體伺服器
    │   └── src
    │       ├── index.ts      進入點與組裝根，環境變數只在此讀取
    │       ├── api/          HTTP 邊界，路由、驗證、序列化、靜態託管
    │       ├── auth/         帳密認證，密碼雜湊與 session
    │       ├── db/           唯一碰資料庫的一層，連線池與 repository
    │       ├── permission/   有效權限計算
    │       └── domain/       core logic，純函式無 IO
    │           ├── shared/     跨 domain 共用：檢查結果、錯誤基底、日期與工作日曆
    │           ├── relation/   關聯完整性
    │           ├── rollup/     彙總計算與偏離標示
    │           ├── numbering/  工單集 KEY 與顯示編號
    │           └── view/       看板欄序與檢視排序
    └── web                   桌面瀏覽器前端
        └── src
            ├── main.tsx      掛載根
            ├── App.tsx       路由掛載
            ├── api/          後端 API 呼叫封裝
            ├── app/          應用外殼與路由定義
            ├── auth/         登入狀態與路由守衛
            ├── components/   共用元件庫
            ├── hooks/        共用 hook
            ├── screens/      各畫面
            └── theme/        design token，對齊 Pine Paper 標準
```

- 依賴方向單向由外向內
    - `api` 依賴 `domain` 與 `db`
    - `domain` 不依賴任何同層以外的模組
- `domain` 的硬性約束
    - 純函式，不碰資料庫、檔案系統、網路、時鐘、亂數
    - 當下時間與識別碼由呼叫端注入
    - 測試檔與被測檔同目錄，測試先行
- `domain` 層內的方向
    - 各 domain 依賴 `shared`，`shared` 不反向依賴任何 domain
    - domain 之間只取型別投影，不互相呼叫行為
    - 真的被兩個以上 domain 用到才進 `shared`，共用層不當雜物間
- 失敗的兩種表達
    - 預期內的檢查不通過回傳 `ValidationResult`，帶 `code` 與 `reason`
    - 呼叫端違反前置條件才擲錯，一律為 `DomainError` 子類、帶 `code`

---

## npm script

- `npm run dev` — 同時起前端與後端開發伺服器
- `npm run dev:server` — 只起後端，watch 模式
- `npm run dev:web` — 只起前端 vite dev server
- `npm run build` — 先建前端、再編譯後端，順序不可調換
- `npm run typecheck` — 根層設定檔與兩個 workspace 全掃
- `npm run lint` — eslint 全 repo
- `npm test` — vitest 單次執行
- `npm run test:watch` — vitest watch 模式
- `npm start --workspace @igotthis/server` — 以建置產物啟動後端

---

## 待接事項

- **changelog_engine：**
    - repository 層已有寫入與讀取
    - 未掛進工單欄位寫入路徑，異動不會自動記錄
    - 對外 API 待補
    - 時點重建邏輯待寫
- **workflow_engine：**
    - 狀態、轉換、結案原因的定義層 CRUD 已完成
    - 已接進建立型別的最小流程初始化
    - 執行一次狀態轉換的邏輯待寫
    - 轉換時的必填檢查待寫
- **view_layer：**
    - 日曆選用套用待接
    - 工期天數呈現待接
    - 新單自動入表待接
    - 篩選待接
    - DevOrderScreen 甘特圖座標轉換待做，需求為工單起訖日期換算時間軸格子、三層級同時載入，後端完全沒有，需另開獨立主題
- **web_shell：**
    - 工單詳情頁已補（`IssueDetailScreen`）：欄位／關聯／異動歷史三區，List／Kanban／DevOrder 三處入口可導覽進入
    - 工單詳情頁的欄位編輯範圍收斂在 workspace.ts `PATCH /api/workspace/issues/:issueId` 認得的 6 個白名單欄位（title/status/resolution/assignee/point/due）；其餘 `readonly=false` 但不在白名單內的欄位先唯讀顯示，待 issues.ts 的泛用欄位寫入路徑（`PUT /issues/:issueId/fields/:fieldName`）補上 `recordFieldChange`、能正確記錄變更歷史後才開放編輯
    - 型別維護與定義區管理介面待補
    - 登入頁在 design git 尚無定案畫面，目前以既有 token 就地組值頂著
    - 主題選擇未接持久化，`initialThemeId` 與 `onThemeChange` 待接，目前每次載入固定回 light
