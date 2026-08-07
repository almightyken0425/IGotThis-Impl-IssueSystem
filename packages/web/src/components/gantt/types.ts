// 甘特與導航組 · 共用資料型別
//
// 來源：design git 的 `20_components/no3_gantt_nav.jsx`。
//
// 仲裁關係：design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值。
//
// design 端以檔頭「共同約定」列出日資料形狀，JSX 無型別可掛；搬進 impl 後
// 把同一份形狀寫成 interface，欄位名逐字保留，兩層對照零翻譯成本。

/**
 * 甘特橫軸的一個日曆天。由畫面端依 StartTime / EndTime 的日曆展開產生，
 * 元件只讀不算——要算哪天是假日、哪天是今天，都在畫面端決定。
 */
export interface GanttDay {
  /** React key 用的穩定識別，通常是 ISO 日期字串。 */
  readonly key: string;
  /** 日期刻度帶顯示的日號。 */
  readonly dayNumber: number;
  /** 星期字母，如「一」。 */
  readonly weekdayLabel: string;
  /** 月份帶顯示的月標，同月連續多日共用同一字串才併成一段。 */
  readonly monthLabel: string;
  /** 假日格底。省略即非假日。 */
  readonly isHoliday?: boolean;
  /** 該月第一天，畫最重的月分隔線。 */
  readonly isMonthStart?: boolean;
  /** 該週第一天，畫比日格線重一階的週線。 */
  readonly isWeekStart?: boolean;
  /** 今日，日號加粗。 */
  readonly isToday?: boolean;
}

/** 放置指示線的位置。'none' 為不顯示。 */
export type DropIndicatorPosition = 'none' | 'above' | 'below';

/** LevelSwitcher 的一段。層級軸攤平在工具列上，一段對一層。 */
export interface LevelOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}
