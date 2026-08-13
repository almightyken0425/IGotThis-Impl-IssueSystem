// ListScreen · 假資料與檢視設定
//
// 來源：design git 的 `30_screens/no1_list_screen/no1_list_screen.jsx` 內
// LIST_SCREEN_SOURCES / LIST_SCREEN_STATUS / LIST_SCREEN_ROWS /
// LIST_SCREEN_COLUMNS / LIST_SCREEN_FILTERS 五組。
//
// 接 API 時只替換本檔：畫面層只讀本檔匯出的常數與型別，不內嵌任何資料。
// 對應的伺服器端產出：
//   LIST_SOURCES              檢視的 sourceMgmtIds 選項
//   LIST_ROWS                 applyViewFilter + filterViewByPermission 的產出
//   LIST_PERMISSION_FILTERED  filterViewByPermission 濾掉的筆數
//   LIST_COLUMNS              欄位目錄與預設值，不隨檢視改變——實際顯示哪幾欄、
//                             順序、寬度由 currentView.columnConfig 決定，解析與
//                             映射見同資料夾 columnConfig.ts
//   LIST_FILTERS              檢視的 filterConfig 的視覺投影
//
// design 端的 LIST_SCREEN_VARIANTS 不搬：variant 是 canvas 並排比較用的裝置，
// app 只要 default 一組資料，狀態差異由畫面自身的互動產生。

import type { DueTone, StatusTone, TableColumn } from '../../components/data';
import { LIST_SCREEN_TOKENS } from './tokens';

// ─── 資料來源 ────────────────────────────────────────────────
// value 為檢視的 sourceMgmtIds；'all' 表示不限來源。

export type ListSourceId = 'all' | 'igt' | 'ssg';

/** 工單所屬來源。'all' 只作為篩選值，不會掛在工單上。 */
export type ListIssueSource = Exclude<ListSourceId, 'all'>;

export interface ListSourceOption {
  readonly value: ListSourceId;
  readonly label: string;
}

export const LIST_SOURCES: readonly ListSourceOption[] = [
  { value: 'all', label: '全部來源' },
  { value: 'igt', label: 'IGotThis 工單系統' },
  { value: 'ssg', label: 'SuSuGiGi 記帳 App' },
];

export const LIST_DEFAULT_SOURCE: ListSourceId = 'all';

// ─── 狀態值集合 ──────────────────────────────────────────────
// tone 決定 Badge 色彩身份，sortKey 給排序與分組一個流程順序，
// 不讓「已完成」排在「待處理」前面（字典序會）。
// 中性狀態不給 tone：Badge 的 neutral 是 tone 缺席時的預設。

export type ListStatusValue = {
  readonly label: string;
  readonly tone?: StatusTone;
  readonly sortKey: number;
};

export const LIST_STATUS = {
  todo: { label: '待處理', sortKey: 1 },
  doing: { label: '處理中', tone: 'info', sortKey: 2 },
  review: { label: '審查中', tone: 'warning', sortKey: 3 },
  blocked: { label: '已阻塞', tone: 'error', sortKey: 4 },
  done: { label: '已完成', tone: 'success', sortKey: 5 },
  archived: { label: '已封存', sortKey: 6 },
} as const satisfies Record<string, ListStatusValue>;

// ─── 到期日 ──────────────────────────────────────────────────
// label 給人看、sortKey 給排序、tone 交給日期格決定要不要轉逾期色。

export type ListDueValue = {
  readonly label: string;
  readonly sortKey: string;
  readonly tone?: DueTone;
};

function due(label: string, sortKey: string, tone?: DueTone): ListDueValue {
  return tone === undefined ? { label, sortKey } : { label, sortKey, tone };
}

// ─── 工單列 ──────────────────────────────────────────────────
// cells 以 type alias 宣告而非 interface：DataTable 的 rows 收
// Readonly<Record<string, TableCellValue>>，只有 type alias 拿得到隱含索引簽章。

export type ListIssueCells = {
  readonly key: string;
  readonly title: string;
  readonly status: ListStatusValue;
  readonly assignee: string;
  readonly point: number;
  readonly due: ListDueValue | null;
};

export interface ListIssueRow {
  readonly id: string;
  readonly source: ListIssueSource;
  readonly cells: ListIssueCells;
}

export const LIST_ROWS: readonly ListIssueRow[] = [
  {
    id: 'SSG-1042',
    source: 'ssg',
    cells: {
      key: 'SSG-1042',
      title: '匯率換算在跨月結轉時取到舊值',
      status: LIST_STATUS.doing,
      assignee: '陳彥廷',
      point: 3,
      due: due('08/07', '2026-08-07', 'soon'),
    },
  },
  {
    id: 'SSG-1041',
    source: 'ssg',
    cells: {
      key: 'SSG-1041',
      title: 'CSV 匯入的欄位對應精靈',
      status: LIST_STATUS.todo,
      assignee: '林巧薇',
      point: 5,
      due: due('08/14', '2026-08-14'),
    },
  },
  {
    id: 'IGT-1038',
    source: 'igt',
    cells: {
      key: 'IGT-1038',
      title: '工單編號產生器支援多前綴',
      status: LIST_STATUS.review,
      assignee: '王世昌',
      point: 2,
      due: due('08/03', '2026-08-03', 'overdue'),
    },
  },
  {
    id: 'IGT-1035',
    source: 'igt',
    cells: {
      key: 'IGT-1035',
      title: '看板欄拖曳後狀態未同步回工單',
      status: LIST_STATUS.doing,
      assignee: '陳彥廷',
      point: 2,
      due: due('08/11', '2026-08-11'),
    },
  },
  {
    id: 'IGT-1030',
    source: 'igt',
    cells: {
      key: 'IGT-1030',
      title: '權限矩陣改為以角色繼承',
      status: LIST_STATUS.todo,
      assignee: '黃佩瑜',
      point: 8,
      due: due('08/28', '2026-08-28'),
    },
  },
  {
    id: 'IGT-1028',
    source: 'igt',
    cells: {
      key: 'IGT-1028',
      title: '開發順序表的甘特超期標示',
      status: LIST_STATUS.done,
      assignee: '王世昌',
      point: 3,
      due: due('07/31', '2026-07-31'),
    },
  },
  {
    id: 'SSG-1024',
    source: 'ssg',
    cells: {
      key: 'SSG-1024',
      title: '工單附件上傳逾時後無重試入口',
      status: LIST_STATUS.blocked,
      assignee: '林巧薇',
      point: 1,
      due: due('08/05', '2026-08-05', 'overdue'),
    },
  },
  {
    id: 'IGT-1019',
    source: 'igt',
    cells: {
      key: 'IGT-1019',
      title: '檢視的欄位顯示設定未持久化',
      status: LIST_STATUS.review,
      assignee: '蘇玠丞',
      point: 2,
      due: due('08/12', '2026-08-12'),
    },
  },
  {
    id: 'IGT-1015',
    source: 'igt',
    cells: {
      key: 'IGT-1015',
      title: '日曆設定支援自訂假日',
      status: LIST_STATUS.todo,
      assignee: '黃佩瑜',
      point: 5,
      due: due('09/04', '2026-09-04'),
    },
  },
  {
    id: 'IGT-1009',
    source: 'igt',
    cells: {
      key: 'IGT-1009',
      title: '彙總計算在禁環檢查後重算',
      status: LIST_STATUS.done,
      assignee: '蘇玠丞',
      point: 8,
      due: due('07/24', '2026-07-24'),
    },
  },
  {
    id: 'IGT-1003',
    source: 'igt',
    cells: {
      key: 'IGT-1003',
      title: '建立工單時帶入預設負責人',
      status: LIST_STATUS.archived,
      assignee: '',
      point: 1,
      due: null,
    },
  },
];

/**
 * 被權限濾除的筆數。這些工單不會出現在 LIST_ROWS——伺服器端就不回傳，
 * 只回傳一個筆數讓畫面交代「有東西被擋掉」，不靜默消失。
 */
export const LIST_PERMISSION_FILTERED = 2;

// ─── 欄位目錄 ────────────────────────────────────────────────
// 全部可用欄位與各自的預設寬度，供 columnConfig.ts 解析檢視設定時查回
// label/type/align/sortable 等渲染 metadata；順序即「全欄顯示」時的預設順序。
//
// 已知限制：label 為寫死中文，未接 FieldDefs.label（spec 定義欄標題該顯示欄位
// 定義的 label，可被使用者客製）。前端目前無 fields API client，MVP 單 Company、
// 未有人客製過欄位標籤的情境下，寫死值與 FieldDefs 種子資料的 label 結果一致；
// 待前端出現 fields 資料流且有實際客製標籤需求時再接上動態值。

export const LIST_COLUMNS: readonly TableColumn[] = [
  { key: 'key', label: '編號', type: 'key', width: LIST_SCREEN_TOKENS.COLUMN_WIDTH.key, sortable: true },
  { key: 'title', label: '標題', type: 'text', sortable: true },
  { key: 'status', label: '狀態', type: 'status', width: LIST_SCREEN_TOKENS.COLUMN_WIDTH.status, sortable: true },
  { key: 'assignee', label: '負責人', type: 'user', width: LIST_SCREEN_TOKENS.COLUMN_WIDTH.assignee, sortable: true },
  { key: 'point', label: '點數', type: 'number', width: LIST_SCREEN_TOKENS.COLUMN_WIDTH.point, sortable: true, align: 'right' },
  { key: 'due', label: '到期日', type: 'date', width: LIST_SCREEN_TOKENS.COLUMN_WIDTH.due, sortable: true },
];

// 排序依據與分組依據皆為「任一欄位皆可選」，故選項由 columnConfig 推導，
// 不另維護一份清單；分組另多一條「不分組」。

export const LIST_SORT_OPTIONS = LIST_COLUMNS.map((c) => ({ value: c.key, label: c.label }));

export const LIST_GROUP_NONE = 'none';

export const LIST_GROUP_OPTIONS = [{ value: LIST_GROUP_NONE, label: '不分組' }, ...LIST_SORT_OPTIONS];

// ─── 已套用的篩選條件 ────────────────────────────────────────
// filterConfig 的視覺投影，唯讀標籤：條件本身要改走「篩選」入口，
// spec 的互動清單沒有「在條件列上直接移除」。

export interface ListFilterChip {
  readonly label: string;
  readonly value: string;
}

export const LIST_FILTERS: readonly ListFilterChip[] = [
  { label: '狀態', value: '未結案' },
  { label: '日曆', value: '2026 Q3' },
];

// ─── 檢視身份 ────────────────────────────────────────────────

export const LIST_VIEW_NAME = '本季進行中';

export const LIST_DEFAULT_SORT = { key: 'due', direction: 'asc' } as const;
