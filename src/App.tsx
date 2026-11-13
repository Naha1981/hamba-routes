import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PetStop,
  RouteLeg,
  OptimizedRouteResult,
  VanTelemetry,
  CityPreset,
  VehicleRoute,
  Weekday,
  FuelSettings,
  PlacementOption,
  WeekSchedulePlan,
  WEEKDAY_SHORT,
  WEEKDAYS,
  TodayRoutePlan,
  TodayStopExecutionStatus,
  SavingsInputs,
  SavingsAnalysisResult
} from './types';
import { CITY_PRESETS, JHB_VEHICLES, JHB_STOPS } from './data/mockPetStops';
import { calculateRouteResult, validateTimeWindows, validateFleet, clusterStopsGeographically } from './utils/tspSolver';
import { computeRealRouteLegs, computeFleetRouteLegs, computeTodayTrafficRoute } from './services/routesService';
import { assignWeekdayZones, buildWeekSchedulePlan, moveStopToWeekday } from './utils/weekdayZones';
import { calculateWeekSavings } from './utils/savingsCalculator';
import { formatDistance, formatDuration, densifyPolyline, generateCurvedStreetPoints } from './utils/geoUtils';
import { GmpMapCanvas } from './components/GmpMapCanvas';
import { RouteControls } from './components/RouteControls';
import { StopListSidebar } from './components/StopListSidebar';
import { VanDashboard } from './components/VanDashboard';
import { WeekZoneSidebar } from './components/WeekZoneSidebar';
import { WeekDashboard } from './components/WeekDashboard';
import { TodaysRoutePanel } from './components/TodaysRoutePanel';
import { SavingsPanel } from './components/SavingsPanel';
import { SettingsModal, DEFAULT_FUEL_SETTINGS } from './components/SettingsModal';
import { PlacementModal } from './components/PlacementModal';
import { AddPetModal } from './components/AddPetModal';
import { DebugSolverModal } from './components/DebugSolverModal';
import { SolverStep } from './components/OptimizationStepper';
import { ScenarioTesterModal } from './components/ScenarioTesterModal';
import { Sparkles, Compass, Truck, ListOrdered, Sliders, BarChart2, Moon, Sun, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Route, Users, AlertTriangle, Database, Settings, LogIn, LogOut, Cloud, Trash2, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, getFriendlyFirebaseError, testFirestoreConnection } from './firebase';
import {
  UserWorkspaceDoc,
  isDepotStop,
  subscribeToUserWorkspace,
  saveUserWorkspace,
  subscribeToCustomers,
  upsertCustomerStop,
  deleteCustomerStop,
  syncCustomerListToFirestore,
  deleteAllUserData
} from './services/firestoreService';

export const DEFAULT_CLIENT_STOPS = 15;
export const DEFAULT_FLEET_SIZE = 3;
export const MIN_CLIENT_STOPS = 6;
export const MAX_CLIENT_STOPS = 40;
export const MIN_FLEET_SIZE = 1;
export const MAX_FLEET_SIZE = 8;

export const VAN_COLORS = [
  '#3b82f6', // Vehicle 1: Blue
  '#10b981', // Vehicle 2: Emerald
  '#a855f7', // Vehicle 3: Purple
  '#f59e0b', // Vehicle 4: Amber
  '#ec4899', // Vehicle 5: Pink
  '#06b6d4', // Vehicle 6: Cyan
  '#84cc16', // Vehicle 7: Lime
  '#f97316'  // Vehicle 8: Orange
];
export const VAN_LABELS = ['Vehicle 01', 'Vehicle 02', 'Vehicle 03', 'Vehicle 04', 'Vehicle 05', 'Vehicle 06', 'Vehicle 07', 'Vehicle 08'];
export const VAN_COLOR_MAP: Record<string, string> = {
  'van-1': '#3b82f6',
  'van-2': '#10b981',
  'van-3': '#a855f7',
  'van-4': '#f59e0b',
  'van-5': '#ec4899',
  'van-6': '#06b6d4',
  'van-7': '#84cc16',
  'van-8': '#f97316'
};

export const calculateRequiredFleet = (visitCount: number, maxShiftHours: number = 9): number => {
  if (visitCount <= 0) return 1;
  const maxShiftMinutes = maxShiftHours * 60;
  for (let vehicles = 1; vehicles <= 8; vehicles++) {
    const stopsPerVehicle = Math.ceil(visitCount / vehicles);
    // Recurring field visits: 15-40m (avg ~27m) + ~8m transit + 30m depot overhead
    const estShift = stopsPerVehicle * 35 + 30;
    if (stopsPerVehicle <= 14 && (estShift <= maxShiftMinutes || vehicles === 8)) {
      return Math.min(8, Math.max(1, vehicles));
    }
  }
  return 3;
};

const buildStopsWithDepot = (city: CityPreset, fSize?: number, clientCount: number = DEFAULT_CLIENT_STOPS): PetStop[] => {
  const primaryPreset = JHB_VEHICLES[0];
  const depotStop: PetStop = {
    id: 'depot',
    order: 0,
    name: primaryPreset?.depotName || 'Hamba Routes Hub',
    ownerName: primaryPreset?.technicianName || 'Dispatch',
    breed: 'Depot Base',
    species: 'dog',
    avatar: '🏢',
    address: primaryPreset?.depotAddress || '84 Rivonia Rd, Sandown, Sandton',
    location: primaryPreset?.depotLocation || city.center,
    serviceType: 'Dispatch Depot',
    serviceCost: 0,
    personality: 'Mon–Fri 07:00–16:00 SAST',
    urgency: 'standard',
    mudLevel: 0,
    fluffFactor: 0,
    timeWindow: { start: '07:00', end: '16:00' },
    durationMin: 0,
    specialInstructions: 'Starting & ending vehicle depot',
    funnyQuote: 'Hamba Routes Johannesburg Dispatch',
    status: 'completed',
    isPinned: true
  };
  const count = Math.min(MAX_CLIENT_STOPS, Math.max(MIN_CLIENT_STOPS, clientCount));
  const visitStops = city.stops.slice(0, count);

  const rawVisits: PetStop[] = visitStops.map((p, pIdx) => ({
    ...p,
    order: pIdx + 1,
    assignedVanId: undefined,
    vanOrder: undefined
  }));

  return [depotStop, ...rawVisits];
};

const buildDepotOnly = (city: CityPreset): PetStop => {
  const primaryPreset = JHB_VEHICLES[0];
  return {
    id: 'depot',
    order: 0,
    name: primaryPreset?.depotName || 'Hamba Routes Hub',
    ownerName: primaryPreset?.technicianName || 'Dispatch',
    breed: 'Depot Base',
    species: 'dog',
    avatar: '🏢',
    address: primaryPreset?.depotAddress || '84 Rivonia Rd, Sandown, Sandton',
    location: primaryPreset?.depotLocation || city.center,
    serviceType: 'Dispatch Depot',
    serviceCost: 0,
    personality: 'Mon–Fri 07:00–16:00 SAST',
    urgency: 'standard',
    mudLevel: 0,
    fluffFactor: 0,
    timeWindow: { start: '07:00', end: '16:00' },
    durationMin: 0,
    specialInstructions: 'Starting & ending vehicle depot',
    funnyQuote: 'Hamba Routes Johannesburg Dispatch',
    status: 'completed',
    isPinned: true
  };
};

export const updateVanAssignments = (allStops: PetStop[], fSize: number): PetStop[] => {
  const depot = allStops.find(s => s.id === 'depot') || allStops[0];
  const visits = allStops.filter(s => s.id !== 'depot');

  const vanBuckets = clusterStopsGeographically(visits, fSize);

  const assignedVisits: PetStop[] = [];
  for (let v = 0; v < fSize; v++) {
    const vanId = `van-${v + 1}`;
    (vanBuckets[v] || []).forEach((p, pIdx) => {
      assignedVisits.push({
        ...p,
        assignedVanId: vanId,
        vanOrder: pIdx + 1
      });
    });
  }

  return [depot, ...assignedVisits];
};

export const buildBaselineFleetRoutes = (allStops: PetStop[], fSize: number) => {
  const depot = allStops.find(s => s.id === 'depot') || allStops[0];
  const visits = allStops.filter(s => s.id !== 'depot');

  const vanBuckets = clusterStopsGeographically(visits, fSize);

  return Array.from({ length: fSize }).map((_, vIdx) => {
    const vanId = `van-${vIdx + 1}`;
    const preset = JHB_VEHICLES[vIdx];
    const vanDepot: PetStop = preset
      ? {
          ...depot,
          id: 'depot',
          name: preset.depotName,
          ownerName: preset.technicianName,
          address: preset.depotAddress,
          location: preset.depotLocation
        }
      : depot;

    const vanVisits = (vanBuckets[vIdx] || []).map((p, pIdx) => ({
      ...p,
      assignedVanId: vanId,
      vanOrder: pIdx + 1
    }));

    const vanStops = [vanDepot, ...vanVisits];
    const vanColor = preset?.color || VAN_COLOR_MAP[vanId] || VAN_COLORS[vIdx] || '#3b82f6';
    const calc = calculateRouteResult(vanStops);
    const baselineLegs = calc.legs.map(l => ({
      ...l,
      vanId,
      vehicleId: vanId,
      color: vanColor
    }));
    const val = validateTimeWindows(vanStops, baselineLegs, 420);
    const vanRevenue = vanVisits.reduce((acc, p) => acc + (p.serviceCost || 0), 0) || (vanVisits.length * 450);

    return {
      vehicleId: vanId,
      vehicleLabel: preset?.vehicleLabel || VAN_LABELS[vIdx] || `Vehicle 0${vIdx + 1}`,
      technicianName: preset?.technicianName,
      depotName: preset?.depotName,
      depotAddress: preset?.depotAddress,
      depotLocation: preset?.depotLocation,
      shiftSchedule: preset ? `${preset.shiftDays} ${preset.shiftStart}–${preset.shiftEnd}` : 'Mon–Fri 07:00–16:00',
      color: vanColor,
      orderedStops: vanStops,
      stops: vanStops,
      legs: baselineLegs,
      appointmentCount: vanVisits.length,
      totalDistanceMeters: calc.totalDistanceMeters,
      totalDurationSeconds: calc.totalDurationSeconds,
      totalDurationMin: calc.totalDurationMin || Math.round(calc.totalDurationSeconds / 60),
      shiftDurationMinutes: val.totalShiftMinutes,
      formattedTotalDistance: calc.formattedTotalDistance,
      formattedTotalDuration: calc.formattedTotalDuration,
      formattedShiftDuration: val.formattedShiftDuration,
      revenue: vanRevenue
    };
  });
};

export function App() {
  const [selectedCityId, setSelectedCityId] = useState<string>('johannesburg');
  const currentCity = CITY_PRESETS.find(c => c.id === selectedCityId) || CITY_PRESETS[0];

  const [clientStopCount, setClientStopCount] = useState<number>(DEFAULT_CLIENT_STOPS);
  const [fleetAllocationMode, setFleetAllocationMode] = useState<'auto' | 'manual'>('manual');
  const [maxShiftHours, setMaxShiftHours] = useState<number>(9);
  const initialAutoFleet = DEFAULT_FLEET_SIZE;
  const [fleetSize, setFleetSize] = useState<number>(initialAutoFleet);
  const [fitBoundsKey, setFitBoundsKey] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'today' | 'savings'>('day');
  const [activeWeekdayFilter, setActiveWeekdayFilter] = useState<'all' | Weekday>('all');
  const [todayWeekday, setTodayWeekday] = useState<Weekday>(() => {
    const sast = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const day = sast.getUTCDay();
    if (day >= 1 && day <= 5) return WEEKDAYS[day - 1];
    return 'Monday';
  });
  const [todayVehicleId, setTodayVehicleId] = useState<string>('van-1');
  const [todayDepartureMinutes, setTodayDepartureMinutes] = useState<number>(420);
  const [todayStopStatuses, setTodayStopStatuses] = useState<Record<string, Record<string, TodayStopExecutionStatus>>>({});
  const [todayPlan, setTodayPlan] = useState<TodayRoutePlan | null>(null);
  const [isTodayLoading, setIsTodayLoading] = useState<boolean>(false);
  const [todayCalcCounter, setTodayCalcCounter] = useState<number>(0);
  const [fuelSettings, setFuelSettings] = useState<FuelSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_FUEL_SETTINGS;
    try {
      const saved = localStorage.getItem('hamba_fuel_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          fuelPricePerLitre: Number(parsed.fuelPricePerLitre) || DEFAULT_FUEL_SETTINGS.fuelPricePerLitre,
          fuelConsumptionLPer100Km: Number(parsed.fuelConsumptionLPer100Km) || DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km,
          businessName: typeof parsed.businessName === 'string' && parsed.businessName.trim()
            ? parsed.businessName.trim()
            : DEFAULT_FUEL_SETTINGS.businessName
        };
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_FUEL_SETTINGS;
  });
  const [savingsInputs, setSavingsInputs] = useState<SavingsInputs>(() => ({
    baselineMode: 'alphabetical',
    pastedOrderText: '',
    fuelPricePerLitre: DEFAULT_FUEL_SETTINGS.fuelPricePerLitre,
    fuelConsumptionLPer100Km: DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km,
    workingDaysPerMonth: 21,
    avgPricePerVisitZar: 500,
    grossMarginPercent: 30,
    breakEvenMonthlyFeeZar: 1500
  }));
  const [manualStops, setManualStops] = useState<PetStop[]>(() => {
    const base = buildStopsWithDepot(currentCity, initialAutoFleet, DEFAULT_CLIENT_STOPS);
    return assignWeekdayZones(base, initialAutoFleet, 420, 540, false).updatedStops;
  });
  const [stops, setStops] = useState<PetStop[]>(() => {
    const base = buildStopsWithDepot(currentCity, initialAutoFleet, DEFAULT_CLIENT_STOPS);
    return assignWeekdayZones(base, initialAutoFleet, 420, 540, false).updatedStops;
  });
  const [originalStops, setOriginalStops] = useState<PetStop[]>(() => {
    const base = buildStopsWithDepot(currentCity, initialAutoFleet, DEFAULT_CLIENT_STOPS);
    return assignWeekdayZones(base, initialAutoFleet, 420, 540, false).updatedStops;
  });
  const [selectedStop, setSelectedStop] = useState<PetStop | null>(() => {
    const initialStops = buildStopsWithDepot(currentCity, initialAutoFleet, DEFAULT_CLIENT_STOPS);
    return initialStops[1] || null; // Focus on the first client stop
  });
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [simStatus, setSimStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [hasOptimized, setHasOptimized] = useState<boolean>(false);
  const [showGrouping, setShowGrouping] = useState<boolean>(false);
  const [showPolylines, setShowPolylines] = useState<boolean>(false);
  const [simDirection, setSimDirection] = useState<'forward' | 'reverse'>('forward');
  const simDirectionRef = useRef<'forward' | 'reverse'>('forward');
  const [optimizationMode, setOptimizationMode] = useState<'time' | 'distance' | 'balanced'>('time');
  const [activeVanFilter, setActiveVanFilter] = useState<string>('all');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = localStorage.getItem('hamba_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage error
    }
    return 'dark';
  });
  const [isIntroDismissed, setIsIntroDismissed] = useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);
  const [routeWarning, setRouteWarning] = useState<{
    title: string;
    message: string;
    details?: string;
    type?: 'error' | 'warning';
  } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true);
    const handleMapError = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setMapError(detail?.message || 'Google Maps failed to load. Check your connection and retry.');
    };
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    window.addEventListener('gmp-map-error', handleMapError);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      window.removeEventListener('gmp-map-error', handleMapError);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('hamba_theme', theme);
    } catch {
      // Ignore storage error
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.style.colorScheme = theme;
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Responsive layout and orientation tracking
  const [screenSize, setScreenSize] = useState(() => {
    if (typeof window === 'undefined') return { width: 1200, height: 800, isLandscape: true };
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      isLandscape: window.innerWidth > window.innerHeight
    };
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
        isLandscape: window.innerWidth > window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isDesktop = screenSize.width >= 1024 && screenSize.height >= 550;
  const isMobileLandscape = !isDesktop && (screenSize.isLandscape || (screenSize.width >= 540 && screenSize.height < 550));

  const [activeMobileTab, setActiveMobileTab] = useState<'itinerary' | 'hud' | 'controls'>('controls');

  // Modals
  const [isAddPetOpen, setIsAddPetOpen] = useState<boolean>(false);
  const [editingStop, setEditingStop] = useState<PetStop | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPlacementOpen, setIsPlacementOpen] = useState<boolean>(false);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<{
    solverUsed: string;
    requestPayload?: any;
    responsePayload?: any;
    error?: string;
  } | null>(null);
  const [solverLogs, setSolverLogs] = useState<{
    timestamp: string;
    solverUsed: string;
    optimizationMode: 'time' | 'distance' | 'balanced';
    requestPayload?: any;
    responsePayload?: any;
    error?: string;
  }[]>([]);

  useEffect(() => {
    const handleApiCall = (e: any) => {
      const { type, request, response, error } = e.detail;
      const logItem = {
        timestamp: new Date().toLocaleTimeString(),
        solverUsed: type,
        optimizationMode: 'balanced' as const,
        requestPayload: request,
        responsePayload: response,
        error: error
      };
      setDebugInfo(logItem);
      setSolverLogs(prev => [logItem, ...prev]);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('routes-api-call', handleApiCall);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('routes-api-call', handleApiCall);
      }
    };
  }, []);

  const [solverStep, setSolverStep] = useState<SolverStep>('idle');
  const [simulatedMinutes, setSimulatedMinutes] = useState<number>(420);
  const [departureMinutes, setDepartureMinutes] = useState<number>(420);

  const parseTimeStrToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return NaN;
    const [hrs, mins] = timeStr.split(':').map(Number);
    if (isNaN(hrs) || isNaN(mins)) return NaN;
    return hrs * 60 + mins;
  };

  const formatMinutesToTimeStr = (totalMin?: number): string => {
    if (totalMin === undefined || totalMin === null || isNaN(totalMin)) return '';
    const hrs = Math.floor(totalMin / 60) % 24;
    const mins = Math.floor(totalMin % 60);
    const displayHrs = hrs < 10 ? `0${hrs}` : hrs;
    const displayMins = mins < 10 ? `0${mins}` : mins;
    return `${displayHrs}:${displayMins}`;
  };

  const handleDepartureTimeChange = (timeStr: string) => {
    const newMinutes = parseTimeStrToMinutes(timeStr);
    setDepartureMinutes(newMinutes);
    if (!isNaN(newMinutes)) {
      setSimulatedMinutes(newMinutes);
    }

    setTelemetry(prev => ({
      ...prev,
      isDriving: false,
      currentStopIndex: 0,
      currentVanLocation: currentCity.center
    }));

    if (!isNaN(newMinutes) && !isNaN(departureMinutes)) {
      const delta = newMinutes - departureMinutes;
      if (delta !== 0) {
        // Shift time windows for all stops
        const shiftWindow = (tw: { start: string; end: string }) => {
          const startMin = parseTimeStrToMinutes(tw.start) + delta;
          const endMin = parseTimeStrToMinutes(tw.end) + delta;
          return {
            start: formatMinutesToTimeStr(startMin),
            end: formatMinutesToTimeStr(endMin)
          };
        };

      const updateStopsList = (list: PetStop[]) => {
        return list.map(s => {
          if (s.id === 'depot' || !s.timeWindow) return s;
          return {
            ...s,
            timeWindow: shiftWindow(s.timeWindow)
          };
        });
      };

      setManualStops(prev => updateStopsList(prev));
      setOriginalStops(prev => updateStopsList(prev));

      setStops(prev => updateStopsList(prev));
      setHasOptimized(false);
      handleResetSimulation();
      }
    }
  };

  const formatSimulatedTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60) % 24;
    const mins = Math.floor(minutes % 60);
    const displayHrs = hrs < 10 ? `0${hrs}` : `${hrs}`;
    const displayMins = mins < 10 ? `0${mins}` : `${mins}`;
    return `${displayHrs}:${displayMins}`;
  };

  // Route calculation results
  const [routeResult, setRouteResult] = useState<OptimizedRouteResult>(() => {
    const initialStops = buildStopsWithDepot(currentCity, initialAutoFleet, DEFAULT_CLIENT_STOPS);
    const taggedStops = updateVanAssignments(initialStops, initialAutoFleet);
    const baselineVehicles = buildBaselineFleetRoutes(taggedStops, initialAutoFleet);
    return {
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: baselineVehicles,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: initialAutoFleet,
      maxShiftDurationMinutes: 0
    };
  });

  // Van Telemetry
  const [telemetry, setTelemetry] = useState<VanTelemetry>({
    isDriving: false,
    currentStopIndex: 0,
    progressPercent: 0,
    speedKmh: 0,
    shampooGallons: 45,
    squeakyToys: 300,
    treatCount: 180,
    bubbleBlowerActive: false,
    currentVanLocation: currentCity.center,
    cameraFollowVan: true
  });

  const simIntervalRef = useRef<any>(null);
  const simLegIndexRef = useRef<number>(0);
  const simCoordIndexRef = useRef<number>(0);
  const simServiceTicksRef = useRef<number>(0);
  const fleetTrackersRef = useRef<any[]>([]);
  const cityCacheRef = useRef<Record<string, {
    stops: PetStop[];
    manualStops: PetStop[];
    originalStops: PetStop[];
    routeResult: OptimizedRouteResult;
    hasOptimized: boolean;
    fleetSize: number;
    departureMinutes: number;
    simulatedMinutes: number;
  }>>({});

  // Firebase Auth & Firestore tenant sync state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncingFirestore, setIsSyncingFirestore] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeletingAllData, setIsDeletingAllData] = useState<boolean>(false);

  const knownCustomerIdsRef = useRef<Set<string>>(new Set());
  const workspaceExistsRef = useRef<boolean>(false);
  const wasSignedInRef = useRef<boolean>(false);
  const currentCityRef = useRef<CityPreset>(currentCity);
  currentCityRef.current = currentCity;
  const currentFuelRef = useRef<FuelSettings>(fuelSettings);
  currentFuelRef.current = fuelSettings;
  const currentSavingsRef = useRef<SavingsInputs>(savingsInputs);
  currentSavingsRef.current = savingsInputs;
  const currentFleetSizeRef = useRef<number>(fleetSize);
  currentFleetSizeRef.current = fleetSize;
  const currentMaxShiftRef = useRef<number>(maxShiftHours);
  currentMaxShiftRef.current = maxShiftHours;
  const currentDepartureRef = useRef<number>(departureMinutes);
  currentDepartureRef.current = departureMinutes;
  const hasOptimizedRef = useRef<boolean>(hasOptimized);
  hasOptimizedRef.current = hasOptimized;

  const persistWorkspace = async (uid: string, overrides?: Partial<UserWorkspaceDoc>) => {
    try {
      setIsSyncingFirestore(true);
      const payload: UserWorkspaceDoc = {
        businessName: currentFuelRef.current.businessName || 'Hamba Routes',
        fuelPricePerLitre: currentFuelRef.current.fuelPricePerLitre,
        fuelConsumptionLPer100Km: currentFuelRef.current.fuelConsumptionLPer100Km,
        maxShiftHours: currentMaxShiftRef.current,
        fleetSize: currentFleetSizeRef.current,
        workingDaysPerMonth: currentSavingsRef.current.workingDaysPerMonth,
        avgPricePerVisitZar: currentSavingsRef.current.avgPricePerVisitZar,
        grossMarginPercent: currentSavingsRef.current.grossMarginPercent,
        baselineMode: currentSavingsRef.current.baselineMode,
        pastedOrderText: currentSavingsRef.current.pastedOrderText,
        breakEvenMonthlyFeeZar: currentSavingsRef.current.breakEvenMonthlyFeeZar,
        departureMinutes: currentDepartureRef.current,
        ...overrides
      };
      await saveUserWorkspace(uid, payload, workspaceExistsRef.current);
      workspaceExistsRef.current = true;
      setSyncError(null);
    } catch (err) {
      setSyncError(getFriendlyFirebaseError(err));
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  const persistCustomerList = async (uid: string, nextStops: PetStop[]) => {
    try {
      setIsSyncingFirestore(true);
      const nextIds = await syncCustomerListToFirestore(uid, nextStops, knownCustomerIdsRef.current);
      knownCustomerIdsRef.current = nextIds;
      setSyncError(null);
    } catch (err) {
      setSyncError(getFriendlyFirebaseError(err));
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  const persistSingleCustomer = async (uid: string, stop: PetStop, existsOverride?: boolean) => {
    if (isDepotStop(stop)) return;
    const exists = existsOverride !== undefined ? existsOverride : knownCustomerIdsRef.current.has(stop.id);
    try {
      setIsSyncingFirestore(true);
      const docId = await upsertCustomerStop(uid, stop, exists);
      knownCustomerIdsRef.current.add(docId);
      setSyncError(null);
    } catch (err) {
      setSyncError(getFriendlyFirebaseError(err));
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  useEffect(() => {
    testFirestoreConnection().catch(() => {});
  }, []);

  useEffect(() => {
    let unsubWorkspace: (() => void) | null = null;
    let unsubCustomers: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubWorkspace) {
        unsubWorkspace();
        unsubWorkspace = null;
      }
      if (unsubCustomers) {
        unsubCustomers();
        unsubCustomers = null;
      }

      if (!firebaseUser) {
        knownCustomerIdsRef.current = new Set();
        workspaceExistsRef.current = false;
        setUser(null);
        setAuthLoading(false);

        if (wasSignedInRef.current) {
          wasSignedInRef.current = false;
          const guestStops = buildStopsWithDepot(currentCityRef.current, DEFAULT_FLEET_SIZE, DEFAULT_CLIENT_STOPS);
          const tagged = assignWeekdayZones(
            updateVanAssignments(guestStops, DEFAULT_FLEET_SIZE),
            DEFAULT_FLEET_SIZE,
            420,
            540,
            false
          ).updatedStops;
          setFleetSize(DEFAULT_FLEET_SIZE);
          setClientStopCount(DEFAULT_CLIENT_STOPS);
          setStops(tagged);
          setManualStops(tagged);
          setOriginalStops(tagged);
          setSelectedStop(tagged[1] || tagged[0]);
          setHasOptimized(false);
          setShowGrouping(false);
          setShowPolylines(false);
          setTodayStopStatuses({});
          setTodayPlan(null);
          setRouteResult({
            orderedStops: tagged,
            legs: [],
            vehicleRoutes: buildBaselineFleetRoutes(tagged, DEFAULT_FLEET_SIZE),
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            totalDurationMin: 0,
            formattedTotalDistance: '0.0 km',
            formattedTotalDuration: '0 min',
            initialDistanceMeters: 0,
            initialDurationSeconds: 0,
            distanceSavedMeters: 0,
            timeSavedMinutes: 0,
            percentOptimized: 0,
            fleetSize: DEFAULT_FLEET_SIZE,
            maxShiftDurationMinutes: 0
          });
        }
        return;
      }

      wasSignedInRef.current = true;
      setUser(firebaseUser);
      setAuthLoading(false);
      setAuthError(null);
      setSyncError(null);

      unsubWorkspace = subscribeToUserWorkspace(
        firebaseUser.uid,
        (ws, exists) => {
          workspaceExistsRef.current = exists;
          if (!ws) return;

          setFuelSettings({
            businessName: ws.businessName || 'Hamba Routes',
            fuelPricePerLitre: ws.fuelPricePerLitre || 30,
            fuelConsumptionLPer100Km: ws.fuelConsumptionLPer100Km || 10
          });
          if (ws.fleetSize && ws.fleetSize >= MIN_FLEET_SIZE && ws.fleetSize <= MAX_FLEET_SIZE) {
            setFleetSize(ws.fleetSize);
          }
          if (ws.maxShiftHours && ws.maxShiftHours >= 1 && ws.maxShiftHours <= 24) {
            setMaxShiftHours(ws.maxShiftHours);
          }
          if (typeof ws.departureMinutes === 'number' && ws.departureMinutes >= 0 && ws.departureMinutes < 1440) {
            setDepartureMinutes(ws.departureMinutes);
            setSimulatedMinutes(ws.departureMinutes);
          }
          setSavingsInputs(prev => ({
            ...prev,
            fuelPricePerLitre: ws.fuelPricePerLitre || prev.fuelPricePerLitre,
            fuelConsumptionLPer100Km: ws.fuelConsumptionLPer100Km || prev.fuelConsumptionLPer100Km,
            workingDaysPerMonth: ws.workingDaysPerMonth ?? prev.workingDaysPerMonth,
            avgPricePerVisitZar: ws.avgPricePerVisitZar ?? prev.avgPricePerVisitZar,
            grossMarginPercent: ws.grossMarginPercent ?? prev.grossMarginPercent,
            baselineMode: ws.baselineMode ?? prev.baselineMode,
            pastedOrderText: ws.pastedOrderText ?? prev.pastedOrderText,
            breakEvenMonthlyFeeZar: ws.breakEvenMonthlyFeeZar ?? prev.breakEvenMonthlyFeeZar
          }));
        },
        (err) => {
          setSyncError(getFriendlyFirebaseError(err));
        }
      );

      unsubCustomers = subscribeToCustomers(
        firebaseUser.uid,
        (customerStops, ids) => {
          knownCustomerIdsRef.current = ids;
          const depotStop = buildDepotOnly(currentCityRef.current);

          if (customerStops.length === 0) {
            const emptyList = [depotStop];
            setStops(emptyList);
            setManualStops(emptyList);
            setOriginalStops(emptyList);
            setClientStopCount(0);
            setSelectedStop(depotStop);
            setHasOptimized(false);
            setShowGrouping(false);
            setShowPolylines(false);
            setRouteResult({
              orderedStops: emptyList,
              legs: [],
              vehicleRoutes: [],
              totalDistanceMeters: 0,
              totalDurationSeconds: 0,
              totalDurationMin: 0,
              formattedTotalDistance: '0.0 km',
              formattedTotalDuration: '0 min',
              initialDistanceMeters: 0,
              initialDurationSeconds: 0,
              distanceSavedMeters: 0,
              timeSavedMinutes: 0,
              percentOptimized: 0,
              fleetSize: currentFleetSizeRef.current,
              maxShiftDurationMinutes: 0
            });
            return;
          }

          const activeFleet = currentFleetSizeRef.current;
          const combined = [depotStop, ...customerStops];
          const needsAssignment = customerStops.some(s => !s.assignedWeekday || !s.assignedVanId);
          const normalizedStops = needsAssignment
            ? assignWeekdayZones(
                updateVanAssignments(combined, activeFleet),
                activeFleet,
                currentDepartureRef.current,
                currentMaxShiftRef.current * 60,
                false
              ).updatedStops
            : combined;

          setStops(normalizedStops);
          setManualStops(normalizedStops);
          setOriginalStops(normalizedStops);
          setClientStopCount(customerStops.length);
          setSelectedStop(prev => {
            if (prev) {
              const found = normalizedStops.find(s => s.id === prev.id);
              if (found) return found;
            }
            return normalizedStops[1] || normalizedStops[0];
          });

          if (!hasOptimizedRef.current) {
            setRouteResult(prev => ({
              ...prev,
              orderedStops: normalizedStops,
              vehicleRoutes: buildBaselineFleetRoutes(normalizedStops, activeFleet),
              fleetSize: activeFleet
            }));
          }
        },
        (err) => {
          setSyncError(getFriendlyFirebaseError(err));
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubWorkspace) unsubWorkspace();
      if (unsubCustomers) unsubCustomers();
    };
  }, []);

  const handleSignInWithGoogle = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(getFriendlyFirebaseError(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setAuthError(getFriendlyFirebaseError(err));
    }
  };

  const handleConfirmDeleteAllData = async () => {
    if (!user) return;
    setIsDeletingAllData(true);
    setSyncError(null);
    try {
      await deleteAllUserData(user.uid);
      knownCustomerIdsRef.current = new Set();
      workspaceExistsRef.current = false;

      try {
        localStorage.removeItem('hamba_fuel_settings');
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith('hamba_matrix_cache_v1')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch {
        // Ignore storage errors
      }
      cityCacheRef.current = {};

      const depotOnly = [buildDepotOnly(currentCity)];
      setStops(depotOnly);
      setManualStops(depotOnly);
      setOriginalStops(depotOnly);
      setClientStopCount(0);
      setSelectedStop(depotOnly[0]);
      setHasOptimized(false);
      setShowGrouping(false);
      setShowPolylines(false);
      setTodayStopStatuses({});
      setTodayPlan(null);
      setFuelSettings(DEFAULT_FUEL_SETTINGS);
      setSavingsInputs({
        baselineMode: 'alphabetical',
        pastedOrderText: '',
        fuelPricePerLitre: DEFAULT_FUEL_SETTINGS.fuelPricePerLitre,
        fuelConsumptionLPer100Km: DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km,
        workingDaysPerMonth: 21,
        avgPricePerVisitZar: 500,
        grossMarginPercent: 30,
        breakEvenMonthlyFeeZar: 1500
      });
      setRouteResult({
        orderedStops: depotOnly,
        legs: [],
        vehicleRoutes: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalDurationMin: 0,
        formattedTotalDistance: '0.0 km',
        formattedTotalDuration: '0 min',
        initialDistanceMeters: 0,
        initialDurationSeconds: 0,
        distanceSavedMeters: 0,
        timeSavedMinutes: 0,
        percentOptimized: 0,
        fleetSize,
        maxShiftDurationMinutes: 0
      });
      handleResetSimulation();
      setIsDeleteModalOpen(false);
      setIsSettingsOpen(false);
    } catch (err) {
      setSyncError(getFriendlyFirebaseError(err));
    } finally {
      setIsDeletingAllData(false);
    }
  };

  const handleFleetSizeChange = (newFleetSize: number, mode: 'auto' | 'manual' = 'manual') => {
    const clamped = Math.max(MIN_FLEET_SIZE, Math.min(MAX_FLEET_SIZE, newFleetSize));
    setFleetSize(clamped);
    setFleetAllocationMode(mode);
    setActiveVanFilter('all');

    const baseForFleet = user ? stops : buildStopsWithDepot(currentCity, clamped, clientStopCount);
    const taggedStops = assignWeekdayZones(updateVanAssignments(baseForFleet, clamped), clamped, departureMinutes, maxShiftHours * 60, false).updatedStops;
    setManualStops(taggedStops);
    setStops(taggedStops);
    setOriginalStops(taggedStops);
    setSelectedStop(taggedStops[1] || taggedStops[0]);
    setHasOptimized(false);
    setShowGrouping(false);
    setShowPolylines(false);
    handleResetSimulation();

    setRouteResult({
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: user ? buildBaselineFleetRoutes(taggedStops, clamped) : [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: clamped,
      maxShiftDurationMinutes: 0
    });

    if (user) {
      persistWorkspace(user.uid, { fleetSize: clamped });
      if (taggedStops.some(s => !isDepotStop(s))) {
        persistCustomerList(user.uid, taggedStops);
      }
    }
  };

  const handleClientStopCountChange = (newCount: number) => {
    const clamped = Math.max(MIN_CLIENT_STOPS, Math.min(MAX_CLIENT_STOPS, newCount));
    setClientStopCount(clamped);
    setActiveVanFilter('all');

    let targetFleet = fleetSize;
    if (fleetAllocationMode === 'auto') {
      targetFleet = calculateRequiredFleet(clamped, maxShiftHours);
      setFleetSize(targetFleet);
    }

    const updatedStops = buildStopsWithDepot(currentCity, targetFleet, clamped);
    const taggedStops = assignWeekdayZones(updateVanAssignments(updatedStops, targetFleet), targetFleet, departureMinutes, maxShiftHours * 60, false).updatedStops;
    setManualStops(taggedStops);
    setStops(taggedStops);
    setOriginalStops(taggedStops);
    setSelectedStop(taggedStops[1] || taggedStops[0]);
    setHasOptimized(false);
    setShowGrouping(false);
    setShowPolylines(false);
    handleResetSimulation();

    setRouteResult({
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: targetFleet,
      maxShiftDurationMinutes: 0
    });

    if (user) {
      persistWorkspace(user.uid, { fleetSize: targetFleet });
      persistCustomerList(user.uid, taggedStops);
    }
  };

  const handleResetToDefaults = () => {
    setClientStopCount(DEFAULT_CLIENT_STOPS);
    setFleetSize(DEFAULT_FLEET_SIZE);
    setFleetAllocationMode('manual');
    setMaxShiftHours(9);
    setActiveVanFilter('all');
    setActiveWeekdayFilter('all');

    const defaultStops = buildStopsWithDepot(currentCity, DEFAULT_FLEET_SIZE, DEFAULT_CLIENT_STOPS);
    const taggedStops = assignWeekdayZones(updateVanAssignments(defaultStops, DEFAULT_FLEET_SIZE), DEFAULT_FLEET_SIZE, 420, 540, false).updatedStops;
    const baselineVehicles = buildBaselineFleetRoutes(taggedStops, DEFAULT_FLEET_SIZE);
    setManualStops(taggedStops);
    setStops(taggedStops);
    setOriginalStops(taggedStops);
    setSelectedStop(taggedStops[1] || taggedStops[0]);
    setHasOptimized(false);
    setShowGrouping(false);
    setShowPolylines(false);
    setDepartureMinutes(420);
    setSimulatedMinutes(420);
    setFitBoundsKey(k => k + 1);
    setTodayStopStatuses({});
    handleResetSimulation();

    setRouteResult({
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: baselineVehicles,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: DEFAULT_FLEET_SIZE,
      maxShiftDurationMinutes: 0
    });

    if (user) {
      persistWorkspace(user.uid, { fleetSize: DEFAULT_FLEET_SIZE, maxShiftHours: 9, departureMinutes: 420 });
      persistCustomerList(user.uid, taggedStops);
    }
  };

  const handleLoadDemoData = () => {
    const jhbCity = CITY_PRESETS.find(c => c.id === 'johannesburg') || currentCity;
    const demoStopsCount = JHB_STOPS.length; // 40 fictional Johannesburg customers
    const demoFleetSize = 3; // 3 vehicles (Sandton, Randburg, Midrand depots)

    setSelectedCityId(jhbCity.id);
    setClientStopCount(demoStopsCount);
    setFleetSize(demoFleetSize);
    setFleetAllocationMode('manual');
    setMaxShiftHours(9); // Mon-Fri 07:00-16:00
    setDepartureMinutes(420);
    setSimulatedMinutes(420);
    setActiveVanFilter('all');
    setActiveWeekdayFilter('all');
    setIsIntroDismissed(true);

    const demoStopsWithDepot = buildStopsWithDepot(jhbCity, demoFleetSize, demoStopsCount);
    const taggedStops = assignWeekdayZones(updateVanAssignments(demoStopsWithDepot, demoFleetSize), demoFleetSize, 420, 540, false).updatedStops;
    const baselineVehicles = buildBaselineFleetRoutes(taggedStops, demoFleetSize);

    setManualStops(taggedStops);
    setStops(taggedStops);
    setOriginalStops(taggedStops);
    setSelectedStop(taggedStops[1] || taggedStops[0]);
    setHasOptimized(false);
    setShowGrouping(false);
    setShowPolylines(false);
    setFitBoundsKey(k => k + 1);
    setTodayStopStatuses({});
    handleResetSimulation();

    setRouteResult({
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: baselineVehicles,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: demoFleetSize,
      maxShiftDurationMinutes: 0
    });

    if (user) {
      persistWorkspace(user.uid, { fleetSize: demoFleetSize, maxShiftHours: 9, departureMinutes: 420 });
      persistCustomerList(user.uid, taggedStops);
    }
  };

  const handleSelectFleetAllocationMode = (mode: 'auto' | 'manual') => {
    setFleetAllocationMode(mode);
    if (mode === 'auto') {
      const petCount = stops.filter(s => s.id !== 'depot').length;
      const autoSize = calculateRequiredFleet(petCount, maxShiftHours);
      handleFleetSizeChange(autoSize);
    }
  };

  const handleSelectMaxShiftHours = (hrs: number) => {
    setMaxShiftHours(hrs);
    if (fleetAllocationMode === 'auto') {
      const petCount = stops.filter(s => s.id !== 'depot').length;
      const autoSize = calculateRequiredFleet(petCount, hrs);
      handleFleetSizeChange(autoSize);
    }
  };

  // When city changes, cache current city and load/restore target city state
  const handleSelectCity = (cityId: string) => {
    const city = CITY_PRESETS.find(c => c.id === cityId);
    if (!city) return;

    // 1. Cache current city's route & stop state before switching
    if (selectedCityId) {
      cityCacheRef.current[selectedCityId] = {
        stops,
        manualStops,
        originalStops,
        routeResult,
        hasOptimized,
        fleetSize,
        departureMinutes,
        simulatedMinutes
      };
    }

    // 2. Stop any running simulation and clear van filter
    handleResetSimulation();
    setActiveVanFilter('all');
    setSelectedCityId(cityId);

    // 3. Check if target city has a cached state
    const cached = cityCacheRef.current[cityId];
    if (cached) {
      const cachedFleet = (cityId === 'new-york' && !cached.hasOptimized) ? DEFAULT_FLEET_SIZE : cached.fleetSize;
      setFleetSize(cachedFleet);
      setStops(cached.stops);
      setManualStops(cached.manualStops);
      setOriginalStops(cached.originalStops);
      setSelectedStop(cached.stops[1] || null);
      setHasOptimized(cached.hasOptimized);
      setRouteResult(cached.routeResult);
      setDepartureMinutes(cached.departureMinutes);
      setSimulatedMinutes(cached.simulatedMinutes || cached.departureMinutes);

      setTelemetry({
        isDriving: false,
        currentStopIndex: 0,
        progressPercent: 0,
        speedKmh: 0,
        shampooGallons: 45,
        squeakyToys: 300,
        treatCount: 180,
        bubbleBlowerActive: false,
        currentVanLocation: cached.stops[0]?.location || city.center,
        cameraFollowVan: true,
        fleetVans: undefined
      });
      return;
    }

    // 4. Initial state if target city has not been loaded/cached yet
    const targetClientCount = clientStopCount || DEFAULT_CLIENT_STOPS;
    const targetFleet = DEFAULT_FLEET_SIZE; // Default to 3 vans in NYC and SF
    setFleetSize(targetFleet);
    setClientStopCount(targetClientCount);
    
    const initialStops = buildStopsWithDepot(city, targetFleet, targetClientCount);
    const taggedStops = updateVanAssignments(initialStops, targetFleet);
    const baselineVehicles = buildBaselineFleetRoutes(taggedStops, targetFleet);

    setManualStops(taggedStops);
    setStops(taggedStops);
    setOriginalStops(taggedStops);
    setSelectedStop(taggedStops[1] || null); // Focus on first client pet
    setHasOptimized(false);
    setShowGrouping(false);
    setShowPolylines(false);

    setRouteResult({
      orderedStops: taggedStops,
      legs: [],
      vehicleRoutes: baselineVehicles,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize: targetFleet,
      maxShiftDurationMinutes: 0
    });

    setTelemetry({
      isDriving: false,
      currentStopIndex: 0,
      progressPercent: 0,
      speedKmh: 0,
      shampooGallons: 45,
      squeakyToys: 300,
      treatCount: 180,
      bubbleBlowerActive: false,
      currentVanLocation: city.center,
      cameraFollowVan: true,
      fleetVans: undefined
    });
    setSimulatedMinutes(420); // Reset clock to 07:00 SAST
    setDepartureMinutes(420);
  };

  const handleSelectOptimizationMode = (mode: 'time' | 'distance' | 'balanced') => {
    setOptimizationMode(mode);
  };


  // Plan route using Geographic Proximity Planner & Google Routes API
  const handleOptimizeRoute = async () => {
    setRouteWarning(null);
    const nonDepotStops = stops.filter(s => s.id !== 'depot');
    const pinnedCount = nonDepotStops.filter(s => s.isPinned).length;
    if (pinnedCount === nonDepotStops.length && nonDepotStops.length > 1) {
      setRouteWarning({
        title: 'All Visits Pinned',
        message: `All ${nonDepotStops.length} customer visits are pinned (locked in place).`,
        details: 'Because all visit locations are fixed, the planner cannot reorder stops. Unpin at least 2 customer visits to allow route optimisation.',
        type: 'warning'
      });
      return;
    }

    setIsOptimizing(true);
    setSolverStep('solver');

    const pinnedPositions = stops.map((s, idx) => ({ index: idx, stop: s })).filter(p => p.stop.isPinned || p.index === 0);

    let finalOrderedStops: PetStop[] = [];
    let finalDistanceMeters = 0;
    let finalDurationSeconds = 0;
    let usedSolver = 'Geographic Proximity Planner + Routes API';
    let solverRequest: any = null;
    let solverResponse: any = null;
    let solverError: string | undefined = undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const requestBody = {
        stops,
        keepFirstAsOrigin: true,
        optimizationMode,
        departureMinutes,
        fleetSize,
        fleetAllocationMode,
        maxShiftHours
      };
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      const data = await response.json().catch(() => null);

      if (
        response.status === 429 ||
        data?.error?.status === 'RESOURCE_EXHAUSTED' ||
        (typeof data?.error === 'string' && data.error.toLowerCase().includes('quota'))
      ) {
        setQuotaExceeded(true);
      }

      if (response.ok && data) {
        if (data.solverUsed) usedSolver = data.solverUsed;
        solverRequest = data.requestPayload || requestBody;
        solverResponse = data;
        const returnedVehicleRoutes = (data.vehicleRoutes && data.vehicleRoutes.length > 0)
          ? data.vehicleRoutes
          : (data.responsePayload?.vehicleRoutes && data.responsePayload.vehicleRoutes.length > 0)
          ? data.responsePayload.vehicleRoutes
          : null;

        if (returnedVehicleRoutes && returnedVehicleRoutes.length >= 1) {
          // Multi-Vehicle or Single Van Fleet Solution
          data.vehicleRoutes = returnedVehicleRoutes;
          finalOrderedStops = data.orderedStops || stops;
          finalDistanceMeters = data.totalDistanceMeters || returnedVehicleRoutes.reduce((acc: number, vr: any) => acc + (vr.totalDistanceMeters || 0), 0);
          finalDurationSeconds = data.totalDurationSeconds || returnedVehicleRoutes.reduce((acc: number, vr: any) => acc + (vr.totalDurationSeconds || 0), 0);
        } else if (data.orderedStops && data.orderedStops.length > 0) {
          // Single Van Solution
          const optimizedUnpinned = data.orderedStops.filter((s: any) => !s.isPinned && s.id !== 'depot');

          const mergedStops: PetStop[] = new Array(stops.length);
          pinnedPositions.forEach(p => {
            mergedStops[p.index] = p.stop;
          });

          let unpinnedCursor = 0;
          for (let i = 0; i < mergedStops.length; i++) {
            if (mergedStops[i] === undefined) {
              mergedStops[i] = optimizedUnpinned[unpinnedCursor++];
            }
          }

          finalOrderedStops = mergedStops.filter(s => s !== undefined).map((s, idx) => ({ ...s, order: idx + 1 }));

          const tempRoute = calculateRouteResult(finalOrderedStops);
          finalDistanceMeters = tempRoute.totalDistanceMeters;
          finalDurationSeconds = tempRoute.totalDurationSeconds;
        } else {
          solverError = data.error || 'Solver returned empty stops';
        }
      } else {
        const errorMsg =
          response.status === 429
            ? 'Google Maps Platform quota exceeded. Please try again later.'
            : data?.error?.message || data?.error || `API returned HTTP status ${response.status}`;
        solverError = errorMsg;
      }
    } catch (err: any) {
      console.warn('Route Planner call failed:', err);
      solverError = err.message || String(err);
    }

    if (finalOrderedStops.length === 0) {
      setSolverStep('completed');
      setIsOptimizing(false);
      const errorLog = {
        timestamp: new Date().toLocaleTimeString(),
        solverUsed: 'Geographic Proximity Planner + Routes API',
        optimizationMode,
        requestPayload: solverRequest || { stopsCount: stops.length },
        responsePayload: solverResponse,
        error: solverError || 'Unknown Error'
      };
      setDebugInfo(errorLog);
      setSolverLogs(prev => [errorLog, ...prev]);
      setRouteWarning({
        title: 'Route Planning Request Failed',
        message: solverError || 'Unable to compute optimal route. Check your network or API settings.',
        details: 'The existing stop sequence has been kept without changes. Click Retry to try again.',
        type: 'error'
      });
      return;
    }

    // Apply the optimized sequence and activate marker grouping colors first
    setStops(finalOrderedStops);
    if (user) {
      persistCustomerList(user.uid, finalOrderedStops);
    }
    setShowGrouping(true);
    setShowPolylines(false);
    setHasOptimized(false);
    
    // Set initial route result preserving vehicleRoutes so the layout does not jump
    const placeholderVehicleRoutes = (solverResponse?.vehicleRoutes && solverResponse.vehicleRoutes.length > 0)
      ? solverResponse.vehicleRoutes
      : routeResult.vehicleRoutes;
    const placeholderResult: OptimizedRouteResult = {
      orderedStops: finalOrderedStops,
      legs: [],
      vehicleRoutes: placeholderVehicleRoutes,
      totalDistanceMeters: finalDistanceMeters,
      totalDurationSeconds: finalDurationSeconds,
      totalDurationMin: Math.round(finalDurationSeconds / 60),
      formattedTotalDistance: `${(finalDistanceMeters / 1000).toFixed(1)} km`,
      formattedTotalDuration: `${Math.round(finalDurationSeconds / 60)} min`,
      initialDistanceMeters: routeResult.initialDistanceMeters || finalDistanceMeters,
      initialDurationSeconds: routeResult.initialDurationSeconds || finalDurationSeconds,
      distanceSavedMeters: Math.max(0, (routeResult.initialDistanceMeters || finalDistanceMeters) - finalDistanceMeters),
      timeSavedMinutes: Math.max(0, Math.round(((routeResult.initialDurationSeconds || finalDurationSeconds) - finalDurationSeconds) / 60)),
      percentOptimized: 0,
      fleetSize
    };
    setRouteResult(placeholderResult);

    // Save solver run stats for the debugger inspector panel
    const latestLog = {
      timestamp: new Date().toLocaleTimeString(),
      solverUsed: usedSolver,
      optimizationMode,
      requestPayload: solverRequest,
      responsePayload: solverResponse,
      error: solverError
    };
    setDebugInfo(latestLog);
    setSolverLogs(prev => [latestLog, ...prev]);

    // Try fetching real Google Maps Routes API polylines for high-quality route lines
    setSolverStep('routes');
    await new Promise(resolve => setTimeout(resolve, 800)); // Brief delay for user to read step 3

    try {
      const targetVehicleRoutes = (solverResponse?.vehicleRoutes && solverResponse.vehicleRoutes.length >= 1)
        ? solverResponse.vehicleRoutes
        : null;

      if (targetVehicleRoutes && targetVehicleRoutes.length >= 1) {
        // Fleet Polylines Computation (1 or more vans)
        const fleetRoutesWithLegs = await computeFleetRouteLegs(targetVehicleRoutes, departureMinutes);
        
        // Flatten legs across all vehicles for map rendering
        const allFleetLegs: RouteLeg[] = [];
        let totalFleetDistance = 0;
        let totalFleetDrivingSecs = 0;
        let maxFleetShiftMinutes = 0;
        let cumFleetShiftMinutes = 0;
        let totalWaitMinutes = 0;
        let totalViolations = 0;

        fleetRoutesWithLegs.forEach((vr) => {
          vr.legs.forEach(leg => allFleetLegs.push(leg));
          totalFleetDistance += vr.totalDistanceMeters || 0;
          totalFleetDrivingSecs += vr.totalDurationSeconds || 0;

          // Validate timeline for each vehicle to calculate its shift time
          const vanStopsToValidate = vr.stops || vr.orderedStops || [];
          const vanValidation = validateTimeWindows(vanStopsToValidate, vr.legs || [], departureMinutes);
          totalViolations += vanValidation.violationsCount;
          totalWaitMinutes += vanValidation.totalWaitMinutes;
          cumFleetShiftMinutes += vanValidation.totalShiftMinutes;
          if (vanValidation.totalShiftMinutes > maxFleetShiftMinutes) {
            maxFleetShiftMinutes = vanValidation.totalShiftMinutes;
          }

          // Synchronize vehicle route shift durations to include timeline transit, service, and wait times
          vr.shiftDurationMinutes = vanValidation.totalShiftMinutes;
          vr.formattedShiftDuration = vanValidation.formattedShiftDuration;
        });

        const formattedDistance = (totalFleetDistance / 1000).toFixed(1) + ' km';
        const formattedDuration = formatDuration(totalFleetDrivingSecs);
        const cumShiftHrs = Math.floor(cumFleetShiftMinutes / 60);
        const cumShiftMins = cumFleetShiftMinutes % 60;
        const formattedCumShift = cumShiftHrs > 0 ? `${cumShiftHrs}h ${cumShiftMins}m` : `${cumShiftMins}m`;

        const maxShiftHrs = Math.floor(maxFleetShiftMinutes / 60);
        const maxShiftMins = maxFleetShiftMinutes % 60;
        const formattedMaxShift = maxShiftHrs > 0 ? `${maxShiftHrs}h ${maxShiftMins}m` : `${maxShiftMins}m`;

        const calculatedRouteResult = {
          orderedStops: finalOrderedStops,
          legs: allFleetLegs,
          vehicleRoutes: fleetRoutesWithLegs,
          totalDistanceMeters: totalFleetDistance,
          totalDurationSeconds: totalFleetDrivingSecs,
          totalDurationMin: Math.round(totalFleetDrivingSecs / 60),
          formattedTotalDistance: formattedDistance,
          formattedTotalDuration: formattedDuration,
          maxShiftDurationMinutes: maxFleetShiftMinutes,
          formattedMaxShiftDuration: `${formattedMaxShift} max`,
          initialDistanceMeters: totalFleetDistance,
          initialDurationSeconds: totalFleetDrivingSecs,
          distanceSavedMeters: 0,
          timeSavedMinutes: 0,
          percentOptimized: 0,
          fleetSize: fleetRoutesWithLegs.length
        };

        setRouteResult(calculatedRouteResult);

        // Update cache for this city
        if (selectedCityId) {
          cityCacheRef.current[selectedCityId] = {
            stops: finalOrderedStops,
            manualStops: finalOrderedStops,
            originalStops: finalOrderedStops,
            routeResult: calculatedRouteResult,
            hasOptimized: true,
            fleetSize: fleetRoutesWithLegs.length,
            departureMinutes,
            simulatedMinutes: departureMinutes
          };
        }
      } else {
        // Solo Van Real Legs Computation
        const realLegs = await computeRealRouteLegs(finalOrderedStops, departureMinutes);
        if (realLegs && realLegs.length > 0) {
          let totalDistance = 0;
          let totalDuration = 0;
          realLegs.forEach(leg => {
            totalDistance += leg.distanceMeters || 0;
            totalDuration += leg.durationSeconds || 0;
          });

          const formattedDistance = (totalDistance / 1000).toFixed(1) + ' km';
          const formattedDuration = formatDuration(totalDuration);
          const vanValidation = validateTimeWindows(finalOrderedStops, realLegs, departureMinutes);
          const nonDepotStops = finalOrderedStops.filter(s => s.id !== 'depot');
          const vanRevenue = nonDepotStops.reduce((acc, s) => acc + (s.serviceCost || 450), 0) || (nonDepotStops.length * 450);
          const soloPreset = JHB_VEHICLES[0];

          const soloVehicleRoute: VehicleRoute = {
            vehicleId: 'van-1',
            vehicleLabel: soloPreset?.vehicleLabel || 'Vehicle 01',
            technicianName: soloPreset?.technicianName,
            depotName: soloPreset?.depotName,
            depotAddress: soloPreset?.depotAddress,
            depotLocation: soloPreset?.depotLocation,
            shiftSchedule: soloPreset ? `${soloPreset.shiftDays} ${soloPreset.shiftStart}–${soloPreset.shiftEnd}` : 'Mon–Fri 07:00–16:00',
            color: '#3b82f6',
            appointmentCount: nonDepotStops.length,
            totalDistanceMeters: totalDistance,
            totalDurationSeconds: totalDuration,
            totalDurationMin: Math.round(totalDuration / 60),
            shiftDurationMinutes: vanValidation.totalShiftMinutes,
            formattedTotalDistance: formattedDistance,
            formattedTotalDuration: formattedDuration,
            formattedShiftDuration: vanValidation.formattedShiftDuration,
            revenue: vanRevenue,
            orderedStops: finalOrderedStops,
            legs: realLegs
          };

          const calculatedRouteResult: OptimizedRouteResult = {
            orderedStops: finalOrderedStops,
            legs: realLegs,
            vehicleRoutes: [soloVehicleRoute],
            totalDistanceMeters: totalDistance,
            totalDurationSeconds: totalDuration,
            totalDurationMin: Math.round(totalDuration / 60),
            formattedTotalDistance: formattedDistance,
            formattedTotalDuration: formattedDuration,
            maxShiftDurationMinutes: vanValidation.totalShiftMinutes,
            formattedMaxShiftDuration: vanValidation.formattedShiftDuration,
            initialDistanceMeters: totalDistance,
            initialDurationSeconds: totalDuration,
            distanceSavedMeters: 0,
            timeSavedMinutes: 0,
            percentOptimized: 0,
            fleetSize: 1
          };

          setRouteResult(calculatedRouteResult);

          if (selectedCityId) {
            cityCacheRef.current[selectedCityId] = {
              stops: finalOrderedStops,
              manualStops: finalOrderedStops,
              originalStops: finalOrderedStops,
              routeResult: calculatedRouteResult,
              hasOptimized: true,
              fleetSize: 1,
              departureMinutes,
              simulatedMinutes: departureMinutes
            };
          }
        }
      }
    } catch (e) {
      console.warn('Real legs fetch skipped:', e);
    } finally {
      setShowPolylines(true);
      setHasOptimized(true);
      setSolverStep('completed');
      setIsOptimizing(false);
    }

    // Celebrate optimization victory!
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 }
    });
  };

  // Swap two stops by ID
  const handleSwapStops = (stopIdA: string, stopIdB: string) => {
    if (!stopIdA || !stopIdB || stopIdA === stopIdB) return;
    if (stopIdA === 'depot' || stopIdB === 'depot') return;

    handleResetSimulation();

    // 1. IF ROUTE HAS BEEN OPTIMIZED WITH VEHICLE ROUTES (Multi-van or Solo Fleet):
    if (hasOptimized && routeResult.vehicleRoutes && routeResult.vehicleRoutes.length > 0) {
      const depot = stops.find(s => s.id === 'depot') || stops[0];

      // Find which vehicle route contains each stop
      const vrIndexA = routeResult.vehicleRoutes.findIndex(vr => {
        const vStops = vr.orderedStops || (vr as any).stops || [];
        return vStops.some((s: PetStop) => s.id === stopIdA);
      });
      const vrIndexB = routeResult.vehicleRoutes.findIndex(vr => {
        const vStops = vr.orderedStops || (vr as any).stops || [];
        return vStops.some((s: PetStop) => s.id === stopIdB);
      });

      if (vrIndexA >= 0 && vrIndexB >= 0) {
        const updatedVehicleRoutes = [...routeResult.vehicleRoutes];

        if (vrIndexA === vrIndexB) {
          // Both stops belong to the same van route
          const vr = updatedVehicleRoutes[vrIndexA];
          const vanStops = [...(vr.orderedStops || (vr as any).stops || [])];
          const sIdxA = vanStops.findIndex(s => s.id === stopIdA);
          const sIdxB = vanStops.findIndex(s => s.id === stopIdB);

          if (sIdxA >= 0 && sIdxB >= 0) {
            const temp = vanStops[sIdxA];
            vanStops[sIdxA] = vanStops[sIdxB];
            vanStops[sIdxB] = temp;

            let pOrder = 1;
            const updatedVanStops = vanStops.map(s => {
              if (s.id === 'depot') return s;
              return { ...s, vanOrder: pOrder++ };
            });

            const calc = calculateRouteResult(updatedVanStops);
            const vanId = vr.vehicleId || `van-${vrIndexA + 1}`;
            const vanColor = vr.color || VAN_COLOR_MAP[vanId] || VAN_COLORS[vrIndexA % VAN_COLORS.length] || '#3b82f6';
            const vanLegs = calc.legs.map(l => ({
              ...l,
              vanId,
              vehicleId: vanId,
              vanLabel: vr.vehicleLabel || `Vehicle 0${vrIndexA + 1}`,
              color: vanColor
            }));
            const vanVal = validateTimeWindows(updatedVanStops, vanLegs, departureMinutes);

            updatedVehicleRoutes[vrIndexA] = {
              ...vr,
              orderedStops: updatedVanStops,
              legs: vanLegs,
              totalDistanceMeters: calc.totalDistanceMeters,
              totalDurationSeconds: calc.totalDurationSeconds,
              totalDurationMin: calc.totalDurationMin || Math.round(calc.totalDurationSeconds / 60),
              formattedTotalDistance: calc.formattedTotalDistance,
              formattedTotalDuration: calc.formattedTotalDuration,
              shiftDurationMinutes: vanVal.totalShiftMinutes,
              formattedShiftDuration: vanVal.formattedShiftDuration,
              appointmentCount: updatedVanStops.filter(s => s.id !== 'depot').length,
              revenue: updatedVanStops.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
            };
          }
        } else {
          // Stops belong to different vans (e.g. Van 1 and Van 2)
          const vrA = updatedVehicleRoutes[vrIndexA];
          const vrB = updatedVehicleRoutes[vrIndexB];

          const vanStopsA = [...(vrA.orderedStops || (vrA as any).stops || [])];
          const vanStopsB = [...(vrB.orderedStops || (vrB as any).stops || [])];

          const sIdxA = vanStopsA.findIndex(s => s.id === stopIdA);
          const sIdxB = vanStopsB.findIndex(s => s.id === stopIdB);

          if (sIdxA >= 0 && sIdxB >= 0) {
            const stopA = vanStopsA[sIdxA];
            const stopB = vanStopsB[sIdxB];

            const vanIdA = vrA.vehicleId || `van-${vrIndexA + 1}`;
            const vanIdB = vrB.vehicleId || `van-${vrIndexB + 1}`;

            vanStopsA[sIdxA] = { ...stopB, assignedVanId: vanIdA };
            vanStopsB[sIdxB] = { ...stopA, assignedVanId: vanIdB };

            let pOrderA = 1;
            const updatedVanStopsA = vanStopsA.map(s => (s.id === 'depot' ? s : { ...s, vanOrder: pOrderA++ }));
            let pOrderB = 1;
            const updatedVanStopsB = vanStopsB.map(s => (s.id === 'depot' ? s : { ...s, vanOrder: pOrderB++ }));

            const calcA = calculateRouteResult(updatedVanStopsA);
            const vanColorA = vrA.color || VAN_COLOR_MAP[vanIdA] || VAN_COLORS[vrIndexA % VAN_COLORS.length] || '#3b82f6';
            const vanLegsA = calcA.legs.map(l => ({
              ...l,
              vanId: vanIdA,
              vehicleId: vanIdA,
              vanLabel: vrA.vehicleLabel || `Vehicle 0${vrIndexA + 1}`,
              color: vanColorA
            }));
            const vanValA = validateTimeWindows(updatedVanStopsA, vanLegsA, departureMinutes);

            const calcB = calculateRouteResult(updatedVanStopsB);
            const vanColorB = vrB.color || VAN_COLOR_MAP[vanIdB] || VAN_COLORS[vrIndexB % VAN_COLORS.length] || '#3b82f6';
            const vanLegsB = calcB.legs.map(l => ({
              ...l,
              vanId: vanIdB,
              vehicleId: vanIdB,
              vanLabel: vrB.vehicleLabel || `Vehicle 0${vrIndexB + 1}`,
              color: vanColorB
            }));
            const vanValB = validateTimeWindows(updatedVanStopsB, vanLegsB, departureMinutes);

            updatedVehicleRoutes[vrIndexA] = {
              ...vrA,
              orderedStops: updatedVanStopsA,
              legs: vanLegsA,
              totalDistanceMeters: calcA.totalDistanceMeters,
              totalDurationSeconds: calcA.totalDurationSeconds,
              totalDurationMin: calcA.totalDurationMin || Math.round(calcA.totalDurationSeconds / 60),
              formattedTotalDistance: calcA.formattedTotalDistance,
              formattedTotalDuration: calcA.formattedTotalDuration,
              shiftDurationMinutes: vanValA.totalShiftMinutes,
              formattedShiftDuration: vanValA.formattedShiftDuration,
              appointmentCount: updatedVanStopsA.filter(s => s.id !== 'depot').length,
              revenue: updatedVanStopsA.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
            };

            updatedVehicleRoutes[vrIndexB] = {
              ...vrB,
              orderedStops: updatedVanStopsB,
              legs: vanLegsB,
              totalDistanceMeters: calcB.totalDistanceMeters,
              totalDurationSeconds: calcB.totalDurationSeconds,
              totalDurationMin: calcB.totalDurationMin || Math.round(calcB.totalDurationSeconds / 60),
              formattedTotalDistance: calcB.formattedTotalDistance,
              formattedTotalDuration: calcB.formattedTotalDuration,
              shiftDurationMinutes: vanValB.totalShiftMinutes,
              formattedShiftDuration: vanValB.formattedShiftDuration,
              appointmentCount: updatedVanStopsB.filter(s => s.id !== 'depot').length,
              revenue: updatedVanStopsB.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
            };
          }
        }

        // Build global stops sequence matching the updated vehicleRoutes sequence
        let globalOrder = 1;
        const allNewStops = [
          { ...depot, order: 1 },
          ...updatedVehicleRoutes.flatMap(vr =>
            (vr.orderedStops || [])
              .filter(s => s.id !== 'depot')
              .map(s => ({ ...s, order: ++globalOrder }))
          )
        ];

        const allLegs = updatedVehicleRoutes.flatMap(vr => vr.legs || []);
        const totalDist = updatedVehicleRoutes.reduce((sum, vr) => sum + (vr.totalDistanceMeters || 0), 0);
        const totalDur = updatedVehicleRoutes.reduce((sum, vr) => sum + (vr.totalDurationSeconds || 0), 0);
        const maxShift = Math.max(...updatedVehicleRoutes.map(vr => vr.shiftDurationMinutes || 0), 0);
        const maxShiftHrs = Math.floor(maxShift / 60);
        const maxShiftMins = maxShift % 60;
        const formattedMaxShift = maxShiftHrs > 0 ? `${maxShiftHrs}h ${maxShiftMins}m` : `${maxShiftMins}m`;

        setStops(allNewStops);
        setManualStops(allNewStops);
        setOriginalStops(allNewStops);

        const updatedResult: OptimizedRouteResult = {
          ...routeResult,
          orderedStops: allNewStops,
          legs: allLegs,
          vehicleRoutes: updatedVehicleRoutes,
          totalDistanceMeters: totalDist,
          totalDurationSeconds: totalDur,
          totalDurationMin: Math.round(totalDur / 60),
          formattedTotalDistance: formatDistance(totalDist),
          formattedTotalDuration: formatDuration(totalDur),
          maxShiftDurationMinutes: maxShift,
          formattedMaxShiftDuration: `${formattedMaxShift} max`
        };

        setRouteResult(updatedResult);

        if (selectedCityId) {
          cityCacheRef.current[selectedCityId] = {
            stops: allNewStops,
            manualStops: allNewStops,
            originalStops: allNewStops,
            routeResult: updatedResult,
            hasOptimized: true,
            fleetSize,
            departureMinutes,
            simulatedMinutes: departureMinutes
          };
        }

        if (user) persistCustomerList(user.uid, allNewStops);

        computeFleetRouteLegs(updatedVehicleRoutes, departureMinutes).catch(err =>
          console.warn('Reordered fleet routing background update:', err)
        );
        return;
      }
    }

    // 2. SOLO VAN OR UNOPTIMIZED ROUTE:
    const currentList = [...stops];
    const idxA = currentList.findIndex(s => s.id === stopIdA);
    const idxB = currentList.findIndex(s => s.id === stopIdB);
    if (idxA < 0 || idxB < 0 || idxA === idxB) return;
    if (currentList[idxA].id === 'depot' || currentList[idxB].id === 'depot') return;

    const temp = currentList[idxA];
    currentList[idxA] = currentList[idxB];
    currentList[idxB] = temp;

    const reordered = currentList.map((s, idx) => ({ ...s, order: idx + 1 }));
    setManualStops(reordered);
    setStops(reordered);
    setOriginalStops(reordered);
    if (user) persistCustomerList(user.uid, reordered);

    if (hasOptimized) {
      const calc = calculateRouteResult(reordered);
      const val = validateTimeWindows(reordered, calc.legs, departureMinutes);
      const singlePets = reordered.filter(s => s.id !== 'depot');
      const soloPreset = JHB_VEHICLES[0];
      const singleVr: VehicleRoute = {
        vehicleId: 'van-1',
        vehicleLabel: soloPreset?.vehicleLabel || 'Vehicle 01',
        technicianName: soloPreset?.technicianName,
        depotName: soloPreset?.depotName,
        depotAddress: soloPreset?.depotAddress,
        depotLocation: soloPreset?.depotLocation,
        shiftSchedule: soloPreset ? `${soloPreset.shiftDays} ${soloPreset.shiftStart}–${soloPreset.shiftEnd}` : 'Mon–Fri 07:00–16:00',
        color: VAN_COLORS[0],
        orderedStops: reordered,
        legs: calc.legs.map(l => ({ ...l, vanId: 'van-1', color: VAN_COLORS[0] })),
        totalDistanceMeters: calc.totalDistanceMeters,
        totalDurationSeconds: calc.totalDurationSeconds,
        totalDurationMin: calc.totalDurationMin || Math.round(calc.totalDurationSeconds / 60),
        formattedTotalDistance: calc.formattedTotalDistance,
        formattedTotalDuration: calc.formattedTotalDuration,
        shiftDurationMinutes: val.totalShiftMinutes,
        formattedShiftDuration: val.formattedShiftDuration,
        appointmentCount: singlePets.length,
        revenue: singlePets.reduce((acc, p) => acc + (p.serviceCost || 450), 0)
      };

      const updatedResult: OptimizedRouteResult = {
        ...routeResult,
        orderedStops: reordered,
        legs: singleVr.legs,
        vehicleRoutes: [singleVr],
        totalDistanceMeters: calc.totalDistanceMeters,
        totalDurationSeconds: calc.totalDurationSeconds,
        totalDurationMin: Math.round(calc.totalDurationSeconds / 60),
        formattedTotalDistance: calc.formattedTotalDistance,
        formattedTotalDuration: calc.formattedTotalDuration,
        maxShiftDurationMinutes: val.totalShiftMinutes,
        formattedMaxShiftDuration: val.formattedShiftDuration
      };

      setRouteResult(updatedResult);

      if (selectedCityId) {
        cityCacheRef.current[selectedCityId] = {
          stops: reordered,
          manualStops: reordered,
          originalStops: reordered,
          routeResult: updatedResult,
          hasOptimized: true,
          fleetSize: 1,
          departureMinutes,
          simulatedMinutes: departureMinutes
        };
      }

      computeRealRouteLegs(reordered, departureMinutes).catch(err =>
        console.warn('Reordered solo routing background update:', err)
      );
    } else {
      setRouteResult(prev => ({
        ...prev,
        orderedStops: reordered
      }));
    }
  };

  // Reorder stop via drag-and-drop on press and release of mouse
  const handleReorderStop = (sourceStopId: string, targetStopId: string, position: 'before' | 'after' = 'before') => {
    if (!sourceStopId || !targetStopId || sourceStopId === targetStopId) return;
    if (sourceStopId === 'depot' || targetStopId === 'depot') return;

    handleResetSimulation();

    // 1. IF ROUTE HAS BEEN OPTIMIZED WITH VEHICLE ROUTES (Multi-van or Solo Fleet):
    if (hasOptimized && routeResult.vehicleRoutes && routeResult.vehicleRoutes.length > 0) {
      const depot = stops.find(s => s.id === 'depot') || stops[0];

      // Find which vehicle route contains each stop
      const vrIndexSource = routeResult.vehicleRoutes.findIndex(vr => {
        const vStops = vr.orderedStops || (vr as any).stops || [];
        return vStops.some((s: PetStop) => s.id === sourceStopId);
      });
      const vrIndexTarget = routeResult.vehicleRoutes.findIndex(vr => {
        const vStops = vr.orderedStops || (vr as any).stops || [];
        return vStops.some((s: PetStop) => s.id === targetStopId);
      });

      if (vrIndexSource >= 0 && vrIndexTarget >= 0) {
        const updatedVehicleRoutes = [...routeResult.vehicleRoutes];

        if (vrIndexSource === vrIndexTarget) {
          // Reorder within the same van route
          const vr = updatedVehicleRoutes[vrIndexSource];
          const vanStops = [...(vr.orderedStops || (vr as any).stops || [])];
          const sIdx = vanStops.findIndex(s => s.id === sourceStopId);
          if (sIdx < 0) return;
          const [movedStop] = vanStops.splice(sIdx, 1);

          const tIdx = vanStops.findIndex(s => s.id === targetStopId);
          if (tIdx < 0) return;
          const insertIdx = position === 'after' ? tIdx + 1 : tIdx;
          vanStops.splice(insertIdx, 0, movedStop);

          let pOrder = 1;
          const updatedVanStops = vanStops.map(s => {
            if (s.id === 'depot') return s;
            return { ...s, vanOrder: pOrder++ };
          });

          const calc = calculateRouteResult(updatedVanStops);
          const vanId = vr.vehicleId || `van-${vrIndexSource + 1}`;
          const vanColor = vr.color || VAN_COLOR_MAP[vanId] || VAN_COLORS[vrIndexSource % VAN_COLORS.length] || '#3b82f6';
          const vanLegs = calc.legs.map(l => ({
            ...l,
            vanId,
            vehicleId: vanId,
            vanLabel: vr.vehicleLabel || `Vehicle 0${vrIndexSource + 1}`,
            color: vanColor
          }));
          const vanVal = validateTimeWindows(updatedVanStops, vanLegs, departureMinutes);

          updatedVehicleRoutes[vrIndexSource] = {
            ...vr,
            orderedStops: updatedVanStops,
            legs: vanLegs,
            totalDistanceMeters: calc.totalDistanceMeters,
            totalDurationSeconds: calc.totalDurationSeconds,
            totalDurationMin: calc.totalDurationMin || Math.round(calc.totalDurationSeconds / 60),
            formattedTotalDistance: calc.formattedTotalDistance,
            formattedTotalDuration: calc.formattedTotalDuration,
            shiftDurationMinutes: vanVal.totalShiftMinutes,
            formattedShiftDuration: vanVal.formattedShiftDuration,
            appointmentCount: updatedVanStops.filter(s => s.id !== 'depot').length,
            revenue: updatedVanStops.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
          };
        } else {
          // Reorder across different vans (move stop from source van to target van at target position)
          const vrSrc = updatedVehicleRoutes[vrIndexSource];
          const vrTgt = updatedVehicleRoutes[vrIndexTarget];

          const vanStopsSrc = [...(vrSrc.orderedStops || (vrSrc as any).stops || [])];
          const vanStopsTgt = [...(vrTgt.orderedStops || (vrTgt as any).stops || [])];

          const sIdx = vanStopsSrc.findIndex(s => s.id === sourceStopId);
          if (sIdx < 0) return;
          const [movedStop] = vanStopsSrc.splice(sIdx, 1);

          const targetVanId = vrTgt.vehicleId || `van-${vrIndexTarget + 1}`;
          const stopWithNewVan = { ...movedStop, assignedVanId: targetVanId };

          const tIdx = vanStopsTgt.findIndex(s => s.id === targetStopId);
          if (tIdx < 0) return;
          const insertIdx = position === 'after' ? tIdx + 1 : tIdx;
          vanStopsTgt.splice(insertIdx, 0, stopWithNewVan);

          let pOrderSrc = 1;
          const updatedVanStopsSrc = vanStopsSrc.map(s => (s.id === 'depot' ? s : { ...s, vanOrder: pOrderSrc++ }));
          let pOrderTgt = 1;
          const updatedVanStopsTgt = vanStopsTgt.map(s => (s.id === 'depot' ? s : { ...s, vanOrder: pOrderTgt++ }));

          const calcSrc = calculateRouteResult(updatedVanStopsSrc);
          const vanIdSrc = vrSrc.vehicleId || `van-${vrIndexSource + 1}`;
          const vanColorSrc = vrSrc.color || VAN_COLOR_MAP[vanIdSrc] || VAN_COLORS[vrIndexSource % VAN_COLORS.length] || '#3b82f6';
          const vanLegsSrc = calcSrc.legs.map(l => ({
            ...l,
            vanId: vanIdSrc,
            vehicleId: vanIdSrc,
            vanLabel: vrSrc.vehicleLabel || `Vehicle 0${vrIndexSource + 1}`,
            color: vanColorSrc
          }));
          const vanValSrc = validateTimeWindows(updatedVanStopsSrc, vanLegsSrc, departureMinutes);

          const calcTgt = calculateRouteResult(updatedVanStopsTgt);
          const vanColorTgt = vrTgt.color || VAN_COLOR_MAP[targetVanId] || VAN_COLORS[vrIndexTarget % VAN_COLORS.length] || '#3b82f6';
          const vanLegsTgt = calcTgt.legs.map(l => ({
            ...l,
            vanId: targetVanId,
            vehicleId: targetVanId,
            vanLabel: vrTgt.vehicleLabel || `Vehicle 0${vrIndexTarget + 1}`,
            color: vanColorTgt
          }));
          const vanValTgt = validateTimeWindows(updatedVanStopsTgt, vanLegsTgt, departureMinutes);

          updatedVehicleRoutes[vrIndexSource] = {
            ...vrSrc,
            orderedStops: updatedVanStopsSrc,
            legs: vanLegsSrc,
            totalDistanceMeters: calcSrc.totalDistanceMeters,
            totalDurationSeconds: calcSrc.totalDurationSeconds,
            totalDurationMin: calcSrc.totalDurationMin || Math.round(calcSrc.totalDurationSeconds / 60),
            formattedTotalDistance: calcSrc.formattedTotalDistance,
            formattedTotalDuration: calcSrc.formattedTotalDuration,
            shiftDurationMinutes: vanValSrc.totalShiftMinutes,
            formattedShiftDuration: vanValSrc.formattedShiftDuration,
            appointmentCount: updatedVanStopsSrc.filter(s => s.id !== 'depot').length,
            revenue: updatedVanStopsSrc.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
          };

          updatedVehicleRoutes[vrIndexTarget] = {
            ...vrTgt,
            orderedStops: updatedVanStopsTgt,
            legs: vanLegsTgt,
            totalDistanceMeters: calcTgt.totalDistanceMeters,
            totalDurationSeconds: calcTgt.totalDurationSeconds,
            totalDurationMin: calcTgt.totalDurationMin || Math.round(calcTgt.totalDurationSeconds / 60),
            formattedTotalDistance: calcTgt.formattedTotalDistance,
            formattedTotalDuration: calcTgt.formattedTotalDuration,
            shiftDurationMinutes: vanValTgt.totalShiftMinutes,
            formattedShiftDuration: vanValTgt.formattedShiftDuration,
            appointmentCount: updatedVanStopsTgt.filter(s => s.id !== 'depot').length,
            revenue: updatedVanStopsTgt.filter(s => s.id !== 'depot').reduce((acc, p) => acc + (p.serviceCost || 450), 0)
          };
        }

        // Build global stops sequence matching updated vehicle routes
        let globalOrder = 1;
        const allNewStops = [
          { ...depot, order: 1 },
          ...updatedVehicleRoutes.flatMap(vr =>
            (vr.orderedStops || [])
              .filter(s => s.id !== 'depot')
              .map(s => ({ ...s, order: ++globalOrder }))
          )
        ];

        const allLegs = updatedVehicleRoutes.flatMap(vr => vr.legs || []);
        const totalDist = updatedVehicleRoutes.reduce((sum, vr) => sum + (vr.totalDistanceMeters || 0), 0);
        const totalDur = updatedVehicleRoutes.reduce((sum, vr) => sum + (vr.totalDurationSeconds || 0), 0);
        const maxShift = Math.max(...updatedVehicleRoutes.map(vr => vr.shiftDurationMinutes || 0), 0);
        const maxShiftHrs = Math.floor(maxShift / 60);
        const maxShiftMins = maxShift % 60;
        const formattedMaxShift = maxShiftHrs > 0 ? `${maxShiftHrs}h ${maxShiftMins}m` : `${maxShiftMins}m`;

        setStops(allNewStops);
        setManualStops(allNewStops);
        setOriginalStops(allNewStops);

        const updatedResult: OptimizedRouteResult = {
          ...routeResult,
          orderedStops: allNewStops,
          legs: allLegs,
          vehicleRoutes: updatedVehicleRoutes,
          totalDistanceMeters: totalDist,
          totalDurationSeconds: totalDur,
          totalDurationMin: Math.round(totalDur / 60),
          formattedTotalDistance: formatDistance(totalDist),
          formattedTotalDuration: formatDuration(totalDur),
          maxShiftDurationMinutes: maxShift,
          formattedMaxShiftDuration: `${formattedMaxShift} max`
        };

        setRouteResult(updatedResult);

        if (selectedCityId) {
          cityCacheRef.current[selectedCityId] = {
            stops: allNewStops,
            manualStops: allNewStops,
            originalStops: allNewStops,
            routeResult: updatedResult,
            hasOptimized: true,
            fleetSize,
            departureMinutes,
            simulatedMinutes: departureMinutes
          };
        }

        if (user) persistCustomerList(user.uid, allNewStops);

        computeFleetRouteLegs(updatedVehicleRoutes, departureMinutes).catch(err =>
          console.warn('Reordered fleet routing background update:', err)
        );
        return;
      }
    }

    // 2. SOLO VAN OR UNOPTIMIZED ROUTE:
    const currentList = [...stops];
    const sIdx = currentList.findIndex(s => s.id === sourceStopId);
    if (sIdx < 0 || currentList[sIdx].id === 'depot') return;
    const [movedStop] = currentList.splice(sIdx, 1);

    const tIdx = currentList.findIndex(s => s.id === targetStopId);
    if (tIdx < 0) return;
    const insertIdx = position === 'after' ? tIdx + 1 : tIdx;
    currentList.splice(insertIdx, 0, movedStop);

    const reordered = currentList.map((s, idx) => ({ ...s, order: idx + 1 }));
    setManualStops(reordered);
    setStops(reordered);
    setOriginalStops(reordered);
    if (user) persistCustomerList(user.uid, reordered);

    if (hasOptimized) {
      const calc = calculateRouteResult(reordered);
      const val = validateTimeWindows(reordered, calc.legs, departureMinutes);
      const singlePets = reordered.filter(s => s.id !== 'depot');
      const soloPreset = JHB_VEHICLES[0];
      const singleVr: VehicleRoute = {
        vehicleId: 'van-1',
        vehicleLabel: soloPreset?.vehicleLabel || 'Vehicle 01',
        technicianName: soloPreset?.technicianName,
        depotName: soloPreset?.depotName,
        depotAddress: soloPreset?.depotAddress,
        depotLocation: soloPreset?.depotLocation,
        shiftSchedule: soloPreset ? `${soloPreset.shiftDays} ${soloPreset.shiftStart}–${soloPreset.shiftEnd}` : 'Mon–Fri 07:00–16:00',
        color: VAN_COLORS[0],
        orderedStops: reordered,
        legs: calc.legs.map(l => ({ ...l, vanId: 'van-1', color: VAN_COLORS[0] })),
        totalDistanceMeters: calc.totalDistanceMeters,
        totalDurationSeconds: calc.totalDurationSeconds,
        totalDurationMin: calc.totalDurationMin || Math.round(calc.totalDurationSeconds / 60),
        formattedTotalDistance: calc.formattedTotalDistance,
        formattedTotalDuration: calc.formattedTotalDuration,
        shiftDurationMinutes: val.totalShiftMinutes,
        formattedShiftDuration: val.formattedShiftDuration,
        appointmentCount: singlePets.length,
        revenue: singlePets.reduce((acc, p) => acc + (p.serviceCost || 450), 0)
      };

      const updatedResult: OptimizedRouteResult = {
        ...routeResult,
        orderedStops: reordered,
        legs: singleVr.legs,
        vehicleRoutes: [singleVr],
        totalDistanceMeters: calc.totalDistanceMeters,
        totalDurationSeconds: calc.totalDurationSeconds,
        totalDurationMin: Math.round(calc.totalDurationSeconds / 60),
        formattedTotalDistance: calc.formattedTotalDistance,
        formattedTotalDuration: calc.formattedTotalDuration,
        maxShiftDurationMinutes: val.totalShiftMinutes,
        formattedMaxShiftDuration: val.formattedShiftDuration
      };

      setRouteResult(updatedResult);

      if (selectedCityId) {
        cityCacheRef.current[selectedCityId] = {
          stops: reordered,
          manualStops: reordered,
          originalStops: reordered,
          routeResult: updatedResult,
          hasOptimized: true,
          fleetSize: 1,
          departureMinutes,
          simulatedMinutes: departureMinutes
        };
      }

      computeRealRouteLegs(reordered, departureMinutes).catch(err =>
        console.warn('Reordered solo routing background update:', err)
      );
    } else {
      setRouteResult(prev => ({
        ...prev,
        orderedStops: reordered
      }));
    }
  };

  // Reverse route order for actual appointments / meetings (keeping depot as origin and return)
  const handleReverseRoute = () => {
    handleResetSimulation();

    if (hasOptimized && routeResult.vehicleRoutes && routeResult.vehicleRoutes.length > 0) {
      // Multi-van: reverse appointments within each van's assigned schedule
      let globalOrder = 1;
      const depot = stops.find(s => s.id === 'depot') || stops[0];
      const updatedVehicleRoutes = routeResult.vehicleRoutes.map((vr, vIdx) => {
        const vanStops = vr.orderedStops && vr.orderedStops.length > 0 ? vr.orderedStops : [depot];
        const vanDepot = vanStops.find(s => s.id === 'depot') || depot;
        const nonDepots = vanStops.filter(s => s.id !== 'depot');
        const reversedNonDepots = [...nonDepots].reverse().map(s => {
          const updated = { ...s, order: ++globalOrder };
          return updated;
        });
        const newOrderedStops = [vanDepot, ...reversedNonDepots];
        const calc = calculateRouteResult(newOrderedStops);
        const vanId = vr.vehicleId || `van-${vIdx + 1}`;
        const vanColor = vr.color || VAN_COLOR_MAP[vanId] || VAN_COLORS[vIdx] || '#3b82f6';
        const vanLegs = calc.legs.map(l => ({
          ...l,
          vanId,
          vehicleId: vanId,
          vanLabel: vr.vehicleLabel || `Vehicle 0${vIdx + 1}`,
          color: vanColor
        }));
        return {
          ...vr,
          orderedStops: newOrderedStops,
          legs: vanLegs,
          totalDistanceMeters: calc.totalDistanceMeters,
          totalDurationSeconds: calc.totalDurationSeconds,
          formattedDistance: calc.formattedTotalDistance,
          formattedDuration: calc.formattedTotalDuration
        };
      });

      const allNewStops = [
        { ...depot, order: 1 },
        ...updatedVehicleRoutes.flatMap(vr => vr.orderedStops.filter(s => s.id !== 'depot'))
      ];
      const allLegs = updatedVehicleRoutes.flatMap(vr => vr.legs);
      const totalDist = updatedVehicleRoutes.reduce((sum, vr) => sum + vr.totalDistanceMeters, 0);
      const totalDur = updatedVehicleRoutes.reduce((sum, vr) => sum + vr.totalDurationSeconds, 0);

      setStops(allNewStops);
      setRouteResult(prev => ({
        ...prev,
        orderedStops: allNewStops,
        legs: allLegs,
        vehicleRoutes: updatedVehicleRoutes,
        totalDistanceMeters: totalDist,
        totalDurationSeconds: totalDur,
        totalDurationMin: Math.round(totalDur / 60),
        formattedTotalDistance: formatDistance(totalDist),
        formattedTotalDuration: formatDuration(totalDur)
      }));

      if (user) persistCustomerList(user.uid, allNewStops);

      // Background fetch real Google Routes API polylines for the reversed order
      computeFleetRouteLegs(updatedVehicleRoutes, departureMinutes).catch(err =>
        console.warn('Reversed fleet routing background update:', err)
      );
      return;
    }

    // Unoptimized or solo route: reverse meeting sequence
    const base = [...stops];
    if (base.length <= 2) return;
    const depot = base[0];
    const petsReversed = [...base.slice(1)].reverse();
    const reversed = [depot, ...petsReversed].map((s, idx) => ({
      ...s,
      order: idx + 1
    }));
    setManualStops(reversed);
    setStops(reversed);
    setOriginalStops(reversed);
    if (user) persistCustomerList(user.uid, reversed);

    if (hasOptimized) {
      const calc = calculateRouteResult(reversed);
      setRouteResult(prev => ({
        ...prev,
        orderedStops: reversed,
        legs: calc.legs,
        totalDistanceMeters: calc.totalDistanceMeters,
        totalDurationSeconds: calc.totalDurationSeconds,
        totalDurationMin: Math.round(calc.totalDurationSeconds / 60),
        formattedTotalDistance: calc.formattedTotalDistance,
        formattedTotalDuration: calc.formattedTotalDuration
      }));
      computeRealRouteLegs(reversed, departureMinutes).catch(err =>
        console.warn('Reversed solo routing background update:', err)
      );
    }
  };

  // Move stop earlier
  const handleMoveUp = (index: number) => {
    if (index <= 1 || index >= stops.length) return;
    const targetA = stops[index];
    const targetB = stops[index - 1];
    if (targetA && targetB && targetA.id !== 'depot' && targetB.id !== 'depot') {
      handleSwapStops(targetA.id, targetB.id);
    }
  };

  // Move stop later
  const handleMoveDown = (index: number) => {
    if (index === 0 || index >= stops.length - 1) return;
    const targetA = stops[index];
    const targetB = stops[index + 1];
    if (targetA && targetB && targetA.id !== 'depot' && targetB.id !== 'depot') {
      handleSwapStops(targetA.id, targetB.id);
    }
  };

  // Apply a benchmark scenario directly into the active app state
  const handleApplyScenario = (scenario: { id: string; name: string; city: 'san-francisco' | 'new-york'; stops: PetStop[] }) => {
    setSelectedCityId(scenario.city);
    const tagged = updateVanAssignments(scenario.stops, fleetSize);
    setManualStops(tagged);
    setStops(tagged);
    setOriginalStops(tagged);
    setSelectedStop(tagged[1] || null);
    setHasOptimized(false);
    handleResetSimulation();
    setRouteResult({
      orderedStops: tagged,
      legs: [],
      vehicleRoutes: undefined,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize
    });
  };

  // Delete stop
  const handleDeleteStop = (id: string) => {
    const remaining = stops.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx + 1 }));
    const tagged = updateVanAssignments(remaining, fleetSize);
    setStops(tagged);
    setManualStops(tagged);
    setOriginalStops(tagged);
    setClientStopCount(tagged.filter(s => s.id !== 'depot').length);
    setHasOptimized(false);
    handleResetSimulation();
    setRouteResult({
      orderedStops: tagged,
      legs: [],
      vehicleRoutes: undefined,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize
    });
    if (selectedStop?.id === id) {
      setSelectedStop(tagged[1] || tagged[0] || null);
    }
    if (user && !isDepotStop({ id })) {
      setIsSyncingFirestore(true);
      deleteCustomerStop(user.uid, id)
        .then(() => {
          knownCustomerIdsRef.current.delete(id);
          return persistCustomerList(user.uid, tagged);
        })
        .catch(err => setSyncError(getFriendlyFirebaseError(err)))
        .finally(() => setIsSyncingFirestore(false));
    }
  };

  // Toggle stop pinning (locking position constraint)
  const handleTogglePinStop = (id: string) => {
    const targetStop = stops.find(s => s.id === id);
    const willBePinned = targetStop ? !targetStop.isPinned : false;

    const updated = stops.map(s => (s.id === id ? { ...s, isPinned: willBePinned } : s));
    const tagged = updateVanAssignments(updated, fleetSize);
    setManualStops(tagged);
    setStops(tagged);
    setOriginalStops(tagged);
    setHasOptimized(false);
    handleResetSimulation();
    setRouteResult({
      orderedStops: tagged,
      legs: [],
      vehicleRoutes: undefined,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize
    });

    if (user) {
      const updatedStop = tagged.find(s => s.id === id);
      if (updatedStop) persistSingleCustomer(user.uid, updatedStop);
    }
  };

  // Add custom customer visit
  const handleAddStop = (newStop: PetStop) => {
    const base = hasOptimized ? manualStops : stops;
    const updated = [...base, newStop].map((s, idx) => ({ ...s, order: idx + 1 }));
    const tagged = assignWeekdayZones(updateVanAssignments(updated, fleetSize), fleetSize, departureMinutes, maxShiftHours * 60, true).updatedStops;
    setStops(tagged);
    setManualStops(tagged);
    setOriginalStops(tagged);
    setClientStopCount(tagged.filter(s => s.id !== 'depot').length);
    setHasOptimized(false);
    handleResetSimulation();
    setRouteResult({
      orderedStops: tagged,
      legs: [],
      vehicleRoutes: undefined,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalDurationMin: 0,
      formattedTotalDistance: '0.0 km',
      formattedTotalDuration: '0 min',
      initialDistanceMeters: 0,
      initialDurationSeconds: 0,
      distanceSavedMeters: 0,
      timeSavedMinutes: 0,
      percentOptimized: 0,
      fleetSize
    });
    setSelectedStop(newStop);

    if (user) {
      persistCustomerList(user.uid, tagged);
    }
  };

  const handleOpenEditStop = (stop: PetStop) => {
    if (isDepotStop(stop)) return;
    setEditingStop(stop);
    setIsAddPetOpen(true);
  };

  const handleUpdateStop = (updatedStop: PetStop) => {
    const mapList = (list: PetStop[]) =>
      list.map(s => (s.id === updatedStop.id ? { ...s, ...updatedStop } : s));

    setStops(prev => mapList(prev));
    setManualStops(prev => mapList(prev));
    setOriginalStops(prev => mapList(prev));
    if (selectedStop?.id === updatedStop.id) {
      setSelectedStop(updatedStop);
    }
    setHasOptimized(false);
    handleResetSimulation();
    setEditingStop(null);

    if (user) {
      persistSingleCustomer(user.uid, updatedStop, true);
    }
  };

  // Toggle visit status
  const handleToggleStatus = (id: string) => {
    let changedStop: PetStop | null = null;
    setStops(prev => {
      const updated = prev.map(s => {
        if (s.id !== id) return s;
        const nextStatus: PetStop['status'] =
          s.status === 'pending'
            ? 'in-grooming'
            : s.status === 'in-grooming'
              ? 'completed'
              : 'pending';
        changedStop = { ...s, status: nextStatus };
        return changedStop;
      });
      setOriginalStops(updated);
      return updated;
    });
    if (user && changedStop) {
      persistSingleCustomer(user.uid, changedStop);
    }
  };

  const handleChangeStopDuration = (stopId: string, durationMin: number) => {
    let changedStop: PetStop | null = null;
    setStops(prev => {
      const updated = prev.map(s => {
        if (s.id !== stopId) return s;
        changedStop = { ...s, durationMin };
        return changedStop;
      });
      setOriginalStops(updated);
      return updated;
    });
    setHasOptimized(false);
    handleResetSimulation();
    if (user && changedStop) {
      persistSingleCustomer(user.uid, changedStop);
    }
  };

  // Week Schedule Plan derived reactively from current stops, fleet size & shift window
  const weekPlan = useMemo<WeekSchedulePlan>(
    () => buildWeekSchedulePlan(stops, fleetSize, departureMinutes, maxShiftHours * 60),
    [stops, fleetSize, departureMinutes, maxShiftHours]
  );

  // Sync fuelSettings updates from SettingsModal into SavingsInputs
  useEffect(() => {
    setSavingsInputs(prev => ({
      ...prev,
      fuelPricePerLitre: fuelSettings.fuelPricePerLitre,
      fuelConsumptionLPer100Km: fuelSettings.fuelConsumptionLPer100Km
    }));
  }, [fuelSettings.fuelPricePerLitre, fuelSettings.fuelConsumptionLPer100Km]);

  const handleSaveFuelSettings = (next: FuelSettings) => {
    setFuelSettings(next);
    setSavingsInputs(prev => ({
      ...prev,
      fuelPricePerLitre: next.fuelPricePerLitre,
      fuelConsumptionLPer100Km: next.fuelConsumptionLPer100Km
    }));
    try {
      localStorage.setItem('hamba_fuel_settings', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
    if (user) {
      persistWorkspace(user.uid, {
        businessName: next.businessName || 'Hamba Routes',
        fuelPricePerLitre: next.fuelPricePerLitre,
        fuelConsumptionLPer100Km: next.fuelConsumptionLPer100Km
      });
    }
  };

  const handleChangeSavingsInputs = (partial: Partial<SavingsInputs>) => {
    const mergedNext = { ...savingsInputs, ...partial };
    setSavingsInputs(mergedNext);

    let syncedFuel = fuelSettings;
    if (
      partial.fuelPricePerLitre !== undefined ||
      partial.fuelConsumptionLPer100Km !== undefined
    ) {
      syncedFuel = {
        ...fuelSettings,
        fuelPricePerLitre: mergedNext.fuelPricePerLitre,
        fuelConsumptionLPer100Km: mergedNext.fuelConsumptionLPer100Km
      };
      setFuelSettings(syncedFuel);
      try {
        localStorage.setItem('hamba_fuel_settings', JSON.stringify(syncedFuel));
      } catch {
        // Ignore storage error
      }
    }

    if (user) {
      persistWorkspace(user.uid, {
        fuelPricePerLitre: syncedFuel.fuelPricePerLitre,
        fuelConsumptionLPer100Km: syncedFuel.fuelConsumptionLPer100Km,
        workingDaysPerMonth: mergedNext.workingDaysPerMonth,
        avgPricePerVisitZar: mergedNext.avgPricePerVisitZar,
        grossMarginPercent: mergedNext.grossMarginPercent,
        baselineMode: mergedNext.baselineMode,
        pastedOrderText: mergedNext.pastedOrderText,
        breakEvenMonthlyFeeZar: mergedNext.breakEvenMonthlyFeeZar
      });
    }
  };

  const handleResetSavingsInputs = () => {
    const customers = stops.filter(s => s.id !== 'depot');
    const meanPrice = customers.length > 0
      ? Math.round(customers.reduce((acc, s) => acc + (s.serviceCost || 500), 0) / customers.length)
      : 500;
    const resetValues: SavingsInputs = {
      baselineMode: 'alphabetical',
      pastedOrderText: '',
      fuelPricePerLitre: DEFAULT_FUEL_SETTINGS.fuelPricePerLitre,
      fuelConsumptionLPer100Km: DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km,
      workingDaysPerMonth: 21,
      avgPricePerVisitZar: meanPrice,
      grossMarginPercent: 30,
      breakEvenMonthlyFeeZar: 1500
    };
    setSavingsInputs(resetValues);
    handleSaveFuelSettings({
      ...fuelSettings,
      fuelPricePerLitre: DEFAULT_FUEL_SETTINGS.fuelPricePerLitre,
      fuelConsumptionLPer100Km: DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km
    });
    if (user) {
      persistWorkspace(user.uid, {
        workingDaysPerMonth: resetValues.workingDaysPerMonth,
        avgPricePerVisitZar: resetValues.avgPricePerVisitZar,
        grossMarginPercent: resetValues.grossMarginPercent,
        baselineMode: resetValues.baselineMode,
        pastedOrderText: resetValues.pastedOrderText,
        breakEvenMonthlyFeeZar: resetValues.breakEvenMonthlyFeeZar
      });
    }
  };

  const savingsAnalysis = useMemo<SavingsAnalysisResult>(
    () => calculateWeekSavings(weekPlan, savingsInputs),
    [weekPlan, savingsInputs]
  );

  const handleMoveStopToWeekday = (stopId: string, targetWeekday: Weekday, targetVehicleId?: string) => {
    const res = moveStopToWeekday(
      stops,
      stopId,
      targetWeekday,
      targetVehicleId,
      fleetSize,
      departureMinutes,
      maxShiftHours * 60
    );
    setStops(res.updatedStops);
    setManualStops(res.updatedStops);
    setOriginalStops(res.updatedStops);
    handleResetSimulation();
    if (user) {
      persistCustomerList(user.uid, res.updatedStops);
    }
  };

  const handleReclusterWeek = () => {
    const res = assignWeekdayZones(stops, fleetSize, departureMinutes, maxShiftHours * 60, false);
    setStops(res.updatedStops);
    setManualStops(res.updatedStops);
    setOriginalStops(res.updatedStops);
    handleResetSimulation();
    if (user) {
      persistCustomerList(user.uid, res.updatedStops);
    }
  };

  const handleAcceptPlacement = (newStop: PetStop, option: PlacementOption) => {
    const enrichedStop: PetStop = {
      ...newStop,
      assignedWeekday: option.weekday,
      assignedVanId: option.vehicleId,
      weekdayOrder: option.insertIndex,
      weeklyFrequency: newStop.weeklyFrequency || `Weekly (${WEEKDAY_SHORT[option.weekday]})`
    };
    const base = [...stops, enrichedStop].map((s, idx) => ({ ...s, order: idx + 1 }));

    setStops(base);
    setManualStops(base);
    setOriginalStops(base);
    setClientStopCount(base.filter(s => s.id !== 'depot').length);
    setSelectedStop(enrichedStop);
    setViewMode('week');
    setActiveWeekdayFilter(option.weekday);
    handleResetSimulation();
    if (user) {
      persistCustomerList(user.uid, base);
    }
  };

  // Keep todayVehicleId within active fleetSize bounds
  useEffect(() => {
    const vNum = parseInt(todayVehicleId.replace('van-', ''), 10);
    if (isNaN(vNum) || vNum < 1 || vNum > fleetSize) {
      setTodayVehicleId('van-1');
    }
  }, [fleetSize, todayVehicleId]);

  // Compute & traffic-optimise "Today's route" whenever viewMode === 'today' or dependencies update
  useEffect(() => {
    if (viewMode !== 'today') return;
    let cancelled = false;

    async function runTodayOptimization() {
      setIsTodayLoading(true);
      setTodayError(null);
      const vIdx = Math.max(0, (parseInt(todayVehicleId.replace('van-', ''), 10) || 1) - 1);
      const preset = JHB_VEHICLES[vIdx];
      const baseDepot = stops.find(s => s.id === 'depot') || stops[0];
      const depotStop: PetStop = preset
        ? {
            ...(baseDepot || {
              id: 'depot',
              order: 0,
              name: preset.depotName,
              ownerName: preset.technicianName,
              breed: 'Depot',
              species: 'dog',
              avatar: '🏢',
              address: preset.depotAddress,
              location: preset.depotLocation,
              serviceType: 'Dispatch Depot',
              serviceCost: 0,
              personality: '',
              urgency: 'standard',
              mudLevel: 0,
              fluffFactor: 0,
              timeWindow: { start: '07:00', end: '16:00' },
              durationMin: 0,
              specialInstructions: '',
              funnyQuote: '',
              status: 'completed'
            }),
            id: `depot-${todayVehicleId}`,
            name: preset.depotName,
            ownerName: preset.technicianName,
            address: preset.depotAddress,
            location: preset.depotLocation
          }
        : baseDepot;

      const assignedStops = stops
        .filter(s => s.id !== 'depot' && (s.assignedWeekday || 'Monday') === todayWeekday && (s.assignedVanId || 'van-1') === todayVehicleId)
        .sort((a, b) => (a.weekdayOrder || a.order || 0) - (b.weekdayOrder || b.order || 0));

      const statusKey = `${todayWeekday}::${todayVehicleId}`;
      const statusMap = todayStopStatuses[statusKey] || {};

      try {
        const plan = await computeTodayTrafficRoute({
          weekday: todayWeekday,
          vehicleId: todayVehicleId,
          vehicleLabel: preset?.vehicleLabel || `Vehicle 0${vIdx + 1}`,
          technicianName: preset?.technicianName || `Technician ${vIdx + 1}`,
          depotStop,
          assignedStops,
          stopStatuses: statusMap,
          departureMinutes: todayDepartureMinutes,
          maxShiftMinutes: maxShiftHours * 60
        });
        if (!cancelled) {
          setTodayPlan(plan);
          if (plan.warning && plan.warning.toLowerCase().includes('quota')) {
            setQuotaExceeded(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setTodayError(err instanceof Error ? err.message : "Failed to compute Today's Route.");
        }
      } finally {
        if (!cancelled) {
          setIsTodayLoading(false);
        }
      }
    }

    runTodayOptimization();
    return () => {
      cancelled = true;
    };
  }, [viewMode, todayWeekday, todayVehicleId, todayDepartureMinutes, todayStopStatuses, stops, maxShiftHours, todayCalcCounter]);

  const handleSetTodayStopStatus = (stopId: string, nextStatus: TodayStopExecutionStatus) => {
    const statusKey = `${todayWeekday}::${todayVehicleId}`;
    setTodayStopStatuses(prev => ({
      ...prev,
      [statusKey]: {
        ...(prev[statusKey] || {}),
        [stopId]: nextStatus
      }
    }));
  };

  const handleResetTodayStatuses = () => {
    const statusKey = `${todayWeekday}::${todayVehicleId}`;
    setTodayStopStatuses(prev => {
      const copy = { ...prev };
      delete copy[statusKey];
      return copy;
    });
  };

  const handleViewModeChange = (mode: 'day' | 'week' | 'today' | 'savings') => {
    setViewMode(mode);
    if (mode === 'today' && !isDesktop) {
      setIsRightPanelOpen(true);
      setActiveMobileTab('itinerary');
    }
  };



  // Toggle Van Driving Simulation (Play / Pause)
  const handleToggleSimulation = () => {
    if (!hasOptimized) {
      setRouteWarning({
        title: 'Plan Route First',
        message: 'Please click "Plan Route" before running the simulation.',
        details: 'Fleet simulation requires calculated vehicle routes to animate turn-by-turn driving paths and arrival schedules.',
        type: 'warning'
      });
      return;
    }

    if (simStatus === 'running') {
      // Pause simulation
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      setSimStatus('paused');
      setTelemetry(prev => ({ ...prev, isDriving: false, speedKmh: 0 }));
    } else {
      // Start or Resume simulation
      const currentMode = simStatus;
      setSimStatus('running');
      setTelemetry(prev => ({ ...prev, isDriving: true, speedKmh: 35 }));
      setActiveVanFilter('all');

      // Check if multi-van simulation
      const vehicles = (routeResult.vehicleRoutes && routeResult.vehicleRoutes.length > 1)
        ? routeResult.vehicleRoutes
        : buildBaselineFleetRoutes(stops, fleetSize);

      if (vehicles && vehicles.length > 1) {
        const depot = stops.find(s => s.id === 'depot') || stops[0];
        const fleetVal = validateFleet(vehicles, departureMinutes);
        const shiftEndMinutes = departureMinutes + (fleetVal.maxShiftMinutes || 360);

        // Initialize van trackers ONLY if starting from idle or if not already created
        if (currentMode === 'idle' || !fleetTrackersRef.current || fleetTrackersRef.current.length === 0) {
          setSimulatedMinutes(departureMinutes);
          setStops(prev => prev.map(s => s.id === 'depot' ? s : { ...s, status: 'pending' }));

          fleetTrackersRef.current = vehicles.map((vr, vIdx) => {
            const vanId = vr.vehicleId || `van-${vIdx + 1}`;
            const vanColor = VAN_COLOR_MAP[vanId] || vr.color || VAN_COLORS[vIdx] || '#3b82f6';
            const vanStops = (vr.orderedStops && vr.orderedStops.length > 0)
              ? vr.orderedStops
              : [depot];

            let vanLegs = vr.legs;
            if (!vanLegs || vanLegs.length === 0) {
              const calc = calculateRouteResult(vanStops);
              vanLegs = calc.legs;
            }

            // Tag each leg with vehicle ID and vehicle color, ensuring densified road polylines for smooth animation
            vanLegs = vanLegs.map(l => {
              const rawCoords = l.pathCoordinates && l.pathCoordinates.length > 0
                ? l.pathCoordinates
                : generateCurvedStreetPoints(depot.location, depot.location);
              return {
                ...l,
                vanId,
                vehicleId: vanId,
                color: vanColor,
                pathCoordinates: densifyPolyline(rawCoords, 25, 60)
              };
            });

            const vanVal = validateTimeWindows(vanStops, vanLegs, departureMinutes);
            const startLoc = vanLegs[0]?.pathCoordinates[0] || depot.location || currentCity.center;
            return {
              vanId,
              label: vr.vehicleLabel || `Vehicle 0${vIdx + 1}`,
              color: vanColor,
              legs: vanLegs,
              vanTimeline: vanVal.timelineLegs,
              vanShiftDuration: vanVal.totalShiftMinutes,
              legIndex: 0,
              coordIndex: 0,
              isFinished: false,
              currentLocation: startLoc,
              simMinutes: departureMinutes
            };
          });
        }

        const fleetTrackers = fleetTrackersRef.current;

        simIntervalRef.current = setInterval(() => {
          let allFinished = true;

          fleetTrackers.forEach((tracker) => {
            if (tracker.isFinished) {
              tracker.simMinutes = departureMinutes + tracker.vanShiftDuration;
              return;
            }

            const currentLeg = tracker.legs[tracker.legIndex];
            if (!currentLeg) {
              tracker.isFinished = true;
              tracker.simMinutes = departureMinutes + tracker.vanShiftDuration;
              return;
            }

            allFinished = false;
            const coords = currentLeg.pathCoordinates || [];
            // Smooth natural pacing: ~70 ticks per leg (~2.8s) so driving is clearly visible
            const step = Math.max(1, Math.round(coords.length / 70));
            const legTimeline = tracker.vanTimeline?.[tracker.legIndex];

            // 1. FORWARD DRIVING
            if (tracker.coordIndex < coords.length) {
              tracker.currentLocation = coords[tracker.coordIndex];
              tracker.coordIndex += step;
              if (tracker.coordIndex >= coords.length) {
                tracker.coordIndex = coords.length;
                tracker.currentLocation = coords[coords.length - 1] || tracker.currentLocation;
              }
              const legProgress = coords.length > 0 ? tracker.coordIndex / coords.length : 1;
              tracker.simMinutes = legTimeline
                ? legTimeline.startDriveMinutes + legProgress * legTimeline.driveDurationMinutes
                : departureMinutes;
            } else {
              // Arrival pause at stop (grooming)
              const arrivingStopId = currentLeg.toStopId;
              const isFinalDepot = tracker.legIndex === tracker.legs.length - 1;
              const totalTicks = isFinalDepot ? 6 : 14;

              if (tracker.serviceTicksRemaining === undefined) {
                tracker.totalServiceTicks = totalTicks;
                tracker.serviceTicksRemaining = totalTicks;

                if (arrivingStopId !== 'depot') {
                  setStops(prev =>
                    prev.map(s => (s.id === arrivingStopId ? { ...s, status: 'in-grooming' } : s))
                  );
                }
              }

              const remaining = tracker.serviceTicksRemaining ?? 0;
              const serviceRatio = totalTicks > 0 ? (totalTicks - remaining) / totalTicks : 0;
              tracker.simMinutes = legTimeline
                ? legTimeline.arrivalMinutes + (legTimeline.waitDurationMinutes || 0) + serviceRatio * legTimeline.serviceDurationMinutes
                : departureMinutes;

              if (tracker.serviceTicksRemaining > 1) {
                tracker.serviceTicksRemaining--;
              } else {
                setStops(prev =>
                  prev.map(s => (s.id === arrivingStopId ? { ...s, status: 'completed' } : s))
                );

                tracker.legIndex++;
                tracker.coordIndex = 0;
                tracker.serviceTicksRemaining = undefined;

                if (tracker.legIndex >= tracker.legs.length) {
                  tracker.isFinished = true;
                  tracker.currentLocation = coords[coords.length - 1] || tracker.currentLocation;
                  tracker.simMinutes = departureMinutes + tracker.vanShiftDuration;
                }
              }
            }
          });

          // Update telemetry positions
          setTelemetry(prev => ({
            ...prev,
            isDriving: true,
            speedKmh: 35,
            fleetVans: fleetTrackers.map(t => ({
              id: t.vanId,
              vanId: t.vanId,
              label: t.label,
              color: t.color,
              currentVanLocation: t.currentLocation,
              currentLocation: t.currentLocation,
              isDriving: !t.isFinished,
              progressPercent: t.legs.length > 0 ? Math.round((t.legIndex / t.legs.length) * 100) : 100
            }))
          }));

          // Progress simulated time locked to real fleet timeline
          const maxVanMinutes = Math.max(...fleetTrackers.map(t => t.simMinutes || departureMinutes));
          setSimulatedMinutes(Math.min(shiftEndMinutes, Math.round(maxVanMinutes)));

          if (allFinished) {
            if (simIntervalRef.current) {
              clearInterval(simIntervalRef.current);
              simIntervalRef.current = null;
            }
            fleetTrackersRef.current = [];
            setSimStatus('idle');
            setSimulatedMinutes(shiftEndMinutes);
            setTelemetry(prev => ({
              ...prev,
              isDriving: false,
              speedKmh: 0,
              fleetVans: fleetTrackers.map(t => ({
                id: t.vanId,
                vanId: t.vanId,
                label: t.label,
                color: t.color,
                currentVanLocation: t.currentLocation,
                currentLocation: t.currentLocation,
                isDriving: false,
                progressPercent: 100
              }))
            }));
            confetti({ particleCount: 100, spread: 90 });
          }
        }, 40);

        return;
      }

      // Solo Van Simulation (single route)
      const allLegs = routeResult.legs;
      if (allLegs.length === 0) return;

      const currentOrderedStops = routeResult.orderedStops.length > 0 ? routeResult.orderedStops : stops;
      const validation = validateTimeWindows(currentOrderedStops, allLegs, departureMinutes);
      const timelineLegs = validation.timelineLegs;
      const shiftEndMinutes = departureMinutes + validation.totalShiftMinutes;

      if (currentMode === 'idle') {
        setSimulatedMinutes(departureMinutes);
        simLegIndexRef.current = 0;
        simCoordIndexRef.current = 0;
        simServiceTicksRef.current = 0;
        setStops(prev => prev.map(s => s.id === 'depot' ? s : { ...s, status: 'pending' }));
      }

      simIntervalRef.current = setInterval(() => {
        const currentLegIndex = simLegIndexRef.current;
        const leg = allLegs[currentLegIndex];
        const legTimeline = timelineLegs[currentLegIndex];

        if (!leg || currentLegIndex < 0 || currentLegIndex >= allLegs.length) {
          if (simIntervalRef.current) {
            clearInterval(simIntervalRef.current);
            simIntervalRef.current = null;
          }
          setSimStatus('idle');
          setSimulatedMinutes(shiftEndMinutes);
          setTelemetry(prev => ({ ...prev, isDriving: false, speedKmh: 0 }));
          confetti({ particleCount: 100, spread: 90 });
          return;
        }

        const coords = leg.pathCoordinates || [];
        const step = Math.max(1, Math.round(coords.length / 70));

        if (simCoordIndexRef.current < coords.length) {
          const loc = coords[simCoordIndexRef.current];
          setTelemetry(prev => ({
            ...prev,
            currentVanLocation: loc,
            currentStopIndex: currentLegIndex,
            shampooGallons: Math.max(5, prev.shampooGallons - 0.05),
            treatCount: Math.max(10, prev.treatCount - 1)
          }));

          const progressRatio = coords.length > 0 ? Math.min(1, simCoordIndexRef.current / coords.length) : 1;
          const currentDriveMinutes = legTimeline
            ? legTimeline.startDriveMinutes + progressRatio * legTimeline.driveDurationMinutes
            : departureMinutes;

          setSimulatedMinutes(Math.min(shiftEndMinutes, Math.round(currentDriveMinutes)));

          simCoordIndexRef.current += step;
          if (simCoordIndexRef.current >= coords.length) {
            simCoordIndexRef.current = coords.length;
          }
        } else {
          const isFinalDepot = currentLegIndex === allLegs.length - 1;
          const totalTicks = isFinalDepot ? 6 : 14;

          if (simServiceTicksRef.current === undefined || simServiceTicksRef.current === 0) {
            simServiceTicksRef.current = totalTicks;

            const arrivingStopId = leg.toStopId;
            if (arrivingStopId !== 'depot') {
              setStops(prev =>
                prev.map(s => (s.id === arrivingStopId ? { ...s, status: 'in-grooming' } : s))
              );
            }
          }

          const serviceRatio = totalTicks > 0 ? (totalTicks - simServiceTicksRef.current) / totalTicks : 0;
          const currentServiceMinutes = legTimeline
            ? legTimeline.arrivalMinutes + (legTimeline.waitDurationMinutes || 0) + serviceRatio * legTimeline.serviceDurationMinutes
            : departureMinutes;
          setSimulatedMinutes(Math.min(shiftEndMinutes, Math.round(currentServiceMinutes)));

          if (simServiceTicksRef.current > 1) {
            simServiceTicksRef.current--;
          } else {
            simServiceTicksRef.current = 0;
            const arrivingStopId = leg.toStopId;
            setStops(prev =>
              prev.map(s => (s.id === arrivingStopId ? { ...s, status: 'completed' } : s))
            );

            const departureFromStop = legTimeline
              ? legTimeline.departureMinutes
              : (legTimeline?.arrivalMinutes || departureMinutes);

            setSimulatedMinutes(Math.min(shiftEndMinutes, Math.round(departureFromStop)));

            simLegIndexRef.current++;
            simCoordIndexRef.current = 0;
          }
        }
      }, 40);
    }
  };

  // Reset Simulation back to idle
  const handleResetSimulation = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setSimStatus('idle');
    setSimDirection('forward');
    simDirectionRef.current = 'forward';
    setSimulatedMinutes(departureMinutes);
    simLegIndexRef.current = 0;
    simCoordIndexRef.current = 0;
    simServiceTicksRef.current = 0;
    fleetTrackersRef.current = [];

    // Reset stops status to 'pending'
    setStops(prev => prev.map(s => s.id === 'depot' ? s : { ...s, status: 'pending' }));

    // Reset van marker to start/depot location
    setTelemetry(prev => ({
      ...prev,
      isDriving: false,
      speedKmh: 0,
      currentStopIndex: 0,
      currentVanLocation: stops[0]?.location || currentCity.center,
      fleetVans: undefined,
      shampooGallons: 45,
      treatCount: 180
    }));
  };

  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  const getRouteTitle = () => {
    if (!hasOptimized || routeResult.legs.length === 0) return 'Scheduled Visits';
    return 'Planned Route';
  };

  const nonDepotStops = stops.filter(s => s.id !== 'depot');
  const isDark = theme === 'dark';

  return (
    <div className={`flex flex-col h-screen w-screen print:h-auto print:w-auto print:overflow-visible ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-200 text-slate-900'} overflow-hidden select-none font-sans transition-colors`}>
      {quotaExceeded && (
        <div className="no-print bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm shrink-0">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {/* Top Navigation Bar */}
      <header className={`no-print backdrop-blur-xl border-b flex items-center justify-between z-30 shrink-0 transition-all ${
        isMobileLandscape ? 'px-3 py-1.5' : 'px-3.5 sm:px-5 py-2 sm:py-3'
      } ${
        isDark ? 'bg-slate-950/90 border-slate-800/80 text-white' : 'bg-white/95 border-slate-200 text-slate-900 shadow-xs'
      }`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`${isMobileLandscape ? 'w-7 h-7 rounded-xl' : 'w-9 h-9 sm:w-10 sm:h-10 rounded-2xl'} bg-gradient-to-tr from-amber-400 via-orange-500 to-indigo-600 p-0.5 shadow-lg flex items-center justify-center shrink-0`}>
            <div className={`w-full h-full rounded-[10px] sm:rounded-[14px] flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-white'}`}>
              <span className={isMobileLandscape ? 'text-sm' : 'text-base sm:text-xl'}>🚐</span>
            </div>
          </div>

          <div>
            <h1 className={`${isMobileLandscape ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-black font-display tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Hamba Routes
            </h1>
            <p className={`text-[10px] sm:text-[11px] leading-tight ${isMobileLandscape ? 'hidden xs:block' : 'block'} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Fewer kilometres. More visits. · Mon–Fri 07:00–16:00 SAST
            </p>
          </div>
        </div>

        {/* Header Right Badges */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Google Sign-In / Cloud Workspace Controls */}
          {authLoading ? (
            <div className={`min-h-[44px] sm:min-h-0 px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
              isDark ? 'border-slate-800 bg-slate-900/70 text-slate-400' : 'border-slate-300 bg-slate-100 text-slate-500'
            }`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Checking account…</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-1.5">
              <div
                title={user.email ? `Signed in as ${user.email}` : 'Signed in with Google'}
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
                  isDark
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                }`}
              >
                {isSyncingFirestore ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="max-w-[140px] truncate">{user.email || user.displayName || 'Synced'}</span>
              </div>
              <button
                id="google-signout-btn"
                onClick={handleSignOut}
                disabled={isOptimizing || isDeletingAllData}
                aria-label="Sign out"
                title={user.email ? `Sign out (${user.email})` : 'Sign out'}
                className={`min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  isOptimizing || isDeletingAllData ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              id="google-signin-btn"
              onClick={handleSignInWithGoogle}
              disabled={isSigningIn || isOptimizing}
              aria-label="Sign in with Google"
              title="Sign in with Google to save your business customers & routes"
              className={`min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                isSigningIn || isOptimizing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                isDark
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 hover:text-white'
                  : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {isSigningIn ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              <span className="sm:hidden">{isSigningIn ? 'Signing in…' : 'Sign in'}</span>
              <span className="hidden sm:inline">{isSigningIn ? 'Signing in…' : 'Sign in with Google'}</span>
            </button>
          )}

          {/* Fuel & Fleet Settings Button */}
          <button
            id="settings-header-btn"
            onClick={() => setIsSettingsOpen(true)}
            disabled={isOptimizing}
            aria-label="Fleet and fuel cost settings"
            title={`Fuel Settings: R${fuelSettings.fuelPricePerLitre}/L · ${fuelSettings.fuelConsumptionLPer100Km} L/100km`}
            className={`min-h-[44px] sm:min-h-0 flex items-center gap-1.5 ${isMobileLandscape ? 'px-2.5 py-1.5 text-[11px]' : 'px-2.5 py-1.5 text-xs'} rounded-xl border font-bold transition-all ${
              isOptimizing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark
                ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800'
                : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-bold">Settings</span>
          </button>

          {/* Theme Toggle Button: monochrome icon with no color */}
          <button
            onClick={toggleTheme}
            disabled={isOptimizing}
            aria-label="Toggle dark/light theme"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 ${isMobileLandscape ? 'p-2' : 'p-2'} rounded-xl border transition-all flex items-center justify-center shadow-xs ${
              isOptimizing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark
                ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
                : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            {isDark ? (
              <Moon className="w-4 h-4 transition-transform duration-300" />
            ) : (
              <Sun className="w-4 h-4 transition-transform duration-300" />
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-hidden print:overflow-visible print:h-auto relative min-h-0 flex flex-col">
        {/* Firebase Auth or Firestore Sync Error Banner */}
        {(authError || syncError) && (
          <div
            role="alert"
            className={`no-print mx-3 sm:mx-4 mt-2 mb-1 p-2.5 sm:p-3 rounded-xl border flex items-start justify-between gap-3 shadow-md z-30 shrink-0 ${
              isDark
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="min-w-0">
                <div className="text-xs font-bold font-display">
                  {authError ? 'Google Sign-In Error' : 'Cloud Sync Issue'}
                </div>
                <p className="text-[11.5px] mt-0.5 opacity-90 leading-snug">
                  {authError || syncError}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setAuthError(null); setSyncError(null); }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:opacity-75 transition-opacity cursor-pointer shrink-0"
              aria-label="Dismiss account notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Route Error or Notice Warning Banner (Non-blocking, with Retry & Dismiss) */}
        {routeWarning && (
          <div
            id="route-warning-banner"
            className={`no-print mx-3 sm:mx-4 mt-2 mb-1 p-2.5 sm:p-3 rounded-xl border flex items-start justify-between gap-3 shadow-md transition-all animate-in fade-in slide-in-from-top-2 duration-200 z-30 shrink-0 ${
              routeWarning.type === 'warning'
                ? isDark
                  ? 'bg-amber-950/90 border-amber-800 text-amber-200'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
                : isDark
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                routeWarning.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
              }`} />
              <div className="min-w-0">
                <div className="text-xs font-bold font-display">{routeWarning.title}</div>
                <p className="text-[11.5px] mt-0.5 opacity-90 leading-snug">{routeWarning.message}</p>
                {routeWarning.details && (
                  <p className="text-[10.5px] mt-1 opacity-75">{routeWarning.details}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleOptimizeRoute}
                disabled={isOptimizing}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 shadow-xs'
                }`}
              >
                {routeWarning.title === 'Plan Route First' ? 'Plan Route' : 'Retry'}
              </button>
              <button
                onClick={() => setRouteWarning(null)}
                className="p-1 rounded-lg hover:opacity-75 transition-opacity cursor-pointer"
                aria-label="Dismiss warning"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {isDesktop ? (
          /* 1. DESKTOP & LARGE TABLET LAYOUT (>= 1024px and height >= 550px): Side-by-side with fluid map and dedicated sidebars */
          <div className="flex flex-1 flex-row h-full overflow-hidden print:h-auto print:overflow-visible relative min-h-0 w-full animate-in fade-in duration-150">
            {/* Map & Dashboard Area */}
            <main className="no-print flex-1 flex flex-col p-3.5 gap-3.5 overflow-hidden min-h-0 relative">
              {/* Subtle Reopen Tab when Right Panel is Collapsed (discrete, neutral, not purple) */}
              {!isRightPanelOpen && viewMode !== 'savings' && (
                <button
                  id="reopen-right-panel-floating-btn"
                  onClick={() => setIsRightPanelOpen(true)}
                  disabled={isOptimizing}
                  aria-label="Open itinerary panel"
                  title="Open itinerary panel"
                  className={`absolute top-1/2 -translate-y-1/2 right-0 z-30 w-5 h-12 rounded-l-md border border-r-0 flex items-center justify-center transition-all ${
                    isOptimizing ? 'opacity-40 cursor-not-allowed' : 'hover:w-6 active:scale-95 cursor-pointer'
                  } ${
                    isDark
                      ? 'bg-slate-900/60 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      : 'bg-white/70 hover:bg-white border-slate-300/80 text-slate-500 hover:text-slate-800 shadow-2xs'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Action Toolbar */}
              <RouteControls
                onOptimize={handleOptimizeRoute}
                onAddStop={() => setIsAddPetOpen(true)}
                onLoadDemoData={handleLoadDemoData}
                onOpenPlacement={() => setIsPlacementOpen(true)}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                onToggleSimulation={handleToggleSimulation}
                onReverseMeetingOrder={handleReverseRoute}
                onResetSimulation={handleResetSimulation}
                simStatus={simStatus}
                simDirection={simDirection}
                isSimulationDisabled={false}
                isOptimizing={isOptimizing}
                hasOptimized={hasOptimized}
                routeResult={routeResult}
                telemetry={telemetry}
                currentStop={stops[telemetry.currentStopIndex]}
                currentStopIndex={telemetry.currentStopIndex}
                stops={stops}
                solverStep={solverStep}
                solverUsed={debugInfo?.solverUsed}
                isDark={isDark}
                fleetSize={fleetSize}
                onFleetSizeChange={handleFleetSizeChange}
                fleetAllocationMode={fleetAllocationMode}
                onSelectFleetAllocationMode={handleSelectFleetAllocationMode}
                maxShiftHours={maxShiftHours}
                onSelectMaxShiftHours={handleSelectMaxShiftHours}
                clientStopCount={clientStopCount}
                onClientStopCountChange={handleClientStopCountChange}
                onResetToDefaults={handleResetToDefaults}
              />

              {/* Interactive Map Canvas - kept mounted & visible in Day/Week/Today modes */}
              <div className={`${viewMode === 'savings' ? 'hidden' : 'flex-1'} w-full min-h-[220px] relative rounded-2xl overflow-hidden shadow-2xl border ${
                isDark ? 'border-slate-800' : 'border-slate-300'
              }`}>
                  <GmpMapCanvas
                    stops={stops}
                    legs={routeResult.legs}
                    selectedStop={selectedStop}
                    onSelectStop={setSelectedStop}
                    telemetry={telemetry}
                    cityCenter={currentCity.center}
                    zoom={currentCity.zoom}
                    routeTitle={getRouteTitle()}
                    simulatedTime={formatSimulatedTime(simulatedMinutes)}
                    simStatus={simStatus}
                    cities={CITY_PRESETS}
                    currentCity={currentCity}
                    onSelectCity={handleSelectCity}
                    departureMinutes={departureMinutes}
                    onDepartureTimeChange={handleDepartureTimeChange}
                    theme={theme}
                    fleetSize={fleetSize}
                    vehicleRoutes={routeResult.vehicleRoutes}
                    activeVanFilter={activeVanFilter}
                    hasOptimized={hasOptimized}
                    showGrouping={showGrouping}
                    showPolylines={showPolylines}
                    onOptimize={handleOptimizeRoute}
                    isOptimizing={isOptimizing}
                    fitBoundsKey={fitBoundsKey}
                    viewMode={viewMode}
                    weekPlan={weekPlan}
                    todayPlan={todayPlan}
                    activeWeekdayFilter={activeWeekdayFilter}
                    onSelectWeekdayFilter={setActiveWeekdayFilter}
                    quotaExceeded={quotaExceeded}
                    mapError={mapError}
                    onRetryMap={() => { setQuotaExceeded(false); setMapError(null); }}
                  />
              </div>

              {/* Savings Calculator Workspace when viewMode === 'savings' */}
              {viewMode === 'savings' && (
                <SavingsPanel
                  inputs={savingsInputs}
                  onChangeInputs={handleChangeSavingsInputs}
                  onResetInputs={handleResetSavingsInputs}
                  analysis={savingsAnalysis}
                  weekPlan={weekPlan}
                  businessName={fuelSettings.businessName || 'Hamba Routes'}
                  isDark={isDark}
                />
              )}

              {/* Bottom Telemetry HUD (Day View vs Week View; Today's route & Savings keep full vertical space) */}
              {viewMode === 'week' ? (
                <WeekDashboard
                  weekPlan={weekPlan}
                  fuelSettings={fuelSettings}
                  activeWeekdayFilter={activeWeekdayFilter}
                  onSelectWeekdayFilter={setActiveWeekdayFilter}
                  fleetSize={fleetSize}
                  className="shrink-0"
                  isDark={isDark}
                />
              ) : viewMode === 'day' ? (
                <VanDashboard
                  vehicleRoutes={routeResult.vehicleRoutes}
                  routeResult={routeResult}
                  hasOptimized={hasOptimized}
                  fleetSize={fleetSize}
                  activeVanFilter={activeVanFilter}
                  onSelectVanFilter={setActiveVanFilter}
                  onOptimize={handleOptimizeRoute}
                  isOptimizing={isOptimizing}
                  className="shrink-0"
                  isDark={isDark}
                />
              ) : null}
            </main>

            {/* Right Sidebar: Day Stops, Weekday Zones, or Today's Route (hidden in Savings full-width view) */}
            {isRightPanelOpen && viewMode !== 'savings' && (
              viewMode === 'today' ? (
                <TodaysRoutePanel
                  todayPlan={todayPlan}
                  isLoading={isTodayLoading}
                  todayError={todayError}
                  weekday={todayWeekday}
                  onSelectWeekday={setTodayWeekday}
                  vehicleId={todayVehicleId}
                  onSelectVehicleId={setTodayVehicleId}
                  fleetSize={fleetSize}
                  departureMinutes={todayDepartureMinutes}
                  onDepartureMinutesChange={setTodayDepartureMinutes}
                  businessName={fuelSettings.businessName || 'Hamba Routes'}
                  weekPlan={weekPlan}
                  selectedStop={selectedStop}
                  onSelectStop={setSelectedStop}
                  onSetStopStatus={handleSetTodayStopStatus}
                  onResetDayStatuses={handleResetTodayStatuses}
                  onRecalculate={() => setTodayCalcCounter(c => c + 1)}
                  onEditStop={handleOpenEditStop}
                  isDark={isDark}
                  onClose={() => setIsRightPanelOpen(false)}
                />
              ) : viewMode === 'week' ? (
                <WeekZoneSidebar
                  weekPlan={weekPlan}
                  selectedStop={selectedStop}
                  onSelectStop={setSelectedStop}
                  activeWeekdayFilter={activeWeekdayFilter}
                  onSelectWeekdayFilter={setActiveWeekdayFilter}
                  onMoveStopToWeekday={handleMoveStopToWeekday}
                  onReclusterWeek={handleReclusterWeek}
                  onOpenPlacement={() => setIsPlacementOpen(true)}
                  onEditStop={handleOpenEditStop}
                  maxShiftHours={maxShiftHours}
                  isDark={isDark}
                  onClose={() => setIsRightPanelOpen(false)}
                />
              ) : (
                <StopListSidebar
                  stops={stops}
                  routeResult={routeResult}
                  selectedStop={selectedStop}
                  onSelectStop={setSelectedStop}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onSwapStops={handleSwapStops}
                  onReorderStop={handleReorderStop}
                  onDeleteStop={handleDeleteStop}
                  onToggleStatus={handleToggleStatus}
                  onAddStop={() => setIsAddPetOpen(true)}
                  onEditStop={handleOpenEditStop}
                  onOpenSolverDebug={() => setIsDebugOpen(true)}
                  onOpenBenchmark={() => setIsBenchmarkOpen(true)}
                  onTogglePin={handleTogglePinStop}
                  onReverseOrder={handleReverseRoute}
                  onChangeDuration={handleChangeStopDuration}
                  showStepper={true}
                  solverStep={solverStep}
                  solverUsed={debugInfo?.solverUsed}
                  telemetry={telemetry}
                  currentStop={stops[telemetry.currentStopIndex]}
                  currentStopIndex={telemetry.currentStopIndex}
                  departureMinutes={departureMinutes}
                  isDark={isDark}
                  fleetSize={fleetSize}
                  maxShiftHours={maxShiftHours}
                  onSelectMaxShiftHours={handleSelectMaxShiftHours}
                  vehicleRoutes={routeResult.vehicleRoutes}
                  activeVanFilter={activeVanFilter}
                  onSelectVanFilter={setActiveVanFilter}
                  hasOptimized={hasOptimized}
                  isOptimizing={isOptimizing}
                  onClose={() => setIsRightPanelOpen(false)}
                />
              )
            )}
          </div>
        ) : viewMode === 'savings' ? (
          /* MOBILE / COMPACT SAVINGS FULL WORKSPACE */
          <div className="no-print flex-1 flex flex-col p-2.5 gap-2.5 overflow-hidden min-h-0 w-full">
            <RouteControls
              onOptimize={handleOptimizeRoute}
              onAddStop={() => setIsAddPetOpen(true)}
              onLoadDemoData={handleLoadDemoData}
              onOpenPlacement={() => setIsPlacementOpen(true)}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              onToggleSimulation={handleToggleSimulation}
              onReverseMeetingOrder={handleReverseRoute}
              onResetSimulation={handleResetSimulation}
              simStatus={simStatus}
              simDirection={simDirection}
              isSimulationDisabled={false}
              isOptimizing={isOptimizing}
              hasOptimized={hasOptimized}
              routeResult={routeResult}
              telemetry={telemetry}
              currentStop={stops[telemetry.currentStopIndex]}
              currentStopIndex={telemetry.currentStopIndex}
              stops={stops}
              solverStep={solverStep}
              solverUsed={debugInfo?.solverUsed}
              isDark={isDark}
              fleetSize={fleetSize}
              onFleetSizeChange={handleFleetSizeChange}
              fleetAllocationMode={fleetAllocationMode}
              onSelectFleetAllocationMode={handleSelectFleetAllocationMode}
              maxShiftHours={maxShiftHours}
              onSelectMaxShiftHours={handleSelectMaxShiftHours}
              clientStopCount={clientStopCount}
              onClientStopCountChange={handleClientStopCountChange}
              onResetToDefaults={handleResetToDefaults}
            />
            <SavingsPanel
              inputs={savingsInputs}
              onChangeInputs={handleChangeSavingsInputs}
              onResetInputs={handleResetSavingsInputs}
              analysis={savingsAnalysis}
              weekPlan={weekPlan}
              businessName={fuelSettings.businessName || 'Hamba Routes'}
              isDark={isDark}
            />
          </div>
        ) : isMobileLandscape ? (
          /* 2. MOBILE HORIZONTAL / LANDSCAPE LAYOUT: Map on the LEFT, Controls/Stops/Metrics on the RIGHT */
          <div className="flex flex-1 flex-row h-full overflow-hidden print:h-auto print:overflow-visible w-full animate-in fade-in duration-150 p-2 gap-2 relative">
            {/* Left Side: Map Viewport (Takes ~52% width when open, full 100% width when collapsed) */}
            <div className={`${isRightPanelOpen ? 'w-[52%]' : 'w-full'} no-print h-full shrink-0 relative flex flex-col min-h-0 transition-all duration-200`}>
              {/* Subtle Reopen Tab when Right Panel is Collapsed (discrete, neutral, not purple) */}
              {!isRightPanelOpen && (
                <button
                  id="reopen-right-panel-mobile-landscape-btn"
                  onClick={() => setIsRightPanelOpen(true)}
                  disabled={isOptimizing}
                  aria-label="Open itinerary panel"
                  title="Open itinerary panel"
                  className={`absolute top-1/2 -translate-y-1/2 right-0 z-30 w-5 h-10 rounded-l-md border border-r-0 flex items-center justify-center transition-all ${
                    isOptimizing ? 'opacity-40 cursor-not-allowed' : 'hover:w-6 active:scale-95 cursor-pointer'
                  } ${
                    isDark
                      ? 'bg-slate-900/60 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      : 'bg-white/70 hover:bg-white border-slate-300/80 text-slate-500 hover:text-slate-800 shadow-2xs'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}

              <div className={`w-full h-full relative rounded-2xl overflow-hidden shadow-xl border ${
                isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white'
              }`}>
                <GmpMapCanvas
                  stops={stops}
                  legs={routeResult.legs}
                  selectedStop={selectedStop}
                  onSelectStop={setSelectedStop}
                  telemetry={telemetry}
                  cityCenter={currentCity.center}
                  zoom={currentCity.zoom}
                  routeTitle={getRouteTitle()}
                  simulatedTime={formatSimulatedTime(simulatedMinutes)}
                  simStatus={simStatus}
                  cities={CITY_PRESETS}
                  currentCity={currentCity}
                  onSelectCity={handleSelectCity}
                  departureMinutes={departureMinutes}
                  onDepartureTimeChange={handleDepartureTimeChange}
                  theme={theme}
                  fleetSize={fleetSize}
                  vehicleRoutes={routeResult.vehicleRoutes}
                  activeVanFilter={activeVanFilter}
                  hasOptimized={hasOptimized}
                  showGrouping={showGrouping}
                  showPolylines={showPolylines}
                  onOptimize={handleOptimizeRoute}
                  isOptimizing={isOptimizing}
                  fitBoundsKey={fitBoundsKey}
                  viewMode={viewMode}
                  weekPlan={weekPlan}
                  todayPlan={todayPlan}
                  activeWeekdayFilter={activeWeekdayFilter}
                  onSelectWeekdayFilter={setActiveWeekdayFilter}
                  quotaExceeded={quotaExceeded}
                  mapError={mapError}
                  onRetryMap={() => { setQuotaExceeded(false); setMapError(null); }}
                />
              </div>
            </div>

            {/* Right Side: Segmented Controls Tabs + Scrollable Panels (Only rendered if open) */}
            {isRightPanelOpen && (
              <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden print:h-auto print:overflow-visible animate-in fade-in duration-150">
                {/* Compact Segmented Tabs */}
                <div className={`no-print p-1 rounded-xl border text-xs font-bold font-sans mb-1.5 shrink-0 ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300'
                }`}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveMobileTab('controls')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all text-xs ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'controls'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Controls</span>
                    </button>

                    <button
                      onClick={() => setActiveMobileTab('itinerary')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all text-xs ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'itinerary'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>{viewMode === 'today' ? "Today's Route" : viewMode === 'week' ? 'Week' : `Visits (${nonDepotStops.length})`}</span>
                    </button>

                    <button
                      onClick={() => setActiveMobileTab('hud')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all text-xs ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'hud'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>Metrics</span>
                    </button>

                    <button
                      onClick={() => setIsRightPanelOpen(false)}
                      disabled={isOptimizing}
                      aria-label="Collapse panel"
                      title="Collapse panel"
                      className={`min-h-[44px] min-w-[44px] p-1.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                        isOptimizing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        isDark
                          ? 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                          : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Tab Body for Horizontal Mobile */}
                <div className="flex-1 min-h-0 overflow-y-auto print:overflow-visible">
                  {activeMobileTab === 'controls' && (
                    <div className="no-print h-full pr-1">
                      <RouteControls
                        onOptimize={handleOptimizeRoute}
                        onAddStop={() => setIsAddPetOpen(true)}
                        onLoadDemoData={handleLoadDemoData}
                        onOpenPlacement={() => setIsPlacementOpen(true)}
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                        onToggleSimulation={handleToggleSimulation}
                        onReverseMeetingOrder={handleReverseRoute}
                        onResetSimulation={handleResetSimulation}
                        simStatus={simStatus}
                        simDirection={simDirection}
                        isSimulationDisabled={false}
                        isOptimizing={isOptimizing}
                        hasOptimized={hasOptimized}
                        routeResult={routeResult}
                        className="w-full"
                        telemetry={telemetry}
                        currentStop={stops[telemetry.currentStopIndex]}
                        currentStopIndex={telemetry.currentStopIndex}
                        stops={stops}
                        solverStep={solverStep}
                        solverUsed={debugInfo?.solverUsed}
                        showStepper={true}
                        showVanHud={true}
                        isDark={isDark}
                        fleetSize={fleetSize}
                        onFleetSizeChange={handleFleetSizeChange}
                        fleetAllocationMode={fleetAllocationMode}
                        onSelectFleetAllocationMode={handleSelectFleetAllocationMode}
                        maxShiftHours={maxShiftHours}
                        onSelectMaxShiftHours={handleSelectMaxShiftHours}
                        clientStopCount={clientStopCount}
                        onClientStopCountChange={handleClientStopCountChange}
                        onResetToDefaults={handleResetToDefaults}
                      />
                    </div>
                  )}

                  {activeMobileTab === 'itinerary' && (
                    <div className="h-full pr-1">
                      {viewMode === 'today' ? (
                        <TodaysRoutePanel
                          todayPlan={todayPlan}
                          isLoading={isTodayLoading}
                          todayError={todayError}
                          weekday={todayWeekday}
                          onSelectWeekday={setTodayWeekday}
                          vehicleId={todayVehicleId}
                          onSelectVehicleId={setTodayVehicleId}
                          fleetSize={fleetSize}
                          departureMinutes={todayDepartureMinutes}
                          onDepartureMinutesChange={setTodayDepartureMinutes}
                          businessName={fuelSettings.businessName || 'Hamba Routes'}
                          weekPlan={weekPlan}
                          selectedStop={selectedStop}
                          onSelectStop={setSelectedStop}
                          onSetStopStatus={handleSetTodayStopStatus}
                          onResetDayStatuses={handleResetTodayStatuses}
                          onRecalculate={() => setTodayCalcCounter(c => c + 1)}
                          onEditStop={handleOpenEditStop}
                          isDark={isDark}
                          className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                        />
                      ) : viewMode === 'week' ? (
                        <WeekZoneSidebar
                          weekPlan={weekPlan}
                          selectedStop={selectedStop}
                          onSelectStop={setSelectedStop}
                          activeWeekdayFilter={activeWeekdayFilter}
                          onSelectWeekdayFilter={setActiveWeekdayFilter}
                          onMoveStopToWeekday={handleMoveStopToWeekday}
                          onReclusterWeek={handleReclusterWeek}
                          onOpenPlacement={() => setIsPlacementOpen(true)}
                          onEditStop={handleOpenEditStop}
                          maxShiftHours={maxShiftHours}
                          isDark={isDark}
                          className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                        />
                      ) : (
                        <StopListSidebar
                          stops={stops}
                          routeResult={routeResult}
                          selectedStop={selectedStop}
                          onSelectStop={setSelectedStop}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          onSwapStops={handleSwapStops}
                          onReorderStop={handleReorderStop}
                          onDeleteStop={handleDeleteStop}
                          onToggleStatus={handleToggleStatus}
                          onAddStop={() => setIsAddPetOpen(true)}
                          onEditStop={handleOpenEditStop}
                          onOpenSolverDebug={() => setIsDebugOpen(true)}
                          onOpenBenchmark={() => setIsBenchmarkOpen(true)}
                          onTogglePin={handleTogglePinStop}
                          onReverseOrder={handleReverseRoute}
                          onChangeDuration={handleChangeStopDuration}
                          departureMinutes={departureMinutes}
                          isDark={isDark}
                          fleetSize={fleetSize}
                          maxShiftHours={maxShiftHours}
                          onSelectMaxShiftHours={handleSelectMaxShiftHours}
                          vehicleRoutes={routeResult.vehicleRoutes}
                          activeVanFilter={activeVanFilter}
                          onSelectVanFilter={setActiveVanFilter}
                          hasOptimized={hasOptimized}
                          isOptimizing={isOptimizing}
                          className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                        />
                      )}
                    </div>
                  )}

                  {activeMobileTab === 'hud' && (
                    <div className="h-full pr-1">
                      {viewMode === 'week' ? (
                        <WeekDashboard
                          weekPlan={weekPlan}
                          fuelSettings={fuelSettings}
                          activeWeekdayFilter={activeWeekdayFilter}
                          onSelectWeekdayFilter={setActiveWeekdayFilter}
                          fleetSize={fleetSize}
                          className="w-full"
                          isDark={isDark}
                        />
                      ) : (
                        <VanDashboard
                          vehicleRoutes={routeResult.vehicleRoutes}
                          routeResult={routeResult}
                          hasOptimized={hasOptimized}
                          fleetSize={fleetSize}
                          activeVanFilter={activeVanFilter}
                          onSelectVanFilter={setActiveVanFilter}
                          onOptimize={handleOptimizeRoute}
                          isOptimizing={isOptimizing}
                          className="w-full"
                          isDark={isDark}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 3. MOBILE VERTICAL / PORTRAIT LAYOUT: Stacked Map on Top & Tabs on Bottom (or full screen map when collapsed) */
          <div className="flex flex-1 flex-col h-full overflow-hidden print:h-auto print:overflow-visible min-h-0 w-full animate-in fade-in duration-150 relative">
            {/* Map Viewport: Takes full height if collapsed, otherwise half the screen height */}
            <div className={`no-print w-full ${isRightPanelOpen ? 'h-1/2 min-h-[280px] pb-1' : 'h-full flex-1'} shrink-0 p-2.5 relative transition-all duration-200`}>
              {/* Floating Reopen Discrete Chevron Button when Panel is Hidden */}
              {!isRightPanelOpen && (
                <button
                  id="reopen-right-panel-mobile-portrait-btn"
                  onClick={() => setIsRightPanelOpen(true)}
                  disabled={isOptimizing}
                  aria-label="Expand panel"
                  title="Expand panel"
                  className={`absolute bottom-5 right-5 z-30 w-10 h-10 rounded-full border shadow-2xl flex items-center justify-center transition-all ${
                    isOptimizing ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'
                  } backdrop-blur-md ${
                    isDark
                      ? 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                      : 'bg-white/95 border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-lg'
                  }`}
                >
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                </button>
              )}

              <div className={`w-full h-full relative rounded-2xl overflow-hidden shadow-xl border ${
                isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white'
              }`}>
                <GmpMapCanvas
                  stops={stops}
                  legs={routeResult.legs}
                  selectedStop={selectedStop}
                  onSelectStop={setSelectedStop}
                  telemetry={telemetry}
                  cityCenter={currentCity.center}
                  zoom={currentCity.zoom}
                  routeTitle={getRouteTitle()}
                  simulatedTime={formatSimulatedTime(simulatedMinutes)}
                  simStatus={simStatus}
                  cities={CITY_PRESETS}
                  currentCity={currentCity}
                  onSelectCity={handleSelectCity}
                  departureMinutes={departureMinutes}
                  onDepartureTimeChange={handleDepartureTimeChange}
                  theme={theme}
                  fleetSize={fleetSize}
                  vehicleRoutes={routeResult.vehicleRoutes}
                  activeVanFilter={activeVanFilter}
                  hasOptimized={hasOptimized}
                  showGrouping={showGrouping}
                  showPolylines={showPolylines}
                  onOptimize={handleOptimizeRoute}
                  isOptimizing={isOptimizing}
                  fitBoundsKey={fitBoundsKey}
                  viewMode={viewMode}
                  weekPlan={weekPlan}
                  todayPlan={todayPlan}
                  activeWeekdayFilter={activeWeekdayFilter}
                  onSelectWeekdayFilter={setActiveWeekdayFilter}
                  quotaExceeded={quotaExceeded}
                  mapError={mapError}
                  onRetryMap={() => { setQuotaExceeded(false); setMapError(null); }}
                />
              </div>
            </div>

            {/* Segmented Navigation Tabs & Tab Content (Only rendered when panel is open) */}
            {isRightPanelOpen && (
              <>
                {/* Segmented Navigation Tabs */}
                <div className={`no-print px-2.5 py-1 shrink-0 ${isDark ? 'bg-slate-950' : 'bg-slate-200'}`}>
                  <div className={`flex items-center p-1 rounded-xl border text-xs font-bold font-sans gap-1 ${
                    isDark ? 'bg-slate-950' : 'bg-white border-slate-300'
                  }`}>
                    <button
                      onClick={() => setActiveMobileTab('controls')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'controls'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Controls</span>
                    </button>

                    <button
                      onClick={() => setActiveMobileTab('itinerary')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'itinerary'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>{viewMode === 'today' ? "Today's Route" : viewMode === 'week' ? 'Week' : `Visits (${nonDepotStops.length})`}</span>
                    </button>

                    <button
                      onClick={() => setActiveMobileTab('hud')}
                      disabled={isOptimizing}
                      className={`flex-1 min-h-[44px] py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                        isOptimizing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        activeMobileTab === 'hud'
                          ? 'bg-indigo-600 text-white shadow'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>Metrics</span>
                    </button>

                    <button
                      onClick={() => setIsRightPanelOpen(false)}
                      disabled={isOptimizing}
                      aria-label="Collapse panel"
                      title="Collapse panel"
                      className={`min-h-[44px] min-w-[44px] p-1.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                        isOptimizing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        isDark
                          ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                          : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mobile Tab Content Viewport */}
                <div className={`flex-1 min-h-0 overflow-hidden print:h-auto print:overflow-visible px-2.5 pb-2 ${isDark ? 'bg-slate-950' : 'bg-slate-200'}`}>
                  {activeMobileTab === 'itinerary' && (
                    viewMode === 'today' ? (
                      <TodaysRoutePanel
                        todayPlan={todayPlan}
                        isLoading={isTodayLoading}
                        todayError={todayError}
                        weekday={todayWeekday}
                        onSelectWeekday={setTodayWeekday}
                        vehicleId={todayVehicleId}
                        onSelectVehicleId={setTodayVehicleId}
                        fleetSize={fleetSize}
                        departureMinutes={todayDepartureMinutes}
                        onDepartureMinutesChange={setTodayDepartureMinutes}
                        businessName={fuelSettings.businessName || 'Hamba Routes'}
                        weekPlan={weekPlan}
                        selectedStop={selectedStop}
                        onSelectStop={setSelectedStop}
                        onSetStopStatus={handleSetTodayStopStatus}
                        onResetDayStatuses={handleResetTodayStatuses}
                        onRecalculate={() => setTodayCalcCounter(c => c + 1)}
                        onEditStop={handleOpenEditStop}
                        isDark={isDark}
                        className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                      />
                    ) : viewMode === 'week' ? (
                      <WeekZoneSidebar
                        weekPlan={weekPlan}
                        selectedStop={selectedStop}
                        onSelectStop={setSelectedStop}
                        activeWeekdayFilter={activeWeekdayFilter}
                        onSelectWeekdayFilter={setActiveWeekdayFilter}
                        onMoveStopToWeekday={handleMoveStopToWeekday}
                        onReclusterWeek={handleReclusterWeek}
                        onOpenPlacement={() => setIsPlacementOpen(true)}
                        onEditStop={handleOpenEditStop}
                        maxShiftHours={maxShiftHours}
                        isDark={isDark}
                        className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                      />
                    ) : (
                      <StopListSidebar
                        stops={stops}
                        routeResult={routeResult}
                        selectedStop={selectedStop}
                        onSelectStop={setSelectedStop}
                        onMoveUp={handleMoveUp}
                        onMoveDown={handleMoveDown}
                        onSwapStops={handleSwapStops}
                        onReorderStop={handleReorderStop}
                        onDeleteStop={handleDeleteStop}
                        onToggleStatus={handleToggleStatus}
                        onAddStop={() => setIsAddPetOpen(true)}
                        onEditStop={handleOpenEditStop}
                        onOpenSolverDebug={() => setIsDebugOpen(true)}
                        onOpenBenchmark={() => setIsBenchmarkOpen(true)}
                        onTogglePin={handleTogglePinStop}
                        onReverseOrder={handleReverseRoute}
                        onChangeDuration={handleChangeStopDuration}
                        departureMinutes={departureMinutes}
                        isDark={isDark}
                        fleetSize={fleetSize}
                        maxShiftHours={maxShiftHours}
                        onSelectMaxShiftHours={handleSelectMaxShiftHours}
                        vehicleRoutes={routeResult.vehicleRoutes}
                        activeVanFilter={activeVanFilter}
                        onSelectVanFilter={setActiveVanFilter}
                        hasOptimized={hasOptimized}
                        isOptimizing={isOptimizing}
                        className={`w-full h-full border rounded-2xl shadow-xl ${isDark ? 'border-slate-800/80' : 'border-slate-300'}`}
                      />
                    )
                  )}

                  {activeMobileTab === 'hud' && (
                    <div className="no-print h-full overflow-y-auto">
                      {viewMode === 'week' ? (
                        <WeekDashboard
                          weekPlan={weekPlan}
                          fuelSettings={fuelSettings}
                          activeWeekdayFilter={activeWeekdayFilter}
                          onSelectWeekdayFilter={setActiveWeekdayFilter}
                          fleetSize={fleetSize}
                          className="w-full"
                          isDark={isDark}
                        />
                      ) : (
                        <VanDashboard
                          vehicleRoutes={routeResult.vehicleRoutes}
                          routeResult={routeResult}
                          hasOptimized={hasOptimized}
                          fleetSize={fleetSize}
                          activeVanFilter={activeVanFilter}
                          onSelectVanFilter={setActiveVanFilter}
                          onOptimize={handleOptimizeRoute}
                          isOptimizing={isOptimizing}
                          className="w-full"
                          isDark={isDark}
                        />
                      )}
                    </div>
                  )}

                  {activeMobileTab === 'controls' && (
                    <div className="no-print h-full overflow-y-auto">
                        <RouteControls
                        onOptimize={handleOptimizeRoute}
                        onAddStop={() => setIsAddPetOpen(true)}
                        onLoadDemoData={handleLoadDemoData}
                        onOpenPlacement={() => setIsPlacementOpen(true)}
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                        onToggleSimulation={handleToggleSimulation}
                        onReverseMeetingOrder={handleReverseRoute}
                        onResetSimulation={handleResetSimulation}
                        simStatus={simStatus}
                        simDirection={simDirection}
                        isSimulationDisabled={false}
                        isOptimizing={isOptimizing}
                        hasOptimized={hasOptimized}
                        routeResult={routeResult}
                        className="w-full"
                        telemetry={telemetry}
                        currentStop={stops[telemetry.currentStopIndex]}
                        currentStopIndex={telemetry.currentStopIndex}
                        stops={stops}
                        solverStep={solverStep}
                        solverUsed={debugInfo?.solverUsed}
                        showStepper={true}
                        showVanHud={true}
                        isDark={isDark}
                        fleetSize={fleetSize}
                        onFleetSizeChange={handleFleetSizeChange}
                        fleetAllocationMode={fleetAllocationMode}
                        onSelectFleetAllocationMode={handleSelectFleetAllocationMode}
                        maxShiftHours={maxShiftHours}
                        onSelectMaxShiftHours={handleSelectMaxShiftHours}
                        clientStopCount={clientStopCount}
                        onClientStopCountChange={handleClientStopCountChange}
                        onResetToDefaults={handleResetToDefaults}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Customer Visit Modal */}
      <AddPetModal
        isOpen={isAddPetOpen}
        onClose={() => {
          setIsAddPetOpen(false);
          setEditingStop(null);
        }}
        onAddStop={handleAddStop}
        onUpdateStop={handleUpdateStop}
        editingStop={editingStop}
        currentStopsCount={stops.length}
        centerLocation={currentCity.center}
        theme={theme}
      />

      {/* Where Should a New Customer Go Modal */}
      <PlacementModal
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
        weekPlan={weekPlan}
        allStops={stops}
        fuelSettings={fuelSettings}
        centerLocation={currentCity.center}
        departureMinutes={departureMinutes}
        maxShiftHours={maxShiftHours}
        onAcceptPlacement={handleAcceptPlacement}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDark={isDark}
      />

      {/* Fuel & Shift Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fuelSettings={fuelSettings}
        onSaveFuelSettings={handleSaveFuelSettings}
        maxShiftHours={maxShiftHours}
        isSignedIn={Boolean(user)}
        userEmail={user?.email || null}
        onDeleteAllDataRequest={() => setIsDeleteModalOpen(true)}
        isDeletingAllData={isDeletingAllData}
        isDark={isDark}
      />

      {/* Route Solver Debug Inspector Modal */}
      <DebugSolverModal
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        debugInfo={debugInfo}
        solverLogs={solverLogs}
        isDark={isDark}
      />

      {/* 5-Scenario Route Planner Benchmark Suite Modal */}
      <ScenarioTesterModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
        onSelectScenario={handleApplyScenario}
      />

      {/* Delete All My Data Confirmation Modal */}
      {isDeleteModalOpen && user && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-data-modal-title"
          className="no-print fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
              isDark
                ? 'bg-slate-900 border-rose-800/60 text-slate-100'
                : 'bg-white border-rose-200 text-slate-900'
            }`}
          >
            <div className={`px-5 py-4 border-b flex items-center gap-3 ${
              isDark ? 'border-slate-800 bg-rose-950/30' : 'border-rose-100 bg-rose-50'
            }`}>
              <div className={`p-2 rounded-xl border ${
                isDark ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-rose-100 border-rose-200 text-rose-600'
              }`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 id="delete-data-modal-title" className="text-base font-black font-display">
                  Delete all my data
                </h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {user.email || 'Signed-in account'}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                This will permanently erase all saved customers, weekday schedules, route preferences, and local settings for your account from Hamba Routes. This action cannot be undone.
              </p>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeletingAllData}
                  className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer ${
                    isDark
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-all-data-btn"
                  onClick={handleConfirmDeleteAllData}
                  disabled={isDeletingAllData}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-600/25"
                >
                  {isDeletingAllData ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting…</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Yes, delete all my data</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Hamba Routes Intro Overlay */}
      {!hasOptimized && !isIntroDismissed && (
        <div
          id="route-planner-intro-overlay"
          onClick={() => setIsIntroDismissed(true)}
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-[92vw] max-w-[340px] sm:max-w-[360px] p-4 sm:p-5 rounded-2xl shadow-2xl border transition-all cursor-default ${
              isDark
                ? 'bg-slate-900/98 border-slate-800 text-slate-100 shadow-slate-950/90'
                : 'bg-white/98 border-slate-200 text-slate-900 shadow-2xl'
            }`}
          >
            <button
              onClick={() => setIsIntroDismissed(true)}
              className={`absolute top-3.5 right-3.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Dismiss and explore map"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 ${
                isDark ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400' : 'bg-amber-100 border border-amber-300 text-amber-700'
              }`}>
                <Route className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-base font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Hamba Routes
                </h3>
                <p className={`text-[11px] font-semibold ${isDark ? 'text-amber-400/90' : 'text-amber-700'}`}>
                  Fewer kilometres. More visits.
                </p>
              </div>
            </div>

            <p className={`text-xs leading-snug mb-3.5 font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Optimise pool cleaning, pest control &amp; garden service visits across Sandton, Randburg, Bryanston, Fourways, Rosebank &amp; Midrand (Mon–Fri 07:00–16:00 SAST).
            </p>

            <div className={`p-3.5 rounded-2xl border mb-4 flex flex-col gap-2.5 transition-colors ${
              isDark ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              {/* 1. Customer Visits Customizer */}
              <div className="flex items-center justify-between py-0.5">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  Customer Visits
                </span>
                <div className={`flex items-center rounded-xl border p-0.5 shrink-0 ${
                  isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white'
                }`}>
                  <button
                    onClick={() => handleClientStopCountChange(clientStopCount - 1)}
                    disabled={clientStopCount <= MIN_CLIENT_STOPS}
                    title="Decrease visits"
                    className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-slate-700/50 disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    -
                  </button>
                  <span className="px-3 font-mono text-xs font-bold min-w-[28px] text-center">{clientStopCount}</span>
                  <button
                    onClick={() => handleClientStopCountChange(clientStopCount + 1)}
                    disabled={clientStopCount >= MAX_CLIENT_STOPS}
                    title="Increase visits"
                    className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-slate-700/50 disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 2. Vehicles (Fleet) Customizer */}
              <div className="flex items-center justify-between py-0.5">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-400" />
                  Vehicles (Fleet)
                </span>
                <div className={`flex items-center rounded-xl border p-0.5 shrink-0 ${
                  isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white'
                }`}>
                  <button
                    onClick={() => handleFleetSizeChange(fleetSize - 1)}
                    disabled={fleetSize <= MIN_FLEET_SIZE}
                    title="Decrease vehicles"
                    className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-slate-700/50 disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    -
                  </button>
                  <span className="px-3 font-mono text-xs font-bold min-w-[28px] text-center">{fleetSize}</span>
                  <button
                    onClick={() => handleFleetSizeChange(fleetSize + 1)}
                    disabled={fleetSize >= MAX_FLEET_SIZE}
                    title="Increase vehicles"
                    className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-slate-700/50 disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Workload Warning & Mitigation */}
              {(() => {
                const stopsPerVan = Math.ceil(clientStopCount / fleetSize);
                const estShiftMins = stopsPerVan * 35 + 30;
                const isHighWorkload = stopsPerVan > 14 || estShiftMins > maxShiftHours * 60;
                if (!isHighWorkload) return null;
                const recommendedFleet = calculateRequiredFleet(clientStopCount, maxShiftHours);
                const maxStopsForCurrentFleet = fleetSize * 14;
                return (
                  <div className={`mt-2 p-2.5 rounded-xl border text-xs flex flex-col gap-2 ${
                    isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span className="font-bold">High Shift Workload:</span> {clientStopCount} visits across {fleetSize} vehicles (~{stopsPerVan} visits/vehicle, ~{(estShiftMins / 60).toFixed(1)}h shift). May exceed {maxShiftHours}h (07:00–16:00) shift.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {recommendedFleet > fleetSize && (
                        <button
                          type="button"
                          onClick={() => handleFleetSizeChange(recommendedFleet, 'manual')}
                          className="px-2 py-1 rounded-lg font-bold text-[11px] bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                        >
                          Use {recommendedFleet} Vehicles
                        </button>
                      )}
                      {clientStopCount > maxStopsForCurrentFleet && (
                        <button
                          type="button"
                          onClick={() => handleClientStopCountChange(maxStopsForCurrentFleet)}
                          className="px-2 py-1 rounded-lg font-bold text-[11px] border border-amber-500/40 hover:bg-amber-500/20 transition-colors cursor-pointer"
                        >
                          Drop to {maxStopsForCurrentFleet} Visits
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleLoadDemoData}
                disabled={isOptimizing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                  isDark
                    ? 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border-sky-500/40'
                    : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Load demo data (40 customers · 3 vehicles)</span>
              </button>

              <button
                onClick={() => {
                  setIsIntroDismissed(true);
                  handleOptimizeRoute();
                }}
                disabled={isOptimizing}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 px-4 py-3 rounded-xl text-sm font-black shadow-xl shadow-amber-500/30 transition-all hover:scale-[1.01] active:scale-[0.98] ring-2 ring-amber-400/40 disabled:opacity-50 cursor-pointer tracking-tight"
              >
                <Sparkles className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
                <span>{isOptimizing ? 'Planning Routes...' : 'Plan Routes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
