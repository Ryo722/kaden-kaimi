import { useMemo, useState } from "react";

import { AXIS2_FEATURE_VALUE_PROPS } from "@/lib/constants";
import {
  calculateExtendedRoi,
  type ExtendedRoiResult,
} from "@/lib/extended-roi";
import { formatYen } from "@/lib/format";
import type { RoiVerdict } from "@/lib/roi";
import type { EnergyRates, Model } from "@/types";

interface Props {
  nextModel: Model;
  nextPriceYen: number;
  rates: EnergyRates;
  initialAnnualKwh?: number;
  initialWaterPerCycleL?: number;
  initialWeeklyUses?: number;
  initialCurrentAgeYears?: number;
}

type VerdictMeta = {
  label: string;
  description: string;
  cardClass: string;
  badgeClass: string;
};

const VERDICT_META: Record<RoiVerdict, VerdictMeta> = {
  recommend: {
    label: "即買い替え推奨",
    description: "5 年以内に回収できる見込みです。",
    cardClass:
      "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]",
    badgeClass: "bg-[var(--color-success)] text-white",
  },
  "depends-on-lifespan": {
    label: "現機種の残り寿命次第",
    description: "5〜8 年で回収見込み。現機種の残寿命と修理費で判断しましょう。",
    cardClass:
      "border-amber-300 bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    badgeClass: "bg-[var(--color-warning)] text-white",
  },
  "wait-until-breakdown": {
    label: "故障まで待つ",
    description: "回収に 8〜12 年かかる見込み。故障してからの買い替えが合理的です。",
    cardClass:
      "border-amber-300 bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    badgeClass: "bg-[var(--color-warning)] text-white",
  },
  "no-benefit": {
    label: "経済的メリットなし",
    description:
      "金銭的な回収だけを見れば買い替えの理由になりません。機能や故障リスクで判断を。",
    cardClass:
      "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    badgeClass: "bg-[var(--color-danger)] text-white",
  },
};

function formatPayback(years: number): string {
  if (!Number.isFinite(years)) return "回収不能";
  if (years < 1) return `${(years * 12).toFixed(1)} か月`;
  return `${years.toFixed(1)} 年`;
}

type RoiState = {
  annualKwh: number;
  waterPerCycleL: number;
  weeklyUses: number;
  currentAgeYears: number;
  currentHasAutoDetergent: boolean;
};

type RoiUpdate = <K extends keyof RoiState>(
  key: K,
  value: RoiState[K],
) => void;

export default function RoiCalculator({
  nextModel,
  nextPriceYen,
  rates,
  initialAnnualKwh = 250,
  initialWaterPerCycleL = 95,
  initialWeeklyUses = 7,
  initialCurrentAgeYears = 10,
}: Props) {
  const [state, setState] = useState<RoiState>({
    annualKwh: initialAnnualKwh,
    waterPerCycleL: initialWaterPerCycleL,
    weeklyUses: initialWeeklyUses,
    currentAgeYears: initialCurrentAgeYears,
    currentHasAutoDetergent: false,
  });
  const update: RoiUpdate = (key, value) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const extended: ExtendedRoiResult | null = useMemo(
    () => calculateExtendedRoi(buildRoiInput(state, nextModel, nextPriceYen, rates)),
    [state, nextModel, nextPriceYen, rates],
  );

  return (
    <section
      aria-labelledby="roi-heading"
      className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
    >
      <Heading nextModel={nextModel} nextPriceYen={nextPriceYen} />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <InputPanel state={state} update={update} />
        <div className="grid gap-4">
          <BaseResultCard extended={extended} rates={rates} />
          <AdjustedResultCard extended={extended} />
        </div>
      </div>
      <ValuePropsList features={nextModel.specs.features} modelName={nextModel.modelName} />
    </section>
  );
}

function buildRoiInput(
  state: RoiState,
  nextModel: Model,
  nextPriceYen: number,
  rates: EnergyRates,
) {
  return {
    base: {
      current: {
        annualKwh: state.annualKwh,
        waterPerCycleL: state.waterPerCycleL,
      },
      next: nextModel,
      nextPriceYen,
      rates,
      weeklyUses: state.weeklyUses,
    },
    currentAgeYears: state.currentAgeYears,
    currentHasAutoDetergent: state.currentHasAutoDetergent,
  };
}

function Heading({
  nextModel,
  nextPriceYen,
}: {
  nextModel: Model;
  nextPriceYen: number;
}) {
  return (
    <>
      <h2 id="roi-heading" className="text-lg font-semibold tracking-tight">
        買い替え ROI 判定（軸2）
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        現機種のスペックと使い方を入力すると、{nextModel.modelName} （購入想定
        <span className="font-medium text-neutral-900"> {formatYen(nextPriceYen)} </span>
        ）への買い替えで何年で元が取れるかを試算します。光熱費のみの基本判定と、故障リスク・洗剤節約を加味した補正判定を並べて表示します。
      </p>
    </>
  );
}

function InputPanel({ state, update }: { state: RoiState; update: RoiUpdate }) {
  return (
    <div className="space-y-5">
      <RangeField
        id="current-annual-kwh"
        label="現機種の年間消費電力量"
        unit="kWh / 年"
        min={120}
        max={450}
        step={5}
        value={state.annualKwh}
        onChange={(v) => update("annualKwh", v)}
        hint="省エネラベルや取扱説明書の「年間消費電力量」を入力。"
      />
      <RangeField
        id="current-water-per-cycle"
        label="現機種の 1 回あたり水使用量"
        unit="L / 回"
        min={40}
        max={180}
        step={1}
        value={state.waterPerCycleL}
        onChange={(v) => update("waterPerCycleL", v)}
        hint="標準コース 1 サイクルあたりの水使用量（カタログ値）。"
      />
      <RangeField
        id="weekly-uses"
        label="週あたりの使用回数"
        unit="回 / 週"
        min={1}
        max={21}
        step={1}
        value={state.weeklyUses}
        onChange={(v) => update("weeklyUses", v)}
        hint="家族の洗濯頻度。単身なら 3〜4、4 人家族なら 7〜10 回が目安。"
      />
      <RangeField
        id="current-age-years"
        label="現機種の使用年数"
        unit="年"
        min={0}
        max={20}
        step={1}
        value={state.currentAgeYears}
        onChange={(v) => update("currentAgeYears", v)}
        hint="年齢が高いほど故障リスクが上がり、買い替えの経済合理性が増します。"
      />
      <AutoDetergentToggle state={state} update={update} />
    </div>
  );
}

function AutoDetergentToggle({
  state,
  update,
}: {
  state: RoiState;
  update: RoiUpdate;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-neutral-900">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
        checked={state.currentHasAutoDetergent}
        onChange={(e) => update("currentHasAutoDetergent", e.target.checked)}
      />
      <span>
        現機種は洗剤自動投入に対応している
        <span className="ml-1 text-xs text-[var(--color-text-muted)]">
          （オフのままなら洗剤節約分 ¥3,000/年を加算）
        </span>
      </span>
    </label>
  );
}

function BaseResultCard({
  extended,
  rates,
}: {
  extended: ExtendedRoiResult | null;
  rates: EnergyRates;
}) {
  const waterUnit = (rates.waterYenPerL + rates.sewerageYenPerL).toFixed(2);
  return (
    <ResultCard
      title="光熱費のみの判定（軸2 基本）"
      annualSavingLabel="年間削減額（電気 + 水道）"
      annualSaving={extended?.base.annualSaving ?? null}
      paybackYears={extended?.base.paybackYears ?? null}
      meta={extended ? VERDICT_META[extended.base.verdict] : null}
      footerNote={`電気 ${rates.electricityYenPerKwh} 円/kWh、水道+下水 ${waterUnit} 円/L で試算`}
    />
  );
}

function AdjustedResultCard({ extended }: { extended: ExtendedRoiResult | null }) {
  const breakdown = extended
    ? [
        { label: "光熱費削減", value: extended.base.annualSaving },
        {
          label: "故障リスク回避（期待修理費）",
          value: extended.failureRiskAnnualCost,
        },
        {
          label: "洗剤自動投入による節約",
          value: extended.detergentAnnualSaving,
        },
      ]
    : null;
  return (
    <ResultCard
      title="追加要因補正後の判定"
      annualSavingLabel="補正後 年間メリット"
      annualSaving={extended?.adjustedAnnualSaving ?? null}
      paybackYears={extended?.adjustedPaybackYears ?? null}
      meta={extended ? VERDICT_META[extended.adjustedVerdict] : null}
      breakdown={breakdown}
      footerNote="故障率・修理費は Phase 1 暫定モデル（家電標準使用期間 7 年を基準に近似）"
    />
  );
}

function ValuePropsList({
  features,
  modelName,
}: {
  features: string[];
  modelName: string;
}) {
  const props = features
    .filter((f) =>
      Object.prototype.hasOwnProperty.call(AXIS2_FEATURE_VALUE_PROPS, f),
    )
    .map((f) => ({ key: f, description: AXIS2_FEATURE_VALUE_PROPS[f]! }));

  if (props.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
      <h3 className="text-sm font-semibold text-neutral-900">
        金銭換算しにくいメリット（{modelName} の機能から）
      </h3>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        回収年数だけで判断しきれない価値。夜間運転可否・家事時間の短縮・衣類ダメージ軽減なども含めて総合判断してください。
      </p>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {props.map((vp) => (
          <li
            key={vp.key}
            className="flex items-start gap-2 rounded-lg bg-[var(--color-surface)] p-3 text-sm"
          >
            <span className="mt-0.5 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-ink)]">
              {vp.key}
            </span>
            <span className="text-neutral-800">{vp.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RangeFieldProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

function RangeField({
  id,
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: RangeFieldProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
        <span className="text-sm font-semibold text-[var(--color-primary)]">
          {value}
          <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
            {unit}
          </span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-primary)]"
      />
      {hint ? (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

interface ResultCardProps {
  title: string;
  annualSavingLabel: string;
  annualSaving: number | null;
  paybackYears: number | null;
  meta: VerdictMeta | null;
  breakdown?: Array<{ label: string; value: number }> | null;
  footerNote: string;
}

function ResultCard({
  title,
  annualSavingLabel,
  annualSaving,
  paybackYears,
  meta,
  breakdown,
  footerNote,
}: ResultCardProps) {
  if (!meta || annualSaving === null || paybackYears === null) {
    return (
      <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5 text-sm text-[var(--color-text-muted)]">
        入力値を変更すると判定が更新されます。
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border-2 p-5 ${meta.cardClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide uppercase opacity-80">
            {title}
          </p>
          <p className="mt-1 text-sm opacity-90">{meta.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-neutral-900">
        <MetricCell label={annualSavingLabel} value={formatYen(annualSaving)} />
        <MetricCell label="投資回収期間" value={formatPayback(paybackYears)} />
      </dl>

      {breakdown && <BreakdownList rows={breakdown} />}

      <p className="mt-3 text-xs text-neutral-700">{footerNote}</p>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}

function BreakdownList({
  rows,
}: {
  rows: Array<{ label: string; value: number }>;
}) {
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-1.5 text-neutral-800"
        >
          <span>{row.label}</span>
          <span className="font-semibold">
            {row.value >= 0 ? "+" : ""}
            {formatYen(row.value)} / 年
          </span>
        </li>
      ))}
    </ul>
  );
}
