import React, { useState } from 'react';
import {
  FileDown,
  RotateCcw,
  ArrowRight,
  Fuel,
  Clock,
  Scale,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import {
  BaselineOrderMode,
  SavingsAnalysisResult,
  SavingsInputs,
  WEEKDAY_SHORT,
  WeekSchedulePlan
} from '../types';
import {
  buildBaselineAlphabeticalListText,
  buildBaselineSuburbListText
} from '../utils/savingsCalculator';
import { downloadOnePageSavingsPdf } from '../utils/savingsPdfReport';

interface SavingsPanelProps {
  inputs: SavingsInputs;
  onChangeInputs: (next: Partial<SavingsInputs>) => void;
  onResetInputs: () => void;
  analysis: SavingsAnalysisResult;
  weekPlan: WeekSchedulePlan;
  businessName: string;
  isDark?: boolean;
}

function formatZar(value: number): string {
  return `R ${Math.round(value).toLocaleString('en-ZA')}`;
}

function formatDriveTime(minutes: number): string {
  const abs = Math.round(Math.abs(minutes));
  const hrs = Math.floor(abs / 60);
  const rem = abs % 60;
  const sign = minutes < 0 ? '-' : '';
  return hrs > 0 ? `${sign}${hrs}h ${rem}m` : `${sign}${rem} min`;
}

export const SavingsPanel: React.FC<SavingsPanelProps> = ({
  inputs,
  onChangeInputs,
  onResetInputs,
  analysis,
  weekPlan,
  businessName,
  isDark = true
}) => {
  const [showDayBreakdown, setShowDayBreakdown] = useState(false);

  const surfaceBg = isDark
    ? 'bg-slate-900/80 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const inputBg = isDark
    ? 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-600'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-200';

  const handleBaselineModeChange = (mode: BaselineOrderMode) => {
    if (mode === 'pasted' && !inputs.pastedOrderText.trim()) {
      onChangeInputs({
        baselineMode: mode,
        pastedOrderText: buildBaselineAlphabeticalListText(weekPlan)
      });
      return;
    }
    onChangeInputs({ baselineMode: mode });
  };

  const handleNumberChange = (field: keyof SavingsInputs, raw: string, min = 0) => {
    const parsed = raw === '' ? 0 : Number(raw);
    if (!isNaN(parsed)) {
      onChangeInputs({ [field]: Math.max(min, parsed) } as Partial<SavingsInputs>);
    }
  };

  const handleDownloadPdf = () => {
    downloadOnePageSavingsPdf({
      businessName,
      inputs,
      analysis
    });
  };

  const kmSavedPercent =
    analysis.beforeWeekKm > 0
      ? Math.round((analysis.kmSavedWeek / analysis.beforeWeekKm) * 100)
      : 0;
  const timeSavedPercent =
    analysis.beforeWeekDriveMinutes > 0
      ? Math.round((analysis.driveMinutesSavedWeek / analysis.beforeWeekDriveMinutes) * 100)
      : 0;

  const breakEvenCovered =
    inputs.breakEvenMonthlyFeeZar <= 0 || analysis.kmSavedPerDay >= analysis.breakEvenKmPerDay;

  return (
    <section
      id="savings-calculator-panel"
      className={`flex-1 min-h-0 overflow-y-auto rounded-2xl border p-4 sm:p-5 transition-colors ${
        isDark
          ? 'bg-slate-950/95 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      {/* Top Action Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-5 border-b ${dividerClass}`}>
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight" style={{ textWrap: 'balance' }}>
            Monthly Rand Savings Proof
          </h2>
          <div className={`text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums ${mutedText}`}>
            <span>Selected week: {analysis.visitCount} visits</span>
            <span aria-hidden="true">·</span>
            <span>{analysis.fleetSize} vehicles (Mon–Fri)</span>
            <span aria-hidden="true">·</span>
            <span>Avg visit {Math.round(analysis.avgVisitLengthMinutes)} min</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">R {analysis.fuelCostPerKmZar.toFixed(2)}/km fuel rate</span>
          </div>
        </div>

        <button
          type="button"
          id="download-savings-pdf-btn"
          onClick={handleDownloadPdf}
          disabled={analysis.visitCount === 0}
          className="min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <FileDown className="w-4 h-4 shrink-0" />
          <span>Download one-page PDF report</span>
        </button>
      </div>

      {analysis.visitCount === 0 ? (
        <div className={`p-8 rounded-xl border text-center ${surfaceBg}`}>
          <p className="text-sm font-semibold">No scheduled visits in the selected week yet.</p>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Add customer visits or click &ldquo;Load demo data&rdquo; above to calculate weekly savings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN: Editable Inputs & Assumptions */}
          <div className={`xl:col-span-4 rounded-xl border p-4 space-y-4 ${surfaceBg}`}>
            <div className={`flex items-center justify-between pb-2.5 border-b ${dividerClass}`}>
              <div>
                <h3 className="text-sm font-bold">Inputs &amp; Assumptions</h3>
                <p className={`text-[11px] ${mutedText}`}>
                  Editable inputs labelled &ldquo;your assumption&rdquo; in PDF
                </p>
              </div>
              <button
                type="button"
                onClick={onResetInputs}
                className={`min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
                  isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Baseline Way of Working */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">Current way of working (baseline)</label>
                <span className={`text-[10.5px] font-medium ${mutedText}`}>your assumption</span>
              </div>
              <div
                className={`grid grid-cols-3 gap-1 p-1 rounded-lg border ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
                role="group"
                aria-label="Baseline ordering method"
              >
                <button
                  type="button"
                  id="baseline-mode-suburb"
                  onClick={() => handleBaselineModeChange('suburb')}
                  className={`min-h-[44px] sm:min-h-0 py-2 sm:py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    inputs.baselineMode === 'suburb'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Suburb
                </button>
                <button
                  type="button"
                  id="baseline-mode-alpha"
                  onClick={() => handleBaselineModeChange('alphabetical')}
                  className={`min-h-[44px] sm:min-h-0 py-2 sm:py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    inputs.baselineMode === 'alphabetical'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Alphabetical
                </button>
                <button
                  type="button"
                  id="baseline-mode-pasted"
                  onClick={() => handleBaselineModeChange('pasted')}
                  className={`min-h-[44px] sm:min-h-0 py-2 sm:py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    inputs.baselineMode === 'pasted'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pasted Order
                </button>
              </div>
              <p className={`text-[11px] mt-1.5 leading-snug ${mutedText}`}>
                {inputs.baselineMode === 'suburb'
                  ? 'Baseline assigns stops sorted alphabetically by suburb without geographic clustering or nearest-stop order.'
                  : inputs.baselineMode === 'alphabetical'
                  ? 'Baseline assigns stops alphabetically by customer name across weekly shifts.'
                  : 'Paste customer names below (one per line or comma-separated) in your current visit order.'}
              </p>

              {inputs.baselineMode === 'pasted' && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10.5px] font-mono tabular-nums ${mutedText}`}>
                      Matched {analysis.pastedMatchedCount} / {analysis.visitCount} visits
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeInputs({ pastedOrderText: buildBaselineSuburbListText(weekPlan) })
                        }
                        className="text-[10.5px] font-semibold text-sky-400 hover:underline cursor-pointer"
                      >
                        Fill suburb order
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeInputs({
                            pastedOrderText: buildBaselineAlphabeticalListText(weekPlan)
                          })
                        }
                        className="text-[10.5px] font-semibold text-amber-400 hover:underline cursor-pointer"
                      >
                        Fill A–Z list
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="savings-pasted-order-textarea"
                    rows={5}
                    value={inputs.pastedOrderText}
                    onChange={(e) => onChangeInputs({ pastedOrderText: e.target.value })}
                    placeholder="Paste customer names in your current order (one per line)..."
                    className={`w-full rounded-lg border px-2.5 py-2 text-xs font-mono leading-snug focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  {analysis.pastedUnmatchedLines.length > 0 && (
                    <p className="text-[10.5px] text-amber-400">
                      Unmatched lines ignored: {analysis.pastedUnmatchedLines.slice(0, 3).join(', ')}
                      {analysis.pastedUnmatchedLines.length > 3 ? '...' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Numeric Inputs Grid */}
            <div className={`pt-2 border-t ${dividerClass} grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3`}>
              {/* Fuel Price */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="savings-fuel-price" className="text-xs font-semibold">
                    Fuel price per litre
                  </label>
                  <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    R
                  </span>
                  <input
                    id="savings-fuel-price"
                    type="number"
                    min={1}
                    max={150}
                    step="0.5"
                    value={inputs.fuelPricePerLitre}
                    onChange={(e) => handleNumberChange('fuelPricePerLitre', e.target.value, 1)}
                    className={`w-full rounded-lg border pl-7 pr-12 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                    / L
                  </span>
                </div>
              </div>

              {/* Consumption */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="savings-fuel-consumption" className="text-xs font-semibold">
                    Fuel consumption
                  </label>
                  <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                </div>
                <div className="relative">
                  <input
                    id="savings-fuel-consumption"
                    type="number"
                    min={1}
                    max={50}
                    step="0.5"
                    value={inputs.fuelConsumptionLPer100Km}
                    onChange={(e) =>
                      handleNumberChange('fuelConsumptionLPer100Km', e.target.value, 1)
                    }
                    className={`w-full rounded-lg border pl-3 pr-20 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                    L / 100 km
                  </span>
                </div>
              </div>

              {/* Working days per month */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="savings-working-days" className="text-xs font-semibold">
                    Working days per month
                  </label>
                  <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                </div>
                <div className="relative">
                  <input
                    id="savings-working-days"
                    type="number"
                    min={1}
                    max={31}
                    step="1"
                    value={inputs.workingDaysPerMonth}
                    onChange={(e) => handleNumberChange('workingDaysPerMonth', e.target.value, 1)}
                    className={`w-full rounded-lg border pl-3 pr-16 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                    days/mo
                  </span>
                </div>
              </div>

              {/* Average price per visit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="savings-avg-price" className="text-xs font-semibold">
                    Average price per visit
                  </label>
                  <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    R
                  </span>
                  <input
                    id="savings-avg-price"
                    type="number"
                    min={0}
                    max={25000}
                    step="10"
                    value={inputs.avgPricePerVisitZar}
                    onChange={(e) => handleNumberChange('avgPricePerVisitZar', e.target.value, 0)}
                    className={`w-full rounded-lg border pl-7 pr-14 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                    / visit
                  </span>
                </div>
              </div>

              {/* Gross margin % */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="savings-gross-margin" className="text-xs font-semibold">
                    Gross margin %
                  </label>
                  <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                </div>
                <div className="relative">
                  <input
                    id="savings-gross-margin"
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    value={inputs.grossMarginPercent}
                    onChange={(e) => handleNumberChange('grossMarginPercent', e.target.value, 0)}
                    className={`w-full rounded-lg border pl-3 pr-10 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Before vs After, Three Separate Values, Sensitivity & Break-even */}
          <div className="xl:col-span-8 space-y-5">
            {/* 1. BEFORE vs AFTER Table for Selected Week */}
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold">
                    Selected Week Comparison: BEFORE (Baseline) vs AFTER (Hamba Order)
                  </h3>
                  <p className={`text-[11px] ${mutedText}`}>
                    Same {analysis.visitCount} visits &amp; {analysis.fleetSize} vehicles across Mon–Fri · Scaled to{' '}
                    {inputs.workingDaysPerMonth} working days/month
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDayBreakdown((prev) => !prev)}
                  className={`min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    isDark
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{showDayBreakdown ? 'Hide weekday split' : 'Weekday split'}</span>
                  {showDayBreakdown ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className={`border-b text-[11px] font-semibold ${dividerClass} ${mutedText}`}>
                      <th className="py-2 pr-3">Selected Week Metric</th>
                      <th className="py-2 px-3 text-right">BEFORE (Baseline)</th>
                      <th className="py-2 px-3 text-right">AFTER (Hamba)</th>
                      <th className="py-2 px-3 text-right">Saved / Week</th>
                      <th className="py-2 pl-3 text-right">Saved / {inputs.workingDaysPerMonth} Days</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerClass}`}>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Fleet Distance (km)</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${mutedText}`}>
                        {analysis.beforeWeekKm.toFixed(1)} km
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {analysis.afterWeekKm.toFixed(1)} km
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          analysis.kmSavedWeek >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {analysis.kmSavedWeek >= 0 ? '-' : '+'}
                        {Math.abs(analysis.kmSavedWeek).toFixed(1)} km ({kmSavedPercent}%)
                      </td>
                      <td
                        className={`py-2.5 pl-3 text-right font-mono font-bold ${
                          analysis.kmSavedPerMonth >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {analysis.kmSavedPerMonth.toFixed(0)} km
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Total Drive Time</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${mutedText}`}>
                        {formatDriveTime(analysis.beforeWeekDriveMinutes)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {formatDriveTime(analysis.afterWeekDriveMinutes)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          analysis.driveMinutesSavedWeek >= 0 ? 'text-sky-400' : 'text-rose-400'
                        }`}
                      >
                        {formatDriveTime(analysis.driveMinutesSavedWeek)} ({timeSavedPercent}%)
                      </td>
                      <td
                        className={`py-2.5 pl-3 text-right font-mono font-bold ${
                          analysis.driveMinutesSavedPerMonth >= 0 ? 'text-sky-400' : 'text-rose-400'
                        }`}
                      >
                        {formatDriveTime(analysis.driveMinutesSavedPerMonth)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {analysis.kmSavedWeek <= 0 && (
                <div
                  className={`mt-3 p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    isDark
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    The current baseline sequence matches or beats the clustered week distance ({analysis.kmSavedWeek.toFixed(1)} km delta). Monthly savings are shown at R 0 floor; switch to Alphabetical or Load Demo Data to inspect typical multi-suburb savings.
                  </span>
                </div>
              )}

              {showDayBreakdown && (
                <div className={`mt-3 pt-3 border-t ${dividerClass} overflow-x-auto`}>
                  <table className="w-full text-left border-collapse text-[11px] tabular-nums">
                    <thead>
                      <tr className={`border-b ${dividerClass} ${mutedText}`}>
                        <th className="py-1.5 pr-2">Day</th>
                        <th className="py-1.5 px-2 text-right">Visits</th>
                        <th className="py-1.5 px-2 text-right">Before km</th>
                        <th className="py-1.5 px-2 text-right">After km</th>
                        <th className="py-1.5 px-2 text-right">Km saved</th>
                        <th className="py-1.5 pl-2 text-right">Drive time saved</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dividerClass}`}>
                      {analysis.weekdayBreakdown.map((day) => (
                        <tr key={day.weekday}>
                          <td className="py-1.5 pr-2 font-semibold">{WEEKDAY_SHORT[day.weekday]}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{day.visitCount}</td>
                          <td className={`py-1.5 px-2 text-right font-mono ${mutedText}`}>
                            {day.beforeKm.toFixed(1)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {day.afterKm.toFixed(1)}
                          </td>
                          <td
                            className={`py-1.5 px-2 text-right font-mono font-bold ${
                              day.kmSaved >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {day.kmSaved.toFixed(1)} km
                          </td>
                          <td className="py-1.5 pl-2 text-right font-mono text-sky-400">
                            {formatDriveTime(day.driveMinutesSaved)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 2. THREE SEPARATE VALUE NUMBERS (NEVER ADDED TOGETHER) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  Three Separate Numbers per Month
                </h3>
                <span className={`text-[11px] font-medium ${mutedText}`}>
                  Kept strictly separate · never added together
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                {/* (a) Fuel saved per month in rand */}
                <div className={`rounded-xl border p-4 flex flex-col justify-between ${surfaceBg}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-400">(a) Fuel saved / month</span>
                      <Fuel className="w-4 h-4 text-emerald-400 shrink-0" />
                    </div>
                    <div
                      id="savings-fuel-saved-zar"
                      className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-emerald-400 mt-2 tracking-tight"
                    >
                      {formatZar(analysis.fuelSavedPerMonthZar)}
                    </div>
                  </div>
                  <div className={`text-[11px] mt-3 pt-2.5 border-t ${dividerClass} space-y-0.5 tabular-nums ${mutedText}`}>
                    <div>
                      {Math.max(0, analysis.kmSavedPerMonth).toFixed(0)} km/mo saved (
                      {Math.max(0, analysis.kmSavedPerDay).toFixed(1)} km/day)
                    </div>
                    <div>
                      {analysis.litresSavedPerMonth.toFixed(0)} L saved @ R{' '}
                      {inputs.fuelPricePerLitre.toFixed(2)}/L
                    </div>
                  </div>
                </div>

                {/* (b) Extra visits possible */}
                <div className={`rounded-xl border p-4 flex flex-col justify-between ${surfaceBg}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-400">(b) Extra visits possible</span>
                      <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                    </div>
                    <div
                      id="savings-extra-visits"
                      className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-sky-400 mt-2 tracking-tight"
                    >
                      {analysis.extraVisitsPossiblePerMonth.toFixed(1)}{' '}
                      <span className="text-sm font-bold">visits/mo</span>
                    </div>
                    <div className="text-[11px] font-semibold text-amber-400 mt-1">
                      only if you have customers to fill them
                    </div>
                  </div>
                  <div className={`text-[11px] mt-3 pt-2.5 border-t ${dividerClass} space-y-0.5 tabular-nums`}>
                    <div className={mutedText}>
                      {Math.max(0, Math.round(analysis.driveMinutesSavedPerMonth))} min saved ÷{' '}
                      {Math.round(analysis.avgVisitLengthMinutes)} min avg visit
                    </div>
                    <div className="font-bold">
                      Extra profit (visits × price × margin):{' '}
                      <span id="savings-extra-profit-zar" className="font-mono text-sky-400">
                        {formatZar(analysis.extraProfitPerMonthZar)}/mo
                      </span>
                    </div>
                  </div>
                </div>

                {/* (c) Fee check: highest monthly fee at 25% of fuel saving */}
                <div className={`rounded-xl border p-4 flex flex-col justify-between ${surfaceBg}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-400">(c) Fee check</span>
                      <Scale className="w-4 h-4 text-amber-400 shrink-0" />
                    </div>
                    <div
                      id="savings-fee-check-zar"
                      className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-amber-400 mt-2 tracking-tight"
                    >
                      {formatZar(analysis.maxFeeAt25PctZar)}
                    </div>
                    <div className={`text-[11px] font-medium mt-1 ${mutedText}`}>
                      Highest monthly fee at 25% of fuel saving
                    </div>
                  </div>
                  <div className={`text-[11px] mt-3 pt-2.5 border-t ${dividerClass} space-y-0.5 tabular-nums ${mutedText}`}>
                    <div>Leaves 75% of fuel savings with you</div>
                    <div>Calculated strictly on cash fuel saved alone</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. LOW / BASE / HIGH SENSITIVITY (-30% / 0 / +30%) */}
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className="mb-3">
                <h3 className="text-sm font-bold">Sensitivity Range: Low / Base / High (-30% / 0 / +30%)</h3>
                <p className={`text-[11px] ${mutedText}`}>
                  Accounts for real-world traffic variance, cancellations, and day-to-day schedule changes
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className={`border-b text-[11px] font-semibold ${dividerClass} ${mutedText}`}>
                      <th className="py-2 pr-3">Scenario</th>
                      <th className="py-2 px-3 text-right">Km Saved / Mo</th>
                      <th className="py-2 px-3 text-right">(a) Fuel Saved / Mo</th>
                      <th className="py-2 px-3 text-right">(b) Extra Visits &amp; Profit*</th>
                      <th className="py-2 pl-3 text-right">(c) Fee Check (25%)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerClass}`}>
                    {analysis.scenarios.map((row) => {
                      const isBase = row.adjustmentPercent === 0;
                      return (
                        <tr
                          key={row.label}
                          className={
                            isBase
                              ? isDark
                                ? 'bg-slate-800/50 font-semibold'
                                : 'bg-slate-100/80 font-semibold'
                              : undefined
                          }
                        >
                          <td className="py-2.5 pr-3">{row.label}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {row.kmSavedPerMonth.toFixed(0)} km
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {formatZar(row.fuelSavedPerMonthZar)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-sky-400">
                            {row.extraVisitsPossiblePerMonth.toFixed(1)} ({formatZar(row.extraProfitPerMonthZar)})
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono font-bold text-amber-400">
                            {formatZar(row.maxFeeAt25PctZar)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={`text-[11px] mt-2.5 ${mutedText}`}>
                * Extra visits and extra profit apply only if you have customers to fill them. Figures are kept separate and never summed.
              </p>
            </div>

            {/* 4. BREAK-EVEN LINE */}
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold">Break-Even Line (Fuel Saving vs Monthly Fee)</h3>
                  <p id="savings-breakeven-line" className="text-xs leading-relaxed tabular-nums">
                    To cover a monthly fee of{' '}
                    <strong className="font-mono">{formatZar(inputs.breakEvenMonthlyFeeZar)}</strong>, your fleet must save{' '}
                    <strong className="font-mono text-amber-400">
                      {analysis.breakEvenKmPerDay.toFixed(1)} km per day
                    </strong>{' '}
                    ({analysis.breakEvenKmPerMonth.toFixed(0)} km/month over {inputs.workingDaysPerMonth} days @ R{' '}
                    {analysis.fuelCostPerKmZar.toFixed(2)}/km).
                  </p>
                  <div className={`text-[11px] flex items-center gap-1.5 tabular-nums ${mutedText}`}>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      Current week saves{' '}
                      <strong className={breakEvenCovered ? 'text-emerald-400' : 'text-rose-400'}>
                        {Math.max(0, analysis.kmSavedPerDay).toFixed(1)} km/day
                      </strong>{' '}
                      {inputs.breakEvenMonthlyFeeZar > 0 && analysis.breakEvenKmPerDay > 0
                        ? breakEvenCovered
                          ? `— covered by fuel savings alone (${(
                              Math.max(0, analysis.kmSavedPerDay) / analysis.breakEvenKmPerDay
                            ).toFixed(1)}× break-even).`
                          : `— ${(analysis.breakEvenKmPerDay - Math.max(0, analysis.kmSavedPerDay)).toFixed(1)} km/day short of fuel break-even.`
                        : '.'}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 w-full md:w-48">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="savings-breakeven-fee-input" className="text-xs font-semibold">
                      Monthly fee to test
                    </label>
                    <span className={`text-[10px] ${mutedText}`}>your assumption</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                      R
                    </span>
                    <input
                      id="savings-breakeven-fee-input"
                      type="number"
                      min={0}
                      max={100000}
                      step="100"
                      value={inputs.breakEvenMonthlyFeeZar}
                      onChange={(e) =>
                        handleNumberChange('breakEvenMonthlyFeeZar', e.target.value, 0)
                      }
                      className={`w-full rounded-lg border pl-7 pr-12 py-2 text-sm font-mono tabular-nums font-bold focus:outline-none focus:border-amber-500 ${inputBg}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                      / mo
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`text-[11px] pb-2 ${mutedText}`}>
              Figures are estimates based on the inputs shown.
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
