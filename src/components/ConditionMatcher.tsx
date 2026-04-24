import { useMemo, useState } from "react";

import { AXIS6_FEATURE_LABELS } from "@/lib/constants";
import { formatYen } from "@/lib/format";
import {
  matchModels,
  type MatchBreakdown,
  type MatchResult,
} from "@/lib/matcher";
import type { EnergyRates, Model } from "@/types";

interface Props {
  candidates: Model[];
  currentPricesById: Record<string, number>;
  rates: EnergyRates;
  currentModelId: string;
}

type ScoreColumn = {
  key: keyof MatchBreakdown;
  label: string;
  max: number;
};

const SCORE_COLUMNS: ScoreColumn[] = [
  { key: "capacity", label: "容量適合", max: 30 },
  { key: "dimensions", label: "寸法適合", max: 20 },
  { key: "budget", label: "予算適合", max: 20 },
  { key: "features", label: "機能適合", max: 20 },
  { key: "roi", label: "ROI", max: 10 },
];

function featureLabel(key: string): string {
  if (key in AXIS6_FEATURE_LABELS) return AXIS6_FEATURE_LABELS[key]!;
  if (key.includes(":")) {
    const [brand, rest] = key.split(":", 2);
    return `${brand} 固有: ${rest}`;
  }
  return key;
}

type ConditionState = {
  householdSize: number;
  maxWidthMm: number;
  maxHeightMm: number;
  maxDepthMm: number;
  weeklyUses: number;
  budgetYen: number;
  includeCurrentMachine: boolean;
  currentAnnualKwh: number;
  currentWaterPerCycleL: number;
  priorityFeatures: string[];
};

const INITIAL_STATE: ConditionState = {
  householdSize: 3,
  maxWidthMm: 650,
  maxHeightMm: 1100,
  maxDepthMm: 750,
  weeklyUses: 7,
  budgetYen: 320000,
  includeCurrentMachine: false,
  currentAnnualKwh: 250,
  currentWaterPerCycleL: 95,
  priorityFeatures: [],
};

export default function ConditionMatcher({
  candidates,
  currentPricesById,
  rates,
  currentModelId,
}: Props) {
  const [state, setState] = useState<ConditionState>(INITIAL_STATE);
  const update = useMemo(
    () =>
      <K extends keyof ConditionState>(key: K, value: ConditionState[K]) =>
        setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const allFeatures = useMemo(() => collectFeatures(candidates), [candidates]);
  const currentPrices = useMemo(
    () => new Map(Object.entries(currentPricesById)),
    [currentPricesById],
  );

  const results = useMemo(
    () => matchModels(buildMatchInput(state, candidates, currentPrices, rates)),
    [state, candidates, currentPrices, rates],
  );

  return (
    <section
      aria-labelledby="condition-matcher-heading"
      className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
    >
      <Heading />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <ConditionInputs
          state={state}
          update={update}
          allFeatures={allFeatures}
        />
        <ResultsPanel
          results={results}
          currentModelId={currentModelId}
          currentPrices={currentPrices}
        />
      </div>
    </section>
  );
}

function buildMatchInput(
  state: ConditionState,
  candidates: Model[],
  currentPrices: Map<string, number>,
  rates: EnergyRates,
) {
  return {
    candidates,
    householdSize: state.householdSize,
    maxWidthMm: state.maxWidthMm,
    maxHeightMm: state.maxHeightMm,
    maxDepthMm: state.maxDepthMm,
    weeklyUses: state.weeklyUses,
    budgetYen: state.budgetYen,
    priorityFeatures: state.priorityFeatures,
    currentPrices,
    currentModel: state.includeCurrentMachine
      ? {
          annualKwh: state.currentAnnualKwh,
          waterPerCycleL: state.currentWaterPerCycleL,
        }
      : null,
    rates,
  };
}

function Heading() {
  return (
    <>
      <h2
        id="condition-matcher-heading"
        className="text-lg font-semibold tracking-tight"
      >
        条件マッチング（軸6）
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        家族構成・設置寸法・使用頻度・予算・重視機能を入力すると、登録機種のうち総合スコアが高い順に Top 3 を表示します。判定は常にこのページの機種を含む全候補を対象とし、選択中の機種が上位に入るかで適合度を確認できます。
      </p>
    </>
  );
}

type UpdateFn = <K extends keyof ConditionState>(
  key: K,
  value: ConditionState[K],
) => void;

interface ConditionInputsProps {
  state: ConditionState;
  update: UpdateFn;
  allFeatures: string[];
}

function ConditionInputs({ state, update, allFeatures }: ConditionInputsProps) {
  const togglePriorityFeature = (feature: string) => {
    const next = state.priorityFeatures.includes(feature)
      ? state.priorityFeatures.filter((f) => f !== feature)
      : [...state.priorityFeatures, feature];
    update("priorityFeatures", next);
  };
  return (
    <div className="space-y-5">
      <RangeField
        id="match-household"
        label="家族構成"
        unit="人"
        min={1}
        max={6}
        step={1}
        value={state.householdSize}
        onChange={(v) => update("householdSize", v)}
        hint={`目安容量 ${(state.householdSize * 1.5).toFixed(1)} kg（1 人あたり 1.5kg）`}
      />
      <DimensionInputs state={state} update={update} />
      <RangeField
        id="match-weekly"
        label="週あたり使用回数"
        unit="回"
        min={1}
        max={21}
        step={1}
        value={state.weeklyUses}
        onChange={(v) => update("weeklyUses", v)}
      />
      <BudgetField
        value={state.budgetYen}
        onChange={(v) => update("budgetYen", v)}
      />
      <PriorityFeaturesFieldset
        allFeatures={allFeatures}
        priorityFeatures={state.priorityFeatures}
        onToggle={togglePriorityFeature}
      />
      <CurrentMachinePanel state={state} update={update} />
    </div>
  );
}

function DimensionInputs({
  state,
  update,
}: {
  state: ConditionState;
  update: UpdateFn;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <RangeField
        id="match-width"
        label="幅 (mm)"
        unit="mm"
        min={550}
        max={750}
        step={5}
        value={state.maxWidthMm}
        onChange={(v) => update("maxWidthMm", v)}
      />
      <RangeField
        id="match-height"
        label="高さ (mm)"
        unit="mm"
        min={950}
        max={1200}
        step={5}
        value={state.maxHeightMm}
        onChange={(v) => update("maxHeightMm", v)}
      />
      <RangeField
        id="match-depth"
        label="奥行 (mm)"
        unit="mm"
        min={600}
        max={850}
        step={5}
        value={state.maxDepthMm}
        onChange={(v) => update("maxDepthMm", v)}
      />
    </div>
  );
}

function BudgetField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        htmlFor="match-budget"
        className="flex items-center justify-between text-sm font-medium text-neutral-900"
      >
        予算上限
        <span className="font-semibold text-[var(--color-primary)]">
          {formatYen(value)}
        </span>
      </label>
      <input
        id="match-budget"
        type="range"
        min={150000}
        max={500000}
        step={5000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-primary)]"
      />
    </div>
  );
}

function PriorityFeaturesFieldset({
  allFeatures,
  priorityFeatures,
  onToggle,
}: {
  allFeatures: string[];
  priorityFeatures: string[];
  onToggle: (f: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-neutral-900">
        優先したい機能（任意）
      </legend>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        未選択なら機能スコアは満点扱い。選択すると一致率で採点されます。
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {allFeatures.map((f) => (
          <FeatureChip
            key={f}
            feature={f}
            checked={priorityFeatures.includes(f)}
            onToggle={() => onToggle(f)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function FeatureChip({
  feature,
  checked,
  onToggle,
}: {
  feature: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const base =
    "cursor-pointer rounded-full border px-3 py-1 text-xs focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-1";
  const styling = checked
    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary-ink)]"
    : "border-[var(--color-border)] bg-white text-neutral-700 hover:border-[var(--color-primary)]";
  return (
    <label className={`${base} ${styling}`}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onToggle}
        aria-label={`${featureLabel(feature)} を優先機能に${checked ? "解除" : "追加"}`}
      />
      {featureLabel(feature)}
    </label>
  );
}

function CurrentMachinePanel({
  state,
  update,
}: {
  state: ConditionState;
  update: UpdateFn;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
      <label className="flex items-start gap-2 text-sm text-neutral-900">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
          checked={state.includeCurrentMachine}
          onChange={(e) => update("includeCurrentMachine", e.target.checked)}
        />
        <span>現機種のスペックを入力して ROI スコア（最大 10 点）も加味する</span>
      </label>
      {state.includeCurrentMachine && (
        <div className="mt-3 space-y-3">
          <RangeField
            id="match-current-kwh"
            label="現機種 年間消費電力量"
            unit="kWh"
            min={120}
            max={450}
            step={5}
            value={state.currentAnnualKwh}
            onChange={(v) => update("currentAnnualKwh", v)}
          />
          <RangeField
            id="match-current-water"
            label="現機種 1 回水使用量"
            unit="L"
            min={40}
            max={180}
            step={1}
            value={state.currentWaterPerCycleL}
            onChange={(v) => update("currentWaterPerCycleL", v)}
          />
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  results,
  currentModelId,
  currentPrices,
}: {
  results: MatchResult[];
  currentModelId: string;
  currentPrices: Map<string, number>;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
        マッチング結果 Top 3
      </h3>
      {results.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">
          候補がありません。
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {results.map((r, index) => (
            <MatchResultCard
              key={r.model.id}
              result={r}
              rank={index + 1}
              isCurrent={r.model.id === currentModelId}
              price={currentPrices.get(r.model.id) ?? r.model.msrp}
            />
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        予算超過は予算適合 0 点、寸法が 1 辺でも超過すれば寸法適合 0 点（足切り）。ユーザー入力に応じて ROI 以外の 90 点配分で判定します。
      </p>
    </div>
  );
}

function MatchResultCard({
  result,
  rank,
  isCurrent,
  price,
}: {
  result: MatchResult;
  rank: number;
  isCurrent: boolean;
  price: number;
}) {
  const cardClass = isCurrent
    ? "rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4"
    : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4";
  const metaClass = isCurrent
    ? "text-xs font-medium text-neutral-700"
    : "text-xs font-medium text-[var(--color-text-muted)]";
  const subClass = isCurrent
    ? "mt-0.5 text-xs text-neutral-700"
    : "mt-0.5 text-xs text-[var(--color-text-muted)]";

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={metaClass}>
            第{rank}位 · {result.model.brand} · {result.model.generation}
            {isCurrent && (
              <span className="ml-2 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                このページの機種
              </span>
            )}
          </p>
          <h4 className="mt-1 text-base font-semibold text-neutral-900">
            {result.model.modelName}
          </h4>
          <p className={subClass}>
            現在価格 {formatYen(price)} · 容量{" "}
            {result.model.specs.washCapacityKg}kg
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white">
          {Math.round(result.totalScore)} / 100
        </span>
      </div>

      <ScoreBreakdown breakdown={result.breakdown} isCurrent={isCurrent} />

      {!isCurrent && (
        <a
          href={`/washers/${result.model.id}/`}
          className="mt-3 inline-block text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          {result.model.modelName} の詳細を見る →
        </a>
      )}
    </li>
  );
}

function ScoreBreakdown({
  breakdown,
  isCurrent,
}: {
  breakdown: MatchBreakdown;
  isCurrent: boolean;
}) {
  const dtClass = isCurrent
    ? "text-neutral-700"
    : "text-[var(--color-text-muted)]";
  return (
    <dl className="mt-3 grid grid-cols-5 gap-2 text-[11px]">
      {SCORE_COLUMNS.map((col) => {
        const score = breakdown[col.key];
        const pct = Math.max(0, Math.min(1, score / col.max));
        return (
          <div key={col.key}>
            <dt className={dtClass}>{col.label}</dt>
            <dd className="mt-1 font-semibold text-neutral-900">
              {Math.round(score)}/{col.max}
              <span
                className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
                role="presentation"
              >
                <span
                  className="block h-full bg-[var(--color-primary)]"
                  style={{ width: `${pct * 100}%` }}
                />
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
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
      <div className="flex items-center justify-between gap-2">
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

function collectFeatures(candidates: Model[]): string[] {
  const set = new Set<string>();
  for (const c of candidates) {
    for (const f of c.specs.features) set.add(f);
  }
  return [...set].sort();
}
