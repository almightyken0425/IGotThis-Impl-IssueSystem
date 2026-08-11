// 變更歷史 domain 的型別定義。
//
// 實體與欄位名對齊對側 Spec git 的 Model 層：
// - `ChangeLog` 見工單欄位多筆記錄 IssueFieldRecords，value 為固定結構 JSON
// - `FieldDefs.tracked` 見欄位系統資料結構
//
// domain 為純函式層，型別只描述資料形狀，不含任何持久化語意。

/** 一筆變更歷史的內容，對齊 spec 的固定結構 JSON（欄位名、舊值、新值、執行者、時間）。 */
export interface ChangeLogEntry {
  readonly fieldName: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actor: string;
  readonly time: number;
}

/** 判斷是否記錄所需的欄位定義投影：只取名稱與追蹤開關。 */
export interface TrackedFieldDef {
  readonly name: string;
  readonly tracked: boolean;
}

/** 一次待寫入的欄位異動：欄位名與新舊值。 */
export interface FieldChangeInput {
  readonly fieldName: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * recordFieldChange 的輸入。
 * 不含工單識別——domain 只決定「這批異動裡哪些該寫、寫什麼內容」，
 * 工單識別由呼叫端持有、寫入時自行帶上。
 */
export interface RecordFieldChangeInput {
  readonly changes: readonly FieldChangeInput[];
  readonly actor: string;
  /** 寫入當下時間，Unix ms；由呼叫端注入，domain 不取時鐘。 */
  readonly now: number;
  readonly fieldDefs: readonly TrackedFieldDef[];
}

/** rebuildFieldStateAt 摺疊所需的 ChangeLog 記錄投影。 */
export interface ChangeLogRecord {
  readonly issueId: string;
  readonly fieldName: string;
  readonly newValue: unknown;
  readonly time: number;
}

/** rebuildFieldStateAt 的輸入；records 可為超集，函式只讀 issueIds×fieldNames 範圍內的組合。 */
export interface RebuildFieldStateAtInput {
  /** 目標時點，Unix ms；納入採計的記錄為時間不晚於此值。 */
  readonly asOf: number;
  readonly issueIds: readonly string[];
  readonly fieldNames: readonly string[];
  readonly records: readonly ChangeLogRecord[];
}

/** 單一工單單一欄位於目標時點的重建結果。 */
export type RebuiltFieldState =
  | { readonly issueId: string; readonly fieldName: string; readonly hasValue: true; readonly value: unknown }
  | { readonly issueId: string; readonly fieldName: string; readonly hasValue: false };
