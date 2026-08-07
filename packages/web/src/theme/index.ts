// design token 的 impl 落點。
//
// TODO：對齊 design git 的 Pine Paper 深林紙感標準，尚未搬入任何數值。
//
// 仲裁關係：
// - design git 是視覺標準的唯一仲裁端，impl 逐名對齊、不自行設值
// - 對應來源為 Module Design git 的 10_foundations 目錄
//   - no1_atomic_tokens.jsx：PALETTE、PRIMARY_PINE、SHADOW_ELEVATION、光暗雙主題
//   - no2_typography.jsx：system font 基準 14px 的緊湊字級階梯
//   - no3_layout_tokens.jsx：4px 網格、圓角 4 與 6 與 8、elevation 三階
//   - component_tokens 子目錄：各元件家族的尺寸與狀態色映射
//
// 已定案的錨點，搬入時逐項核對：
// - 主色種子 #004643 落 PRIMARY_PINE 的 800 階
// - 底色種子 #F0EDE5 落 PALETTE.sand 的 100 階，即畫布底
// - 紙面比畫布底亮一階，取 sand 0 階，不是純白
// - 中性色走 sand 暖階，全域不留冷灰白，暗主題同樣由 sand 深階往下推
// - light 為預設主題
//
// 搬入方式待定，兩案擇一：
// - 手抄 TypeScript 常數，型別安全但要人工同步
// - 由 design 的 jsx 產生 CSS 變數，同步自動但多一道建置步驟

export {};
