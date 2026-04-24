import type { BrandId } from "@/types";

export const BRAND_HUE_DEGREES: Record<BrandId, number> = {
  panasonic: 210,
  hitachi: 15,
  toshiba: 265,
  sharp: 150,
  aqua: 190,
};

export const AXIS6_FEATURE_LABELS: Record<string, string> = {
  "heat-pump": "ヒートポンプ乾燥",
  "auto-detergent": "洗剤自動投入",
  "smart-app": "スマホ連携",
  "quiet-mode": "静音モード",
};

export const AXIS1_CAPACITY_DELTA_MAX_KG = 1;
export const AXIS1_CORE_FEATURES = ["heat-pump"] as const;
export const AXIS1_CORE_DRY_CAPACITY_MIN_KG = 3;
export const AXIS1_FEATURE_MATCH_WEIGHT = 0.7;
export const AXIS1_PRICE_DIFF_WEIGHT = 0.3;
export const AXIS1_TOP_N = 3;

export const AXIS2_WEEKS_PER_YEAR = 52;
export const AXIS2_DEFAULT_WEEKLY_USES = 7;
export const AXIS2_PAYBACK_RECOMMEND_MAX_YEARS = 5;
export const AXIS2_PAYBACK_DEPENDS_MAX_YEARS = 8;
export const AXIS2_PAYBACK_WAIT_MAX_YEARS = 12;

export type FailureRiskTier = {
  maxAgeYears: number;
  annualProbability: number;
  avgRepairCostYen: number;
};

export const AXIS2_FAILURE_RISK_TABLE: readonly FailureRiskTier[] = [
  { maxAgeYears: 4, annualProbability: 0.01, avgRepairCostYen: 20000 },
  { maxAgeYears: 7, annualProbability: 0.04, avgRepairCostYen: 30000 },
  { maxAgeYears: 10, annualProbability: 0.1, avgRepairCostYen: 40000 },
  { maxAgeYears: 13, annualProbability: 0.18, avgRepairCostYen: 50000 },
  { maxAgeYears: Infinity, annualProbability: 0.28, avgRepairCostYen: 60000 },
];

export const AXIS2_DETERGENT_FEATURE = "auto-detergent" as const;
export const AXIS2_DETERGENT_ANNUAL_SAVING_YEN = 3000;

export const AXIS2_FEATURE_VALUE_PROPS: Record<string, string> = {
  "heat-pump":
    "ヒートポンプ乾燥で衣類ダメージと乾燥時の電気代を両立で削減",
  "auto-detergent":
    "洗剤自動投入で計量の手間が不要。投入量の最適化で洗剤コストも抑制",
  "smart-app":
    "アプリで予約・通知が可能。深夜電力帯でのタイマー運用が実用的",
  "quiet-mode": "静音モードで夜間・早朝の運転でも家族や近隣への音配慮がしやすい",
};

export const AXIS3_WINDOW_DAYS = 30;
export const AXIS3_PRICE_FIELD = "rakutenAvg" as const;
export const AXIS3_CONFIDENCE_BY_ANCESTOR_COUNT = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
} as const;

export const AXIS5_ANNUAL_KWH_DELTA_THRESHOLD = 0.05;
export const AXIS5_WATER_DELTA_THRESHOLD = 0.05;
export const AXIS5_WASH_CAPACITY_DELTA_THRESHOLD_KG = 0.5;

export const AXIS5_FEATURE_TRANSLATIONS: Record<
  string,
  { added: string; removed: string }
> = {
  "heat-pump": {
    added: "乾燥方式がヒートポンプに変更（電気代削減に寄与）",
    removed: "ヒートポンプ乾燥が削除（電気代増の可能性）",
  },
  "auto-detergent": {
    added: "洗剤自動投入対応（計量の手間なし）",
    removed: "洗剤自動投入機能が削除",
  },
  "smart-app": {
    added: "スマホ連携追加（月数回以上の使用で利便性向上）",
    removed: "スマホ連携が削除",
  },
  "quiet-mode": {
    added: "静音モード追加",
    removed: "静音モードが削除",
  },
};

export const AXIS5_DEFAULT_TRANSLATION = {
  added: (key: string) => `新機能「${key}」追加`,
  removed: (key: string) => `機能「${key}」削除`,
};

export const AXIS5_NUMERIC_TRANSLATIONS = {
  annualKwh: (deltaPercent: number): string => {
    const pct = Math.abs(deltaPercent * 100).toFixed(1);
    return deltaPercent < 0
      ? `年間消費電力が約 ${pct}% 削減（電気代節約）`
      : `年間消費電力が約 ${pct}% 増加`;
  },
  waterPerCycleL: (deltaPercent: number): string => {
    const pct = Math.abs(deltaPercent * 100).toFixed(1);
    return deltaPercent < 0
      ? `1回あたり水使用量が約 ${pct}% 削減（水道代節約）`
      : `1回あたり水使用量が約 ${pct}% 増加`;
  },
  washCapacityKg: (deltaKg: number): string => {
    const abs = Math.abs(deltaKg).toFixed(1);
    return deltaKg > 0
      ? `洗濯容量が ${abs}kg 増加`
      : `洗濯容量が ${abs}kg 減少`;
  },
} as const;

export const AXIS6_HOUSEHOLD_KG_PER_PERSON = 1.5;
export const AXIS6_CAPACITY_TOLERANCE_KG = 3;
export const AXIS6_CAPACITY_MAX_SCORE = 30;
export const AXIS6_DIMENSIONS_MAX_SCORE = 20;
export const AXIS6_BUDGET_MAX_SCORE = 20;
export const AXIS6_BUDGET_BASE_SCORE = 15;
export const AXIS6_BUDGET_BONUS_SCORE = 5;
export const AXIS6_BUDGET_BONUS_RATIO = 0.6;
export const AXIS6_FEATURES_MAX_SCORE = 20;
export const AXIS6_ROI_MAX_SCORE = 10;
export const AXIS6_ROI_VERDICT_SCORE = {
  recommend: 10,
  "depends-on-lifespan": 7,
  "wait-until-breakdown": 3,
  "no-benefit": 0,
} as const;
export const AXIS6_TOP_N = 3;
