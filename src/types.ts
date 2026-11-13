/**
 * Types for Hamba Routes – Recurring Field Service Route Planner (Johannesburg, ZA)
 */

export interface LatLng {
  lat: number;
  lng: number;
  altitude?: number;
}

export type ServiceCategory = 'pool' | 'pest' | 'garden';

export type Species = 'dog' | 'cat' | 'bunny' | 'alpaca' | 'capybara';

export type UrgencyLevel = 'critical' | 'high' | 'standard';

export interface VehiclePreset {
  vehicleId: string;
  vehicleLabel: string;
  technicianName: string;
  color: string;
  depotName: string;
  depotAddress: string;
  depotLocation: LatLng;
  shiftDays: string; // e.g. 'Mon–Fri'
  shiftStart: string; // '07:00'
  shiftEnd: string; // '16:00'
}

export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

export const WEEKDAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri'
};

export const WEEKDAY_COLORS: Record<Weekday, string> = {
  Monday: '#38bdf8',    // Sky blue
  Tuesday: '#10b981',   // Emerald
  Wednesday: '#f59e0b', // Amber
  Thursday: '#a855f7',  // Purple
  Friday: '#ec4899'     // Rose/Pink
};

export interface FuelSettings {
  fuelPricePerLitre: number; // ZAR per litre (default R30)
  fuelConsumptionLPer100Km: number; // Litres per 100 km (default 10)
  businessName?: string; // Business name used in WhatsApp customer messages
}

export type TodayStopExecutionStatus = 'pending' | 'done' | 'skipped';

export interface TodayStopEntry {
  sequenceNumber: number;
  stop: PetStop;
  arrivalTime: string; // 24h 'HH:MM' traffic-aware ETA
  departureTime: string; // arrivalTime + durationMin
  legDistanceMeters: number;
  legDurationSeconds: number;
  status: TodayStopExecutionStatus;
}

export interface TodayRoutePlan {
  weekday: Weekday;
  vehicleId: string;
  vehicleLabel: string;
  technicianName: string;
  depotName: string;
  depotAddress: string;
  depotStop: PetStop;
  departureTimeStr: string;
  departureMinutes: number;
  startingFromStopName?: string;
  activeEntries: TodayStopEntry[];
  completedEntries: Array<{ stop: PetStop; status: 'done' | 'skipped' }>;
  overflowStops: PetStop[];
  waypointCapExceeded: boolean;
  maxWaypointsAllowed: number;
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDriveSeconds: number;
  totalServiceMinutes: number;
  returnToDepotTime: string;
  exceedsShift: boolean;
  source: 'routes_api_traffic' | 'estimated_traffic';
  warning?: string;
}

export type BaselineOrderMode = 'suburb' | 'alphabetical' | 'pasted';

export interface SavingsInputs {
  baselineMode: BaselineOrderMode;
  pastedOrderText: string;
  fuelPricePerLitre: number; // default R30
  fuelConsumptionLPer100Km: number; // default 10 L/100km
  workingDaysPerMonth: number; // default 21
  avgPricePerVisitZar: number; // editable ZAR
  grossMarginPercent: number; // default 30%
  breakEvenMonthlyFeeZar: number; // monthly fee user enters to test break-even km/day
}

export interface SavingsScenarioRow {
  label: 'Low (-30%)' | 'Base (0%)' | 'High (+30%)';
  adjustmentPercent: number;
  kmSavedPerMonth: number;
  driveMinutesSavedPerMonth: number;
  fuelSavedPerMonthZar: number;
  extraVisitsPossiblePerMonth: number;
  extraProfitPerMonthZar: number;
  maxFeeAt25PctZar: number;
}

export interface WeekdaySavingsBreakdown {
  weekday: Weekday;
  visitCount: number;
  beforeKm: number;
  afterKm: number;
  beforeDriveMinutes: number;
  afterDriveMinutes: number;
  kmSaved: number;
  driveMinutesSaved: number;
}

export interface SavingsAnalysisResult {
  visitCount: number;
  fleetSize: number;
  avgVisitLengthMinutes: number;
  beforeWeekKm: number;
  afterWeekKm: number;
  beforeWeekDriveMinutes: number;
  afterWeekDriveMinutes: number;
  kmSavedWeek: number;
  kmSavedPerDay: number;
  kmSavedPerMonth: number;
  driveMinutesSavedWeek: number;
  driveMinutesSavedPerDay: number;
  driveMinutesSavedPerMonth: number;
  fuelCostPerKmZar: number;
  litresSavedPerMonth: number;
  // (a) Fuel saved per month in ZAR
  fuelSavedPerMonthZar: number;
  // (b) Extra visits possible & extra profit if filled (NEVER summed with fuel saved)
  extraVisitsPossiblePerWeek: number;
  extraVisitsPossiblePerMonth: number;
  extraProfitPerMonthZar: number;
  // (c) Fee check: highest monthly fee at 25% of fuel saving
  maxFeeAt25PctZar: number;
  // Low / Base / High (-30% / 0 / +30%)
  scenarios: SavingsScenarioRow[];
  // Break-even calculation
  breakEvenKmPerDay: number;
  breakEvenKmPerMonth: number;
  // Pasted order match diagnostics
  pastedMatchedCount: number;
  pastedUnmatchedLines: string[];
  weekdayBreakdown: WeekdaySavingsBreakdown[];
}

export interface PetStop {
  id: string;
  order: number;
  name: string; // Customer name
  ownerName: string; // Contact / property label
  breed: string; // Suburb / Service category summary
  species: Species;
  serviceCategory?: ServiceCategory;
  suburb?: string;
  phone?: string; // +27 format
  weeklyFrequency?: string; // e.g. 'Weekly (Mon)', 'Twice Weekly'
  avatar: string;
  address: string;
  location: LatLng;
  serviceType: string;
  serviceCost: number; // ZAR
  personality: string; // Access / property notes
  urgency: UrgencyLevel;
  mudLevel: number; // 0 - 100
  fluffFactor: number; // 0 - 100
  timeWindow: {
    start: string;
    end: string;
  };
  durationMin: number; // 15 - 40 mins
  specialInstructions: string;
  notes?: string; // Optional access instructions, gate codes, or pet-friendly warnings
  funnyQuote: string;
  status: 'pending' | 'in-grooming' | 'completed';
  isPinned?: boolean;
  assignedVanId?: string; // 'van-1' | 'van-2' | 'van-3'
  vanOrder?: number;
  assignedWeekday?: Weekday;
  weekdayOrder?: number;
  actualArrival?: string;
  actualDeparture?: string;
  waitTimeMinutes?: number;
  timeWindowStatus?: 'on-time' | 'late' | 'early';
}

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  distanceMeters: number;
  distanceFormatted: string;
  durationSeconds: number;
  durationFormatted: string;
  pathCoordinates: LatLng[];
  encodedPolyline?: string;
  color: string;
  funnyHazard?: string;
  vanId?: string;
  vanLabel?: string;
  weekday?: Weekday;
}

export interface VehicleRoute {
  vehicleId: string;
  vehicleLabel: string;
  technicianName?: string;
  depotName?: string;
  depotAddress?: string;
  depotLocation?: LatLng;
  shiftSchedule?: string;
  color: string;
  orderedStops: PetStop[];
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalDurationMin: number;
  formattedTotalDistance: string;
  formattedTotalDuration: string;
  shiftDurationMinutes: number;
  formattedShiftDuration: string;
  revenue: number;
  appointmentCount: number;
}

export interface DayVehicleRoute {
  weekday: Weekday;
  vehicleId: string;
  vehicleLabel: string;
  technicianName?: string;
  depotName?: string;
  depotAddress?: string;
  depotLocation?: LatLng;
  color: string;
  orderedStops: PetStop[];
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  driveMinutes: number;
  serviceMinutes: number;
  shiftMinutes: number;
  returnTime: string;
  exceedsShift: boolean;
  visitCount: number;
  revenue: number;
}

export interface DaySummary {
  weekday: Weekday;
  color: string;
  totalVisits: number;
  totalDistanceMeters: number;
  totalDriveMinutes: number;
  totalServiceMinutes: number;
  totalRevenue: number;
  anyExceedsShift: boolean;
}

export interface WeekSchedulePlan {
  dayRoutes: DayVehicleRoute[];
  daySummaries: Record<Weekday, DaySummary>;
  totalDistanceMeters: number;
  totalDriveMinutes: number;
  totalVisits: number;
  overShiftCount: number;
}

export interface MatrixPairResult {
  nodeId: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface CachedMatrixEntry {
  cacheKey: string;
  source: 'google_routes_matrix' | 'estimated_fallback';
  fetchedAt: number;
  distancesByNodeId: Record<string, MatrixPairResult>;
}

export interface PlacementOption {
  weekday: Weekday;
  vehicleId: string;
  vehicleLabel: string;
  technicianName?: string;
  insertIndex: number;
  insertAfterName: string;
  extraDistanceMeters: number;
  extraKm: number;
  extraDriveMinutes: number;
  newShiftMinutes: number;
  newReturnTime: string;
  fitsShift: boolean;
  perVisitFuelCostZar: number;
  extraMonthlyFuelCostZar: number;
  monthlyVisitsCount: number;
}

export interface OptimizedRouteResult {
  orderedStops: PetStop[];
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalDurationMin: number;
  formattedTotalDistance: string;
  formattedTotalDuration: string;
  initialDistanceMeters: number;
  initialDurationSeconds: number;
  distanceSavedMeters: number;
  timeSavedMinutes: number;
  percentOptimized: number;
  fleetSize?: number;
  fleetAllocationMode?: 'auto' | 'manual';
  maxShiftHours?: number;
  vehicleRoutes?: VehicleRoute[];
  maxShiftDurationMinutes?: number;
  formattedMaxShiftDuration?: string;
  matrix?: MatrixCell[][];
}

export interface ScenarioComparison {
  id: string;
  name: string;
  formattedDistance: string;
  formattedDuration: string;
  distanceSavedFormatted: string;
  timeSavedFormatted: string;
  percentOptimized: number;
  timestamp: string;
  violationsCount?: number;
  formattedShiftDuration?: string;
  totalShiftMinutes?: number;
  cumulativeShiftMinutes?: number;
  formattedCumulativeShift?: string;
  maxSingleShiftMinutes?: number;
  formattedMaxSingleShift?: string;
  totalWaitMinutes?: number;
  totalDistanceMeters?: number;
  fleetSize?: number;
  maxShiftHours?: number;
  vehicleRoutes?: VehicleRoute[];
  stops?: PetStop[];
  legs?: RouteLeg[];
}

export interface MatrixCell {
  fromId: string;
  toId: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface FleetVanTelemetry {
  id: string;
  vanId?: string;
  label: string;
  color?: string;
  isDriving: boolean;
  currentStopIndex?: number;
  progressPercent?: number;
  speedKmh?: number;
  currentVanLocation?: LatLng;
  currentLocation?: LatLng;
  completedStopsCount?: number;
  totalStopsCount?: number;
  activePetName?: string;
}

export interface VanTelemetry {
  isDriving: boolean;
  currentStopIndex: number;
  progressPercent: number;
  speedKmh: number;
  shampooGallons: number;
  squeakyToys: number;
  treatCount: number;
  bubbleBlowerActive: boolean;
  currentVanLocation: LatLng;
  cameraFollowVan: boolean;
  fleetVans?: FleetVanTelemetry[];
}

export interface CityPreset {
  id: string;
  name: string;
  tagline: string;
  country: string;
  center: LatLng;
  zoom: number;
  camera3D: {
    heading: number;
    tilt: number;
    range: number;
    altitude: number;
  };
  stops: PetStop[];
}

