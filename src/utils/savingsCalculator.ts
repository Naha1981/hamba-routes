import {
  LatLng,
  PetStop,
  SavingsAnalysisResult,
  SavingsInputs,
  SavingsScenarioRow,
  WEEKDAYS,
  Weekday,
  WeekdaySavingsBreakdown,
  WeekSchedulePlan
} from '../types';
import { estimateDrivingDistance, estimateDrivingDuration } from './geoUtils';

const DEFAULT_DEPOT: LatLng = { lat: -26.1076, lng: 28.0567, altitude: 1500 };

function computeTourLoopMetrics(
  depotLoc: LatLng,
  visits: PetStop[]
): { distanceMeters: number; durationSeconds: number } {
  if (visits.length === 0) {
    return { distanceMeters: 0, durationSeconds: 0 };
  }
  let distanceMeters = 0;
  let durationSeconds = 0;
  let prev = depotLoc;

  for (const stop of visits) {
    const d = estimateDrivingDistance(prev, stop.location);
    const s = estimateDrivingDuration(d);
    distanceMeters += d;
    durationSeconds += s;
    prev = stop.location;
  }

  const returnDist = estimateDrivingDistance(prev, depotLoc);
  const returnSec = estimateDrivingDuration(returnDist);
  distanceMeters += returnDist;
  durationSeconds += returnSec;

  return { distanceMeters, durationSeconds };
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\d+[.)\s-]+/, '') // strip leading numbering like "1. " or "02 - "
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBaselineAlphabeticalListText(weekPlan: WeekSchedulePlan): string {
  const visits = weekPlan.dayRoutes
    .flatMap((dr) => dr.orderedStops.filter((s) => !s.id.startsWith('depot')))
    .sort((a, b) => a.name.localeCompare(b.name));
  return visits.map((s) => s.name).join('\n');
}

export function buildBaselineSuburbListText(weekPlan: WeekSchedulePlan): string {
  const visits = weekPlan.dayRoutes
    .flatMap((dr) => dr.orderedStops.filter((s) => !s.id.startsWith('depot')))
    .sort((a, b) => {
      const subCmp = (a.suburb || a.breed || '').localeCompare(b.suburb || b.breed || '');
      return subCmp !== 0 ? subCmp : a.name.localeCompare(b.name);
    });
  return visits.map((s) => s.name).join('\n');
}

export function calculateWeekSavings(
  weekPlan: WeekSchedulePlan,
  inputs: SavingsInputs
): SavingsAnalysisResult {
  const scheduledCustomers: PetStop[] = [];
  const vehicleSet = new Set<string>();

  weekPlan.dayRoutes.forEach((dr) => {
    vehicleSet.add(dr.vehicleId);
    dr.orderedStops.forEach((s) => {
      if (!s.id.startsWith('depot')) {
        scheduledCustomers.push(s);
      }
    });
  });

  const visitCount = scheduledCustomers.length;
  const fleetSize = Math.max(1, vehicleSet.size);
  const totalServiceMin = scheduledCustomers.reduce((sum, s) => sum + (s.durationMin || 25), 0);
  const avgVisitLengthMinutes = visitCount > 0 ? totalServiceMin / visitCount : 25;

  // Determine BEFORE sequence of all scheduled customers
  let baselineOrderedCustomers: PetStop[] = [];
  let pastedMatchedCount = 0;
  const pastedUnmatchedLines: string[] = [];

  if (inputs.baselineMode === 'suburb') {
    baselineOrderedCustomers = [...scheduledCustomers].sort((a, b) => {
      const subA = (a.suburb || a.breed || '').trim();
      const subB = (b.suburb || b.breed || '').trim();
      const subCmp = subA.localeCompare(subB);
      if (subCmp !== 0) return subCmp;
      return a.name.localeCompare(b.name);
    });
  } else if (inputs.baselineMode === 'alphabetical') {
    baselineOrderedCustomers = [...scheduledCustomers].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  } else {
    // 'pasted' order: match lines against scheduledCustomers
    const rawTokens = inputs.pastedOrderText
      .split(/[\n,;]+/)
      .map((t) => normalizeMatchText(t))
      .filter(Boolean);

    const remainingPool = [...scheduledCustomers];
    const matched: PetStop[] = [];

    for (const token of rawTokens) {
      let idx = remainingPool.findIndex((s) => s.id.toLowerCase() === token);
      if (idx < 0) {
        idx = remainingPool.findIndex((s) => normalizeMatchText(s.name) === token);
      }
      if (idx < 0) {
        idx = remainingPool.findIndex(
          (s) =>
            normalizeMatchText(s.name).includes(token) ||
            normalizeMatchText(s.address).includes(token) ||
            (s.suburb && normalizeMatchText(s.suburb).includes(token))
        );
      }

      if (idx >= 0) {
        matched.push(remainingPool.splice(idx, 1)[0]);
        pastedMatchedCount++;
      } else {
        pastedUnmatchedLines.push(token);
      }
    }

    baselineOrderedCustomers = [...matched, ...remainingPool];
  }

  // Distribute baselineOrderedCustomers into the exact same (weekday, vehicle) slot counts
  // from weekPlan.dayRoutes so both BEFORE and AFTER perform identical work capacity per shift.
  const dayBeforeTotals: Record<Weekday, { distMeters: number; driveMinutes: number; visits: number }> = {
    Monday: { distMeters: 0, driveMinutes: 0, visits: 0 },
    Tuesday: { distMeters: 0, driveMinutes: 0, visits: 0 },
    Wednesday: { distMeters: 0, driveMinutes: 0, visits: 0 },
    Thursday: { distMeters: 0, driveMinutes: 0, visits: 0 },
    Friday: { distMeters: 0, driveMinutes: 0, visits: 0 }
  };

  let cursor = 0;
  let beforeTotalDistMeters = 0;
  let beforeTotalDriveSeconds = 0;

  for (const dr of weekPlan.dayRoutes) {
    const count = dr.visitCount;
    if (count <= 0) continue;
    const slice = baselineOrderedCustomers.slice(cursor, cursor + count);
    cursor += count;

    const depotLoc = dr.depotLocation || DEFAULT_DEPOT;
    const loop = computeTourLoopMetrics(depotLoc, slice);
    beforeTotalDistMeters += loop.distanceMeters;
    beforeTotalDriveSeconds += loop.durationSeconds;

    dayBeforeTotals[dr.weekday].distMeters += loop.distanceMeters;
    dayBeforeTotals[dr.weekday].driveMinutes += Math.round(loop.durationSeconds / 60);
    dayBeforeTotals[dr.weekday].visits += slice.length;
  }

  const beforeWeekKm = beforeTotalDistMeters / 1000;
  const afterWeekKm = weekPlan.totalDistanceMeters / 1000;
  const beforeWeekDriveMinutes = Math.round(beforeTotalDriveSeconds / 60);
  const afterWeekDriveMinutes = weekPlan.totalDriveMinutes;

  const weekdayBreakdown: WeekdaySavingsBreakdown[] = WEEKDAYS.map((day) => {
    const summary = weekPlan.daySummaries[day];
    const b = dayBeforeTotals[day];
    const beforeKm = b.distMeters / 1000;
    const afterKm = (summary?.totalDistanceMeters || 0) / 1000;
    const afterDriveMin = summary?.totalDriveMinutes || 0;
    return {
      weekday: day,
      visitCount: summary?.totalVisits || b.visits,
      beforeKm,
      afterKm,
      beforeDriveMinutes: b.driveMinutes,
      afterDriveMinutes: afterDriveMin,
      kmSaved: beforeKm - afterKm,
      driveMinutesSaved: b.driveMinutes - afterDriveMin
    };
  });

  const workingDays = Math.max(1, inputs.workingDaysPerMonth || 21);
  const weekToMonthFactor = workingDays / 5;

  const kmSavedWeek = beforeWeekKm - afterWeekKm;
  const kmSavedPerDay = kmSavedWeek / 5;
  const kmSavedPerMonth = kmSavedPerDay * workingDays;

  const driveMinutesSavedWeek = beforeWeekDriveMinutes - afterWeekDriveMinutes;
  const driveMinutesSavedPerDay = driveMinutesSavedWeek / 5;
  const driveMinutesSavedPerMonth = driveMinutesSavedWeek * weekToMonthFactor;

  const fuelPrice = Math.max(0, inputs.fuelPricePerLitre || 0);
  const consumption = Math.max(0, inputs.fuelConsumptionLPer100Km || 0);
  const avgPrice = Math.max(0, inputs.avgPricePerVisitZar || 0);
  const marginFraction = Math.max(0, Math.min(100, inputs.grossMarginPercent || 0)) / 100;
  const breakEvenFee = Math.max(0, inputs.breakEvenMonthlyFeeZar || 0);

  const fuelCostPerKmZar = (consumption / 100) * fuelPrice;
  const positiveKmSavedMonth = Math.max(0, kmSavedPerMonth);
  const positiveDriveMinSavedMonth = Math.max(0, driveMinutesSavedPerMonth);
  const positiveDriveMinSavedWeek = Math.max(0, driveMinutesSavedWeek);

  const litresSavedPerMonth = positiveKmSavedMonth * (consumption / 100);

  // Three strictly separate figures (never added together)
  const fuelSavedPerMonthZar = positiveKmSavedMonth * fuelCostPerKmZar;
  const extraVisitsPossiblePerWeek =
    avgVisitLengthMinutes > 0 ? positiveDriveMinSavedWeek / avgVisitLengthMinutes : 0;
  const extraVisitsPossiblePerMonth =
    avgVisitLengthMinutes > 0 ? positiveDriveMinSavedMonth / avgVisitLengthMinutes : 0;
  const extraProfitPerMonthZar = extraVisitsPossiblePerMonth * avgPrice * marginFraction;
  const maxFeeAt25PctZar = fuelSavedPerMonthZar * 0.25;

  const makeScenario = (
    label: SavingsScenarioRow['label'],
    adjustmentPercent: number,
    factor: number
  ): SavingsScenarioRow => {
    const scenKmMonth = positiveKmSavedMonth * factor;
    const scenDriveMinMonth = positiveDriveMinSavedMonth * factor;
    const scenFuelSaved = scenKmMonth * fuelCostPerKmZar;
    const scenExtraVisits =
      avgVisitLengthMinutes > 0 ? scenDriveMinMonth / avgVisitLengthMinutes : 0;
    const scenExtraProfit = scenExtraVisits * avgPrice * marginFraction;
    const scenMaxFee = scenFuelSaved * 0.25;

    return {
      label,
      adjustmentPercent,
      kmSavedPerMonth: scenKmMonth,
      driveMinutesSavedPerMonth: scenDriveMinMonth,
      fuelSavedPerMonthZar: scenFuelSaved,
      extraVisitsPossiblePerMonth: scenExtraVisits,
      extraProfitPerMonthZar: scenExtraProfit,
      maxFeeAt25PctZar: scenMaxFee
    };
  };

  const scenarios: SavingsScenarioRow[] = [
    makeScenario('Low (-30%)', -30, 0.7),
    makeScenario('Base (0%)', 0, 1.0),
    makeScenario('High (+30%)', 30, 1.3)
  ];

  const breakEvenKmPerMonth = fuelCostPerKmZar > 0 ? breakEvenFee / fuelCostPerKmZar : 0;
  const breakEvenKmPerDay =
    fuelCostPerKmZar * workingDays > 0 ? breakEvenFee / (fuelCostPerKmZar * workingDays) : 0;

  return {
    visitCount,
    fleetSize,
    avgVisitLengthMinutes,
    beforeWeekKm,
    afterWeekKm,
    beforeWeekDriveMinutes,
    afterWeekDriveMinutes,
    kmSavedWeek,
    kmSavedPerDay,
    kmSavedPerMonth,
    driveMinutesSavedWeek,
    driveMinutesSavedPerDay,
    driveMinutesSavedPerMonth,
    fuelCostPerKmZar,
    litresSavedPerMonth,
    fuelSavedPerMonthZar,
    extraVisitsPossiblePerWeek,
    extraVisitsPossiblePerMonth,
    extraProfitPerMonthZar,
    maxFeeAt25PctZar,
    scenarios,
    breakEvenKmPerDay,
    breakEvenKmPerMonth,
    pastedMatchedCount,
    pastedUnmatchedLines,
    weekdayBreakdown
  };
}
