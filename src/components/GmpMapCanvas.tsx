import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PetStop,
  RouteLeg,
  LatLng,
  VanTelemetry,
  CityPreset,
  Weekday,
  WEEKDAYS,
  WEEKDAY_SHORT,
  WEEKDAY_COLORS,
  WeekSchedulePlan,
  TodayRoutePlan
} from '../types';
import { Navigation, X, Clock, Flag, EyeOff, Truck, ChevronDown, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { loadMapsLibrary, hasClientMapsKey, SOLUTION_ATTRIBUTION_ID } from '../services/mapsLoader';
import { validateTimeWindows, validateFleet } from '../utils/tspSolver';
import { JHB_VEHICLES } from '../data/mockPetStops';

interface GmpMapCanvasProps {
  stops: PetStop[];
  legs: RouteLeg[];
  selectedStop: PetStop | null;
  onSelectStop: (stop: PetStop | null) => void;
  telemetry: VanTelemetry;
  cityCenter: LatLng;
  zoom: number;
  routeTitle: string;
  simulatedTime: string;
  simStatus: 'idle' | 'running' | 'paused';
  cities?: CityPreset[];
  currentCity?: CityPreset;
  onSelectCity?: (cityId: string) => void;
  departureMinutes?: number;
  onDepartureTimeChange?: (timeStr: string) => void;
  theme?: 'dark' | 'light';
  vehicleRoutes?: any[];
  fleetSize?: number;
  activeVanFilter?: string;
  hasOptimized?: boolean;
  showGrouping?: boolean;
  showPolylines?: boolean;
  onOptimize?: () => void;
  isOptimizing?: boolean;
  fitBoundsKey?: number;
  viewMode?: 'day' | 'week' | 'today' | 'savings';
  weekPlan?: WeekSchedulePlan;
  todayPlan?: TodayRoutePlan | null;
  activeWeekdayFilter?: 'all' | Weekday;
  onSelectWeekdayFilter?: (day: 'all' | Weekday) => void;
  quotaExceeded?: boolean;
  mapError?: string | null;
  onRetryMap?: () => void;
}

const VAN_HEX_COLORS: Record<string, string> = {
  'van-1': '#3b82f6',
  'van-2': '#10b981',
  'van-3': '#a855f7',
  'van-4': '#f59e0b',
  'van-5': '#ec4899',
  'van-6': '#06b6d4',
  'van-7': '#84cc16',
  'van-8': '#f97316'
};

export const GmpMapCanvas: React.FC<GmpMapCanvasProps> = ({
  stops,
  legs,
  selectedStop,
  onSelectStop,
  telemetry,
  cityCenter,
  zoom,
  routeTitle,
  simulatedTime,
  simStatus,
  cities,
  currentCity,
  onSelectCity,
  departureMinutes = 420,
  onDepartureTimeChange,
  theme = 'dark',
  vehicleRoutes = [],
  fleetSize = 3,
  activeVanFilter = 'all',
  hasOptimized = false,
  showGrouping = false,
  showPolylines = false,
  isOptimizing = false,
  fitBoundsKey = 0,
  viewMode = 'day',
  weekPlan,
  todayPlan = null,
  activeWeekdayFilter = 'all',
  onSelectWeekdayFilter,
  quotaExceeded = false,
  mapError = null,
  onRetryMap
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const extraDepotMarkersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const vanMarkerRef = useRef<any>(null);
  const fleetVanMarkersRef = useRef<Map<string, any>>(new Map());
  const markerMapRef = useRef<Map<string, any>>(new Map());
  const lastFitKeyRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'legs'>('map');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, setIsFocused] = useState(false);
  const [showClock, setShowClock] = useState<boolean>(true);
  const [isDriveMenuOpen, setIsDriveMenuOpen] = useState<boolean>(false);
  const driveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (driveMenuRef.current && !driveMenuRef.current.contains(event.target as Node)) {
        setIsDriveMenuOpen(false);
      }
    };
    if (isDriveMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDriveMenuOpen]);

  const isDark = theme === 'dark';

  const effectiveFleetRoutes = useMemo(() => {
    if (vehicleRoutes && vehicleRoutes.length > 1) return vehicleRoutes;
    if (fleetSize > 1 && stops.length > 1) {
      const depot = stops[0];
      const groups: Record<string, PetStop[]> = {};
      stops.slice(1).forEach(s => {
        const vId = s.assignedVanId || 'van-1';
        if (!groups[vId]) groups[vId] = [depot];
        groups[vId].push(s);
      });
      return Object.entries(groups).map(([vId, vStops]) => {
        const vIdx = Math.max(0, parseInt(vId.replace('van-', ''), 10) - 1);
        const preset = JHB_VEHICLES[vIdx];
        const vDepot = preset
          ? {
              ...depot,
              name: preset.depotName,
              address: preset.depotAddress,
              location: preset.depotLocation
            }
          : depot;
        return {
          vehicleId: vId,
          vehicleLabel: preset?.vehicleLabel || `Vehicle 0${vIdx + 1}`,
          technicianName: preset?.technicianName,
          depotName: preset?.depotName,
          orderedStops: [vDepot, ...vStops.filter(s => s.id !== 'depot')],
          stops: [vDepot, ...vStops.filter(s => s.id !== 'depot')],
          legs: []
        };
      });
    }
    return null;
  }, [vehicleRoutes, fleetSize, stops]);

  const fleetValidation = useMemo(() => {
    if (effectiveFleetRoutes && effectiveFleetRoutes.length > 1) {
      return validateFleet(effectiveFleetRoutes, departureMinutes);
    }
    return null;
  }, [effectiveFleetRoutes, departureMinutes]);

  const validation = useMemo(() => {
    if (fleetValidation) {
      if (activeVanFilter && activeVanFilter !== 'all') {
        const vanVal = fleetValidation.vanValidations[activeVanFilter];
        if (vanVal) return vanVal;
      }
      let maxReturnMin = 0;
      Object.values(fleetValidation.vanValidations).forEach(vv => {
        if (vv.totalShiftMinutes + departureMinutes > maxReturnMin) {
          maxReturnMin = vv.totalShiftMinutes + departureMinutes;
        }
      });
      const returnHrs = Math.floor(maxReturnMin / 60) % 24;
      const returnMins = Math.floor(maxReturnMin % 60);
      const returnDisplayHrs = returnHrs < 10 ? `0${returnHrs}` : `${returnHrs}`;
      const returnDisplayMins = returnMins < 10 ? `0${returnMins}` : `${returnMins}`;

      return {
        arrivalTimes: {},
        violationsCount: fleetValidation.totalViolations,
        violatedStopIds: [],
        totalShiftMinutes: fleetValidation.maxShiftMinutes,
        totalWaitMinutes: fleetValidation.totalWaitMinutes,
        formattedShiftDuration: fleetValidation.formattedMaxShift,
        returnTime: `${returnDisplayHrs}:${returnDisplayMins}`,
        timelineLegs: []
      };
    }
    return validateTimeWindows(stops, legs, departureMinutes);
  }, [stops, legs, departureMinutes, fleetValidation, activeVanFilter]);

  const buildVanNavigationUrl = (targetVanId?: string): string => {
    let targetStops: PetStop[] = [];
    const depot = stops.find(s => s.id === 'depot') || stops[0];
    if (!depot) return '#';

    if (targetVanId && targetVanId !== 'all') {
      const normalizedTarget = targetVanId.toLowerCase();
      if (effectiveFleetRoutes && effectiveFleetRoutes.length > 0) {
        const vr = effectiveFleetRoutes.find(v =>
          v.vehicleId?.toLowerCase() === normalizedTarget ||
          v.vehicleId?.replace('0', '').toLowerCase() === normalizedTarget.replace('0', '')
        );
        if (vr && (vr.orderedStops || vr.stops)) {
          targetStops = vr.orderedStops || vr.stops;
        }
      }
      if (targetStops.length === 0) {
        targetStops = [
          depot,
          ...stops.filter(s => s.id !== 'depot' && (
            s.assignedVanId?.toLowerCase() === normalizedTarget ||
            s.assignedVanId?.replace('0', '').toLowerCase() === normalizedTarget.replace('0', '')
          ))
        ];
      }
    } else {
      targetStops = stops;
    }

    if (targetStops.length < 2) return '#';

    const vehicleDepot = targetStops.find(s => s.id === 'depot') || depot;
    const depotLoc = vehicleDepot.location;
    const origin = `${depotLoc.lat},${depotLoc.lng}`;
    const clientStops = targetStops.filter(s => s.id !== 'depot');
    if (clientStops.length === 0) return '#';

    const waypoints = clientStops.map(s => `${s.location.lat},${s.location.lng}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${origin}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
  };

  const formatMinutesToTimeStr = (totalMin?: number): string => {
    if (totalMin === undefined || totalMin === null || isNaN(totalMin)) return '';
    const hrs = Math.floor(totalMin / 60) % 24;
    const mins = Math.floor(totalMin % 60);
    const displayHrs = hrs < 10 ? `0${hrs}` : hrs;
    const displayMins = mins < 10 ? `0${mins}` : mins;
    return `${displayHrs}:${displayMins}`;
  };

  const formatReturnTime24h = (timeStr?: string): string => {
    if (!timeStr || timeStr === '--:--' || timeStr.includes('NaN')) return '--:--';
    const parts = timeStr.replace(/\s*(AM|PM)\s*/i, '').split(':');
    if (parts.length < 2) return timeStr;
    const hrs = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (isNaN(hrs) || isNaN(mins)) return timeStr;
    const displayHrs = hrs < 10 ? `0${hrs}` : `${hrs}`;
    const displayMins = mins < 10 ? `0${mins}` : `${mins}`;
    return `${displayHrs}:${displayMins}`;
  };

  // Initialize Google Map with Advanced Markers and Vector rendering
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapRef.current) return;

      if (!hasClientMapsKey()) {
        setInitError('Google Maps API key is not configured. Map tiles are unavailable, but route planning & savings remain active.');
        setMapLoaded(false);
        return;
      }

      try {
        setInitError(null);
        setMapLoaded(false);
        const { Map } = await loadMapsLibrary('maps');
        await loadMapsLibrary('marker');
        const coreLib = await loadMapsLibrary('core').catch(() => null);

        if (!isMounted || !mapRef.current) return;

        const colorScheme = coreLib?.ColorScheme
          ? isDark
            ? coreLib.ColorScheme.DARK
            : coreLib.ColorScheme.LIGHT
          : isDark
          ? 'DARK'
          : 'LIGHT';

        const prevCenter = googleMapInstanceRef.current?.getCenter?.();
        const prevZoom = googleMapInstanceRef.current?.getZoom?.();

        markerMapRef.current.clear();
        markersRef.current = [];
        extraDepotMarkersRef.current.forEach(m => {
          if (m.setMap) m.setMap(null);
          if (m.map) m.map = null;
        });
        extraDepotMarkersRef.current = [];
        polylinesRef.current.forEach(p => p.setMap(null));
        polylinesRef.current = [];
        vanMarkerRef.current = null;
        fleetVanMarkersRef.current.clear();

        const mapInstance = new Map(mapRef.current, {
          center: prevCenter ? { lat: prevCenter.lat(), lng: prevCenter.lng() } : { lat: cityCenter.lat, lng: cityCenter.lng },
          zoom: typeof prevZoom === 'number' ? prevZoom : zoom,
          mapId: 'DEMO_MAP_ID',
          colorScheme,
          disableDefaultUI: false,
          tilt: 45,
          heading: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          ...(SOLUTION_ATTRIBUTION_ID ? { internalUsageAttributionIds: [SOLUTION_ATTRIBUTION_ID] } : {})
        });

        if (mapRef.current && SOLUTION_ATTRIBUTION_ID) {
          mapRef.current.setAttribute('internal-usage-attribution-ids', SOLUTION_ATTRIBUTION_ID);
        }
        if (typeof (mapInstance as any)?.setAttribute === 'function' && SOLUTION_ATTRIBUTION_ID) {
          (mapInstance as any).setAttribute('internal-usage-attribution-ids', SOLUTION_ATTRIBUTION_ID);
        }

        googleMapInstanceRef.current = mapInstance;
        setMapLoaded(true);
      } catch (err: any) {
        console.warn('Map initialization:', err);
        if (isMounted) {
          const msg = String(err?.message || err || '');
          if (msg.toLowerCase().includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            setInitError('Google Maps Platform quota exceeded.');
          } else {
            setInitError('Unable to load Google Maps right now. Check connectivity or quota and retry.');
          }
          setMapLoaded(false);
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [isDark, retryCount]);

  // Fit bounds when city changes OR Today's route weekday/vehicle switches OR demo data triggers fitBoundsKey
  useEffect(() => {
    if (!googleMapInstanceRef.current || !mapLoaded) return;
    const cityId = currentCity?.id || `${cityCenter.lat},${cityCenter.lng}`;
    const todaySig = viewMode === 'today' && todayPlan ? `today:${todayPlan.weekday}:${todayPlan.vehicleId}` : 'default';
    const triggerKey = `${cityId}:${fitBoundsKey}:${todaySig}`;
    if (lastFitKeyRef.current === triggerKey) return;
    lastFitKeyRef.current = triggerKey;

    const map = googleMapInstanceRef.current;
    const googleObj = (window as any).google;

    if (viewMode === 'today' && todayPlan && googleObj?.maps) {
      const bounds = new googleObj.maps.LatLngBounds();
      bounds.extend({ lat: todayPlan.depotStop.location.lat, lng: todayPlan.depotStop.location.lng });
      todayPlan.activeEntries.forEach((e) => bounds.extend({ lat: e.stop.location.lat, lng: e.stop.location.lng }));
      todayPlan.completedEntries.forEach((c) => bounds.extend({ lat: c.stop.location.lat, lng: c.stop.location.lng }));
      todayPlan.overflowStops.forEach((o) => bounds.extend({ lat: o.location.lat, lng: o.location.lng }));
      map.fitBounds(bounds, { top: 85, bottom: 75, left: 65, right: 65 });
      return;
    }

    if (stops.length > 0 && googleObj?.maps) {
      const bounds = new googleObj.maps.LatLngBounds();
      stops.forEach(s => bounds.extend({ lat: s.location.lat, lng: s.location.lng }));
      if (fleetSize > 1) {
        JHB_VEHICLES.slice(0, fleetSize).forEach(v => bounds.extend(v.depotLocation));
      }
      map.fitBounds(bounds, { top: 85, bottom: 75, left: 65, right: 65 });
    } else {
      map.setCenter({ lat: cityCenter.lat, lng: cityCenter.lng });
      map.setZoom(zoom);
    }
  }, [currentCity?.id, cityCenter.lat, cityCenter.lng, zoom, mapLoaded, fitBoundsKey, stops.length, fleetSize, viewMode, todayPlan?.weekday, todayPlan?.vehicleId]);

  // Render colored multi-leg polylines (Day View, Week View, or Today's Route View)
  useEffect(() => {
    const googleObj = (window as any).google;
    const map = googleMapInstanceRef.current;
    if (!map || !googleObj?.maps) return;

    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (viewMode === 'today' && todayPlan) {
      const strokeColor = WEEKDAY_COLORS[todayPlan.weekday] || '#f59e0b';
      todayPlan.legs.forEach((leg) => {
        if (!leg.pathCoordinates || leg.pathCoordinates.length === 0) return;
        const polyline = new googleObj.maps.Polyline({
          path: leg.pathCoordinates,
          geodesic: true,
          strokeColor,
          strokeOpacity: 0.96,
          strokeWeight: 5.5,
          zIndex: 60,
          map
        });
        polylinesRef.current.push(polyline);
      });
      return;
    }

    if (viewMode === 'week' && weekPlan) {
      weekPlan.dayRoutes.forEach((dr) => {
        if (!dr.legs || dr.legs.length === 0) return;
        const dayColor = WEEKDAY_COLORS[dr.weekday] || '#38bdf8';
        const isFocused = activeWeekdayFilter === 'all' || dr.weekday === activeWeekdayFilter;
        const isDimmed = activeWeekdayFilter !== 'all' && dr.weekday !== activeWeekdayFilter;

        dr.legs.forEach((leg) => {
          if (!leg.pathCoordinates || leg.pathCoordinates.length === 0) return;
          const polyline = new googleObj.maps.Polyline({
            path: leg.pathCoordinates,
            geodesic: true,
            strokeColor: dayColor,
            strokeOpacity: isDimmed ? 0.1 : isFocused ? 0.92 : 0.8,
            strokeWeight: isDimmed ? 1.5 : activeWeekdayFilter === dr.weekday ? 5.0 : 3.5,
            zIndex: isFocused ? 45 : 1,
            map: map
          });
          polylinesRef.current.push(polyline);
        });
      });
      return;
    }

    if ((!hasOptimized && !showPolylines) || legs.length === 0) {
      return;
    }

    legs.forEach((leg: any) => {
      if (!leg.pathCoordinates || leg.pathCoordinates.length === 0) return;

      const toStop = stops.find(s => s.id === leg.toStopId);
      const fromStop = stops.find(s => s.id === leg.fromStopId);
      const legVanId = leg.vanId || leg.vehicleId || toStop?.assignedVanId || fromStop?.assignedVanId || 'van-1';
      const strokeColor = VAN_HEX_COLORS[legVanId] || '#3b82f6';
      const isFocused = activeVanFilter === 'all' || legVanId === activeVanFilter;
      const isDimmed = activeVanFilter !== 'all' && legVanId !== activeVanFilter;

      const polyline = new googleObj.maps.Polyline({
        path: leg.pathCoordinates,
        geodesic: true,
        strokeColor: strokeColor,
        strokeOpacity: isDimmed ? 0.15 : isFocused ? 0.95 : 0.85,
        strokeWeight: isDimmed ? 2.0 : isFocused ? 5.5 : 4.0,
        zIndex: isFocused ? 50 : 1,
        map: map
      });

      polylinesRef.current.push(polyline);
    });
  }, [legs, activeVanFilter, mapLoaded, stops, showPolylines, hasOptimized, viewMode, weekPlan, todayPlan, activeWeekdayFilter]);

  // Render Johannesburg vehicle depot markers (Sandton, Randburg, Midrand)
  useEffect(() => {
    const googleObj = (window as any).google;
    const map = googleMapInstanceRef.current;
    if (!map || !googleObj?.maps || !mapLoaded || simStatus === 'running') return;

    let cancelled = false;

    async function syncVehicleDepots() {
      try {
        let AdvancedMarkerElement = googleObj.maps.marker?.AdvancedMarkerElement;
        if (!AdvancedMarkerElement) {
          const markerLib = await googleObj.maps.importLibrary('marker');
          AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
        }
        if (cancelled) return;

        extraDepotMarkersRef.current.forEach(m => {
          if (m.setMap) m.setMap(null);
          if (m.map) m.map = null;
        });
        extraDepotMarkersRef.current = [];

        const depotsToShow = JHB_VEHICLES.slice(0, Math.min(fleetSize, JHB_VEHICLES.length));
        depotsToShow.forEach((vp, idx) => {
          const isDimmed = viewMode === 'today' && todayPlan
            ? todayPlan.vehicleId !== vp.vehicleId
            : activeVanFilter !== 'all' && activeVanFilter !== vp.vehicleId;
          const badgeColor =
            idx === 0 ? 'bg-blue-600 border-blue-300' : idx === 1 ? 'bg-emerald-600 border-emerald-300' : 'bg-purple-600 border-purple-300';
          const el = document.createElement('div');
          el.className = `group relative flex flex-col items-center cursor-pointer transition-all hover:scale-110 ${
            isDimmed ? 'opacity-25 grayscale' : 'opacity-100'
          }`;
          el.innerHTML = `
            <div class="relative flex items-center justify-center">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center ${badgeColor} border-2 shadow-xl">
                <span class="text-sm">🏢</span>
                <span class="absolute -top-1.5 -right-2 px-1 py-0 rounded bg-slate-950 text-white font-black text-[8px] border border-white/60 shadow">
                  V${idx + 1}
                </span>
              </div>
            </div>
            <div class="absolute -bottom-6 hidden group-hover:flex items-center justify-center bg-slate-950 text-white text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-lg whitespace-nowrap pointer-events-none z-40">
              ${vp.depotName} · ${vp.technicianName}
            </div>
          `;
          const marker = new AdvancedMarkerElement({
            map,
            position: vp.depotLocation,
            title: `${vp.depotName} (${vp.depotAddress}) — ${vp.technicianName}`,
            content: el,
            zIndex: 40
          });
          extraDepotMarkersRef.current.push(marker);
        });
      } catch (err) {
        console.warn('Vehicle depot markers error:', err);
      }
    }

    syncVehicleDepots();
    return () => {
      cancelled = true;
    };
  }, [mapLoaded, fleetSize, activeVanFilter, simStatus, viewMode, todayPlan?.vehicleId]);

  // Update Advanced Markers incrementally
  useEffect(() => {
    const googleObj = (window as any).google;
    const map = googleMapInstanceRef.current;
    if (!map || !googleObj?.maps) return;

    if (simStatus === 'running') return;

    async function syncMarkers() {
      try {
        let AdvancedMarkerElement = googleObj.maps.marker?.AdvancedMarkerElement;
        if (!AdvancedMarkerElement) {
          const markerLib = await googleObj.maps.importLibrary('marker');
          AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
        }

        const currentStopIds = new Set(stops.map(s => s.id));

        markerMapRef.current.forEach((marker, stopId) => {
          if (!currentStopIds.has(stopId)) {
            if (marker.setMap) marker.setMap(null);
            if (marker.map) marker.map = null;
            markerMapRef.current.delete(stopId);
          }
        });

        const isWeekMode = viewMode === 'week';
        const isTodayMode = viewMode === 'today';
        const isGrouped = isTodayMode || isWeekMode || hasOptimized || showGrouping;

        const todayActiveMap = new Map<string, { seq: number; eta: string }>();
        const todayCompletedMap = new Map<string, 'done' | 'skipped'>();
        const todayOverflowSet = new Set<string>();
        if (isTodayMode && todayPlan) {
          todayPlan.activeEntries.forEach((e) => {
            todayActiveMap.set(e.stop.id, { seq: e.sequenceNumber, eta: e.arrivalTime });
          });
          todayPlan.completedEntries.forEach((c) => {
            todayCompletedMap.set(c.stop.id, c.status);
          });
          todayPlan.overflowStops.forEach((o) => {
            todayOverflowSet.add(o.id);
          });
        }

        stops.forEach((stop, index) => {
          const isDepot = stop.id === 'depot';
          // Individual vehicle depots (V1 Sandton, V2 Randburg, V3 Midrand) render via extraDepotMarkersRef
          if (isDepot) {
            const existingDepot = markerMapRef.current.get('depot');
            if (existingDepot) {
              if (existingDepot.setMap) existingDepot.setMap(null);
              if (existingDepot.map) existingDepot.map = null;
              markerMapRef.current.delete('depot');
            }
            return;
          }

          const isSelected = selectedStop?.id === stop.id;
          const isPinned = stop.isPinned;
          const assignedDay: Weekday = stop.assignedWeekday || 'Monday';
          const dayColor = WEEKDAY_COLORS[assignedDay] || '#38bdf8';

          const todayActive = todayActiveMap.get(stop.id);
          const todayCompletedStatus = todayCompletedMap.get(stop.id);
          const isTodayOverflow = todayOverflowSet.has(stop.id);
          const isInTodayPlan = Boolean(todayActive || todayCompletedStatus || isTodayOverflow);

          const isFilteredOut = isTodayMode
            ? !isInTodayPlan
            : isWeekMode
            ? activeWeekdayFilter !== 'all' && assignedDay !== activeWeekdayFilter
            : isGrouped && activeVanFilter !== 'all' && stop.assignedVanId && stop.assignedVanId !== activeVanFilter;

          let vanNum = 1;
          if (stop.assignedVanId && stop.assignedVanId.startsWith('van-')) {
            const parsed = parseInt(stop.assignedVanId.replace('van-', ''), 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= fleetSize) {
              vanNum = parsed;
            }
          }

          const vanBadge = isGrouped && fleetSize > 1 ? `V${vanNum}` : null;
          const badgeText = isTodayMode
            ? todayActive
              ? `#${todayActive.seq}`
              : todayCompletedStatus === 'done'
              ? '✓'
              : todayCompletedStatus === 'skipped'
              ? 'Skip'
              : isTodayOverflow
              ? '25+'
              : ''
            : isWeekMode
            ? `${WEEKDAY_SHORT[assignedDay]}·V${vanNum}`
            : vanBadge
            ? `${vanBadge}·${stop.vanOrder || index}`
            : String(index);

          const vanBorderColor = isTodayMode
            ? todayActive
              ? 'bg-slate-950/95 text-white shadow-xl border-amber-400'
              : isTodayOverflow
              ? 'bg-rose-950/95 text-white border-rose-500'
              : 'bg-slate-900/80 text-slate-300 border-slate-600'
            : isWeekMode
            ? 'bg-slate-950/90 text-white shadow-lg'
            : !isGrouped
            ? 'border-slate-800 bg-black text-white shadow-xl shadow-black/80 ring-1 ring-slate-700'
            : isFilteredOut
            ? 'border-slate-500/50 bg-slate-800/80 shadow-none'
            : fleetSize > 1
            ? vanNum === 1
              ? 'border-blue-500 bg-blue-950/90 shadow-blue-500/20'
              : vanNum === 2
              ? 'border-emerald-500 bg-emerald-950/90 shadow-emerald-500/20'
              : vanNum === 3
              ? 'border-purple-500 bg-purple-950/90 shadow-purple-500/20'
              : vanNum === 4
              ? 'border-amber-500 bg-amber-950/90 shadow-amber-500/20'
              : vanNum === 5
              ? 'border-pink-500 bg-pink-950/90 shadow-pink-500/20'
              : vanNum === 6
              ? 'border-cyan-500 bg-cyan-950/90 shadow-cyan-500/20'
              : vanNum === 7
              ? 'border-lime-500 bg-lime-950/90 shadow-lime-500/20'
              : 'border-orange-500 bg-orange-950/90 shadow-orange-500/20'
            : 'border-sky-400 bg-slate-900 shadow-slate-900/30';

          const vanBadgeBg = isTodayMode
            ? todayActive
              ? 'bg-amber-400 text-slate-950'
              : todayCompletedStatus === 'done'
              ? 'bg-emerald-500 text-white'
              : isTodayOverflow
              ? 'bg-rose-500 text-white'
              : 'bg-slate-600 text-slate-200'
            : isWeekMode
            ? 'text-slate-950'
            : !isGrouped
            ? 'hidden'
            : isFilteredOut
            ? 'bg-slate-600 text-slate-300'
            : fleetSize > 1
            ? vanNum === 1
              ? 'bg-blue-500 text-white'
              : vanNum === 2
              ? 'bg-emerald-500 text-white'
              : vanNum === 3
              ? 'bg-purple-500 text-white'
              : vanNum === 4
              ? 'bg-amber-500 text-white'
              : vanNum === 5
              ? 'bg-pink-500 text-white'
              : vanNum === 6
              ? 'bg-cyan-500 text-white'
              : vanNum === 7
              ? 'bg-lime-500 text-white'
              : 'bg-orange-500 text-white'
            : 'bg-amber-400 text-slate-950';

          let pinContainer: HTMLDivElement;
          const existingMarker = markerMapRef.current.get(stop.id);

          if (existingMarker && existingMarker.content) {
            pinContainer = existingMarker.content;
          } else {
            pinContainer = document.createElement('div');
          }

          const circleBorderStyle = isWeekMode && !isSelected ? `style="border-color: ${dayColor};"` : '';
          const badgeBgStyle = isWeekMode ? `style="background-color: ${dayColor};"` : '';

          const todayOpacityClass = isTodayMode
            ? !isInTodayPlan
              ? 'opacity-0 pointer-events-none scale-75 z-0'
              : todayCompletedStatus
              ? 'opacity-45 grayscale scale-90 z-10'
              : 'opacity-100 scale-100 z-25'
            : isFilteredOut
            ? 'opacity-20 grayscale scale-80 pointer-events-none z-0'
            : 'opacity-100 scale-100 z-20';

          const hoverLabel = isTodayMode && todayActive
            ? `${todayActive.seq}. ${stop.name} · ETA ${todayActive.eta}`
            : stop.name;

          pinContainer.className = `group relative flex flex-col items-center cursor-pointer transition-all hover:scale-110 active:scale-95 ${todayOpacityClass}`;
          pinContainer.innerHTML = `
            <div class="relative flex items-center justify-center">
              <div ${circleBorderStyle} class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                isSelected
                  ? 'bg-indigo-600 border-white ring-4 ring-indigo-400/60 scale-110'
                  : vanBorderColor
              }">
                <span class="text-xs sm:text-sm leading-none">${String(stop.avatar || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</span>
                ${isGrouped ? `
                  <span ${badgeBgStyle} class="absolute -top-1.5 -right-1.5 px-1 py-0 min-w-[16px] h-3.5 rounded-full ${vanBadgeBg} font-black text-[8px] flex items-center justify-center shadow border border-white">
                    ${badgeText}
                  </span>
                ` : ''}
                ${isPinned && !isTodayMode ? `
                  <span class="absolute -bottom-1 -left-1 text-[8px] drop-shadow">📌</span>
                ` : ''}
              </div>
            </div>
            <div class="${
              isSelected ? 'flex' : 'hidden group-hover:flex'
            } absolute -bottom-6 items-center justify-center bg-slate-950/95 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg border border-slate-700 whitespace-nowrap pointer-events-none z-30">
              ${String(hoverLabel || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}
            </div>
          `;

          if (existingMarker) {
            existingMarker.position = { lat: stop.location.lat, lng: stop.location.lng };
          } else {
            const marker = new AdvancedMarkerElement({
              map: map,
              position: { lat: stop.location.lat, lng: stop.location.lng },
              title: hoverLabel,
              content: pinContainer
            });

            marker.addListener('click', () => {
              onSelectStop(stop);
            });

            markersRef.current.push(marker);
            markerMapRef.current.set(stop.id, marker);
          }
        });
      } catch (err) {
        console.warn('Marker sync error:', err);
      }
    }

    syncMarkers();
  }, [stops, onSelectStop, mapLoaded, activeVanFilter, fleetSize, isDark, hasOptimized, showGrouping, simStatus, viewMode, todayPlan, activeWeekdayFilter]);

  // Update selected and filtered marker styles dynamically in place
  useEffect(() => {
    const isWeekMode = viewMode === 'week';
    const isTodayMode = viewMode === 'today';
    const todayActiveIds = new Set(todayPlan?.activeEntries.map(e => e.stop.id) || []);
    const todayCompletedIds = new Set(todayPlan?.completedEntries.map(c => c.stop.id) || []);
    const todayOverflowIds = new Set(todayPlan?.overflowStops.map(o => o.id) || []);

    markerMapRef.current.forEach((marker, stopId) => {
      if (stopId === 'depot') return;
      const stop = stops.find(s => s.id === stopId);
      if (!stop) return;

      const isSelected = selectedStop?.id === stopId;
      const assignedDay: Weekday = stop.assignedWeekday || 'Monday';
      const dayColor = WEEKDAY_COLORS[assignedDay] || '#38bdf8';

      const inToday = todayActiveIds.has(stopId) || todayCompletedIds.has(stopId) || todayOverflowIds.has(stopId);
      const isFilteredOut = isTodayMode
        ? !inToday
        : isWeekMode
        ? activeWeekdayFilter !== 'all' && assignedDay !== activeWeekdayFilter
        : activeVanFilter !== 'all' && stop.assignedVanId && stop.assignedVanId !== activeVanFilter;

      if (marker.content) {
        const cls = isTodayMode
          ? !inToday
            ? 'opacity-0 pointer-events-none scale-75 z-0'
            : todayCompletedIds.has(stopId)
            ? 'opacity-45 grayscale scale-90 z-10'
            : 'opacity-100 scale-100 z-25'
          : isFilteredOut
          ? 'opacity-20 grayscale scale-80 pointer-events-none z-0'
          : 'opacity-100 scale-100 z-20';
        marker.content.className = `group relative flex flex-col items-center cursor-pointer transition-all hover:scale-110 active:scale-95 ${cls}`;
      }

      const circleDiv = marker.content?.querySelector('.rounded-full') as HTMLElement | null;
      if (circleDiv) {
        circleDiv.classList.remove(
          'bg-indigo-600', 'border-white', 'ring-4', 'ring-indigo-400/60', 'scale-110',
          'border-blue-500', 'bg-blue-950/90',
          'border-emerald-500', 'bg-emerald-950/90',
          'border-purple-500', 'bg-purple-950/90',
          'border-amber-500', 'bg-amber-950/90',
          'border-pink-500', 'bg-pink-950/90',
          'border-cyan-500', 'bg-cyan-950/90',
          'border-lime-500', 'bg-lime-950/90',
          'border-orange-500', 'bg-orange-950/90',
          'border-slate-500/50', 'bg-slate-800/80',
          'border-sky-400', 'bg-slate-900',
          'border-slate-800', 'bg-black', 'text-white'
        );
        circleDiv.style.borderColor = '';

        const isGrouped = isTodayMode || isWeekMode || hasOptimized || showGrouping;

        if (isTodayMode) {
          if (isSelected) {
            circleDiv.classList.add('bg-indigo-600', 'border-white', 'ring-4', 'ring-indigo-400/60', 'scale-110');
          } else if (todayOverflowIds.has(stopId)) {
            circleDiv.classList.add('border-rose-500', 'bg-rose-950/95', 'text-white');
          } else {
            circleDiv.classList.add('bg-slate-950/95', 'text-white');
            circleDiv.style.borderColor = '#f59e0b';
          }
        } else if (isWeekMode) {
          if (isSelected) {
            circleDiv.classList.add('bg-indigo-600', 'border-white', 'ring-4', 'ring-indigo-400/60', 'scale-110');
          } else {
            circleDiv.classList.add('bg-slate-950/90', 'text-white');
            circleDiv.style.borderColor = dayColor;
          }
        } else if (!isGrouped) {
          if (isSelected) {
            circleDiv.classList.add('bg-indigo-600', 'border-white', 'ring-4', 'ring-indigo-400/60', 'scale-110');
          } else {
            circleDiv.classList.add('border-slate-800', 'bg-black', 'text-white');
          }
        } else {
          if (isFilteredOut) {
            circleDiv.classList.add('border-slate-500/50', 'bg-slate-800/80');
          } else if (isSelected) {
            circleDiv.classList.add('bg-indigo-600', 'border-white', 'ring-4', 'ring-indigo-400/60', 'scale-110');
          } else if (stop.assignedVanId === 'van-1') {
            circleDiv.classList.add('border-blue-500', 'bg-blue-950/90');
          } else if (stop.assignedVanId === 'van-2') {
            circleDiv.classList.add('border-emerald-500', 'bg-emerald-950/90');
          } else if (stop.assignedVanId === 'van-3') {
            circleDiv.classList.add('border-purple-500', 'bg-purple-950/90');
          } else if (stop.assignedVanId === 'van-4') {
            circleDiv.classList.add('border-amber-500', 'bg-amber-950/90');
          } else if (stop.assignedVanId === 'van-5') {
            circleDiv.classList.add('border-pink-500', 'bg-pink-950/90');
          } else if (stop.assignedVanId === 'van-6') {
            circleDiv.classList.add('border-cyan-500', 'bg-cyan-950/90');
          } else if (stop.assignedVanId === 'van-7') {
            circleDiv.classList.add('border-lime-500', 'bg-lime-950/90');
          } else if (stop.assignedVanId === 'van-8') {
            circleDiv.classList.add('border-orange-500', 'bg-orange-950/90');
          } else {
            circleDiv.classList.add('border-sky-400', 'bg-slate-900');
          }
        }
      }
    });
  }, [selectedStop, stops, mapLoaded, activeVanFilter, hasOptimized, showGrouping, isDark, viewMode, todayPlan, activeWeekdayFilter]);

  // Update vehicle driving simulation markers
  useEffect(() => {
    const googleObj = (window as any).google;
    const map = googleMapInstanceRef.current;
    if (!map || !googleObj?.maps) return;

    if (telemetry.isDriving && telemetry.fleetVans && telemetry.fleetVans.length > 0) {
      if (vanMarkerRef.current) {
        if (vanMarkerRef.current.setMap) vanMarkerRef.current.setMap(null);
        if (vanMarkerRef.current.map) vanMarkerRef.current.map = null;
        vanMarkerRef.current = null;
      }

      function updateFleetVans() {
        const AdvancedMarkerElement = (googleObj.maps as any).marker?.AdvancedMarkerElement;
        if (!AdvancedMarkerElement) return;

        telemetry.fleetVans?.forEach((fv) => {
          if (!fv.currentLocation) return;
          const vanId = fv.vanId;
          const isFilteredOut = activeVanFilter !== 'all' && vanId !== activeVanFilter;
          const num = parseInt(vanId.replace('van-', ''), 10) || 1;

          const gradient =
            num === 1
              ? 'from-blue-600 to-sky-400'
              : num === 2
              ? 'from-emerald-600 to-teal-400'
              : num === 3
              ? 'from-purple-600 to-indigo-400'
              : num === 4
              ? 'from-amber-600 to-orange-400'
              : 'from-pink-600 to-rose-400';

          const pingColor =
            num === 1 ? 'bg-blue-400' : num === 2 ? 'bg-emerald-400' : num === 3 ? 'bg-purple-400' : num === 4 ? 'bg-amber-400' : 'bg-pink-400';
          const label = `V${num}`;

          let marker = fleetVanMarkersRef.current.get(vanId);

          if (!marker) {
            const vanDiv = document.createElement('div');
            vanDiv.className = `group relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-150 ${
              isFilteredOut ? 'opacity-75 scale-90' : 'opacity-100 scale-100'
            }`;
            vanDiv.innerHTML = `
              <div class="relative flex items-center justify-center">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr ${gradient} p-0.5 shadow-xl border-2 border-white flex items-center justify-center">
                  <span class="text-sm sm:text-base leading-none">🚐</span>
                  <span class="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-slate-950 text-white font-black text-[9px] border border-white shadow-md">
                    ${label}
                  </span>
                </div>
                <div class="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full ${pingColor} animate-ping" />
              </div>
            `;

            marker = new AdvancedMarkerElement({
              map,
              position: fv.currentLocation,
              content: vanDiv,
              zIndex: isFilteredOut ? 8000 : 9999
            });
            fleetVanMarkersRef.current.set(vanId, marker);
          } else {
            marker.position = fv.currentLocation;
            if (marker.content) {
              marker.content.className = `group relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-150 ${
                isFilteredOut ? 'opacity-75 scale-90' : 'opacity-100 scale-100'
              }`;
            }
          }
        });
      }

      updateFleetVans();
    } else if (telemetry.isDriving && telemetry.currentVanLocation) {
      fleetVanMarkersRef.current.forEach(m => {
        if (m.setMap) m.setMap(null);
        if (m.map) m.map = null;
      });
      fleetVanMarkersRef.current.clear();

      if (!vanMarkerRef.current) {
        const vanDiv = document.createElement('div');
        vanDiv.className = 'relative flex items-center justify-center';
        vanDiv.innerHTML = `
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-xl border-2 border-white flex items-center justify-center">
            <span class="text-base leading-none">🚐</span>
          </div>
          <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
        `;

        async function createVan() {
          const { AdvancedMarkerElement } = await googleObj.maps.importLibrary('marker');
          const vanMarker = new AdvancedMarkerElement({
            map,
            position: telemetry.currentVanLocation,
            content: vanDiv,
            zIndex: 9999
          });
          vanMarkerRef.current = vanMarker;
        }
        createVan();
      } else {
        vanMarkerRef.current.position = telemetry.currentVanLocation;
      }
    } else {
      if (vanMarkerRef.current) {
        if (vanMarkerRef.current.setMap) vanMarkerRef.current.setMap(null);
        if (vanMarkerRef.current.map) vanMarkerRef.current.map = null;
        vanMarkerRef.current = null;
      }
      fleetVanMarkersRef.current.forEach(m => {
        if (m.setMap) m.setMap(null);
        if (m.map) m.map = null;
      });
      fleetVanMarkersRef.current.clear();
    }
  }, [telemetry.isDriving, telemetry.currentVanLocation, telemetry.fleetVans, activeVanFilter]);

  return (
    <div className={`relative w-full h-full min-h-0 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'} rounded-2xl overflow-hidden border shadow-2xl flex flex-col`}>
      <div className="relative flex-1 w-full h-full min-h-0">
        <div ref={mapRef} className="w-full h-full absolute inset-0 block" />

        {/* Top-Left: Area / City Selector Toggle */}
        <div className={`absolute top-3 left-3 z-10 flex items-center ${isDark ? 'bg-slate-950/90 border-slate-800/80' : 'bg-white/95 border-slate-200'} p-1 rounded-xl border shadow-2xl`}>
          {cities?.map((city) => (
            <button
              key={city.id}
              onClick={() => onSelectCity?.(city.id)}
              disabled={isOptimizing}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
              } ${
                currentCity?.id === city.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {city.name.split(',')[0]}
            </button>
          ))}
        </div>

        {/* Top-Left Status Title + Weekday Legend in Week View */}
        <div className="absolute top-13 left-3 z-10 flex flex-wrap items-center gap-1.5 max-w-[82%]">
          <div className={`${isDark ? 'bg-slate-950/90 border-slate-800/80 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-800'} border px-2.5 py-1 rounded-lg shadow-2xl flex items-center gap-1.5`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              viewMode === 'today'
                ? 'bg-amber-400 animate-pulse'
                : viewMode === 'week'
                ? 'bg-emerald-400 animate-pulse'
                : routeTitle.includes('Planned') || routeTitle.includes('Optimized')
                ? 'bg-emerald-400 animate-pulse'
                : routeTitle === 'Manual Route Sequence'
                ? 'bg-sky-400'
                : 'bg-amber-400 animate-bounce'
            }`} />
            <span className="text-[9px] font-black uppercase tracking-wider font-sans select-none">
              {viewMode === 'today' && todayPlan
                ? `Today's Route · ${todayPlan.weekday} · ${todayPlan.vehicleLabel}`
                : viewMode === 'week'
                ? 'Week Zones (Mon–Fri)'
                : routeTitle}
            </span>
          </div>

          {viewMode === 'week' && (
            <div className={`${isDark ? 'bg-slate-950/90 border-slate-800/80' : 'bg-white/95 border-slate-200'} border p-1 rounded-xl shadow-2xl flex items-center gap-1 flex-wrap`}>
              <button
                type="button"
                onClick={() => onSelectWeekdayFilter?.('all')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                  activeWeekdayFilter === 'all'
                    ? 'bg-slate-700 text-white'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              {WEEKDAYS.map((day) => {
                const isSelected = activeWeekdayFilter === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onSelectWeekdayFilter?.(isSelected ? 'all' : day)}
                    className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                      isSelected
                        ? isDark
                          ? 'bg-slate-800 text-white ring-1 ring-white/40'
                          : 'bg-slate-200 text-slate-950 ring-1 ring-slate-400'
                        : isDark
                        ? 'text-slate-300 hover:bg-slate-800'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: WEEKDAY_COLORS[day] }} />
                    <span>{WEEKDAY_SHORT[day]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Top-Right: Toggle Legs Button */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={() => setActiveTab(prev => prev === 'legs' ? 'map' : 'legs')}
            disabled={isOptimizing}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs border shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed ${
              isOptimizing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
            } ${
              activeTab === 'legs'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md font-extrabold'
                : isDark
                ? 'bg-slate-950/90 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900'
                : 'bg-white/95 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Legs ({viewMode === 'today' && todayPlan ? todayPlan.legs.length : legs.length})</span>
          </button>
        </div>

        {/* Floating Dual 24-Hour Digital Clocks (Africa/Johannesburg SAST) — kept clear of bottom Google attribution */}
        {showClock ? (
          <div className="absolute bottom-9 sm:bottom-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 select-none max-w-[94%] animate-in fade-in zoom-in-95 duration-200">
            <div
              className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all border backdrop-blur-xl whitespace-nowrap ${
                isDark
                  ? 'bg-slate-950/90 border-slate-800/90 text-slate-200 shadow-slate-950/60'
                  : 'bg-white/95 border-slate-200/90 text-slate-800 shadow-xl'
              }`}
            >
              {/* Departure / Active Simulation Clock */}
              <div
                title={simStatus === 'idle' ? 'Shift Departure Time (Africa/Johannesburg 24h, click to edit)' : 'Live Simulation Time (SAST)'}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <Flag className={`w-3.5 h-3.5 ${
                  simStatus === 'running'
                    ? 'text-amber-400 fill-amber-400/20 animate-pulse'
                    : simStatus === 'paused'
                    ? 'text-slate-400 fill-slate-400/20'
                    : 'text-emerald-500 fill-emerald-500/20'
                } shrink-0`} />

                {simStatus !== 'idle' ? (
                  <span className="text-xs sm:text-sm font-black font-mono tracking-wider text-amber-400">{simulatedTime}</span>
                ) : (
                  <input
                    type="time"
                    disabled={isOptimizing}
                    value={formatMinutesToTimeStr(departureMinutes)}
                    onChange={(e) => onDepartureTimeChange?.(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={`bg-transparent ${isDark ? 'text-white' : 'text-slate-900'} font-black font-mono text-xs sm:text-sm focus:outline-none outline-none select-none w-[46px] sm:w-[54px] appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden disabled:opacity-40 disabled:cursor-not-allowed ${
                      isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  />
                )}
              </div>

              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>➔</span>

              {/* End of Shift Return Clock (24h) */}
              <div
                title={`Estimated Shift Completion / Return to Depot (${validation.formattedShiftDuration} shift · Africa/Johannesburg)`}
                className="flex items-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20 shrink-0" />
                <span className={`text-xs sm:text-sm font-black font-mono tracking-wider ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                  {formatReturnTime24h(validation.returnTime)}
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wider hidden sm:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  SAST
                </span>
              </div>

              <button
                onClick={() => setShowClock(false)}
                className={`ml-1 p-1 rounded-md transition-colors cursor-pointer ${
                  isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="Hide Shift Clock"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClock(true)}
            className={`absolute bottom-9 sm:bottom-10 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-xl shadow-lg border backdrop-blur-md flex items-center gap-1.5 text-xs font-bold transition-all hover:scale-105 cursor-pointer ${
              isDark
                ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                : 'bg-white/90 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
            title="Show Shift Timeline Clock"
          >
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Show Shift Clock</span>
          </button>
        )}

        {/* Floating Start Navigation / Drive Button with Vehicle Dropdown */}
        <div ref={driveMenuRef} className="absolute top-13 right-3 z-20">
          {effectiveFleetRoutes && effectiveFleetRoutes.length > 1 ? (
            <div className="relative">
              <button
                id="drive-navigation-menu-toggle"
                onClick={() => setIsDriveMenuOpen(prev => !prev)}
                disabled={isOptimizing}
                className={`flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xl px-3 py-1.5 rounded-xl text-xs font-black transition-all border border-emerald-500/25 select-none disabled:opacity-40 disabled:cursor-not-allowed ${
                  isOptimizing ? 'cursor-not-allowed opacity-40' : 'hover:scale-105 active:scale-95 cursor-pointer'
                }`}
                title="Open Google Maps Turn-by-Turn Driving Route"
              >
                <Navigation className="w-3.5 h-3.5 fill-current" />
                <span>Drive</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isDriveMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDriveMenuOpen && (
                <div
                  id="drive-navigation-dropdown"
                  className={`absolute right-0 top-full mt-1.5 w-68 rounded-xl border shadow-2xl backdrop-blur-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 ${
                    isDark
                      ? 'bg-slate-950/95 border-slate-800 text-slate-100 shadow-slate-950/90'
                      : 'bg-white/98 border-slate-200 text-slate-900 shadow-xl'
                  }`}
                >
                  <div className="px-2 py-1 mb-1 border-b border-inherit">
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Google Maps Navigation
                    </span>
                    <span className={`text-[9.5px] block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Select vehicle to launch GPS route:
                    </span>
                  </div>

                  <div className="space-y-1">
                    {effectiveFleetRoutes.map((vr, idx) => {
                      const vId = vr.vehicleId || `van-${idx + 1}`;
                      const visitCount = vr.orderedStops
                        ? vr.orderedStops.filter((s: PetStop) => s.id !== 'depot').length
                        : (vr.stops ? vr.stops.filter((s: PetStop) => s.id !== 'depot').length : 0);
                      const vanColor = idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-purple-500' : 'bg-amber-500';
                      const vanLabel = vr.vehicleLabel || `Vehicle ${idx < 9 ? `0${idx + 1}` : idx + 1}`;

                      const vanUrl = buildVanNavigationUrl(vId);
                      return (
                        <a
                          key={vId}
                          href={vanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (vanUrl === '#') e.preventDefault();
                            setIsDriveMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 sm:p-2 rounded-lg text-left text-xs transition-colors cursor-pointer group ${
                            isDark
                              ? 'hover:bg-slate-900 text-slate-200 hover:text-white'
                              : 'hover:bg-slate-100 text-slate-800 hover:text-slate-950'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-black text-white ${vanColor}`}>
                              {vanLabel}
                            </span>
                            <span className="font-semibold text-[11px]">
                              {visitCount} visits
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 group-hover:text-emerald-400 transition-colors">
                            {vr.formattedTotalDuration && (
                              <span>{vr.formattedTotalDuration}</span>
                            )}
                            <ExternalLink className="w-3 h-3 text-emerald-400 shrink-0" />
                          </div>
                        </a>
                      );
                    })}

                    <div className="border-t border-inherit my-1" />

                    {(() => {
                      const allUrl = buildVanNavigationUrl('all');
                      return (
                        <a
                          href={allUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (allUrl === '#') e.preventDefault();
                            setIsDriveMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 sm:p-2 rounded-lg text-left text-xs transition-colors cursor-pointer group ${
                            isDark
                              ? 'hover:bg-slate-900 text-slate-300 hover:text-white'
                              : 'hover:bg-slate-100 text-slate-700 hover:text-slate-950'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Truck className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="font-semibold text-[11px]">All Visits</span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                        </a>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            (() => {
              const singleUrl = buildVanNavigationUrl();
              const disabledDrive = isOptimizing || singleUrl === '#';
              return (
                <a
                  href={disabledDrive ? undefined : singleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (disabledDrive) e.preventDefault();
                  }}
                  aria-disabled={disabledDrive}
                  className={`flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xl px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-xl text-xs font-black transition-all border border-emerald-500/25 select-none ${
                    disabledDrive ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'
                  }`}
                  title="Open Google Maps Turn-by-Turn Driving Route"
                >
                  <Navigation className="w-3.5 h-3.5 fill-current" />
                  <span>Drive</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              );
            })()
          )}
        </div>

        {/* Loading / Quota / Error Fallback Indicator */}
        {(!mapLoaded || quotaExceeded || initError || mapError) && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 ${quotaExceeded || initError || mapError ? 'pointer-events-auto' : 'pointer-events-none'} ${isDark ? 'bg-slate-950/75' : 'bg-white/80'} backdrop-blur-sm`}>
            {quotaExceeded ? (
              <div className={`max-w-sm rounded-2xl border p-5 shadow-2xl space-y-3 ${isDark ? 'bg-amber-950/90 border-amber-500/40 text-amber-100' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-sm font-black">Google Maps Quota Exceeded</h3>
                <p className="text-xs leading-relaxed opacity-90">
                  Google Maps Platform quota has been exceeded for this project. Route sequencing, Weekday Zones, Today&rsquo;s Route manifests, and Rand Savings calculations remain active using local estimates.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <a
                    href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <span>Quota Docs</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setRetryCount(c => c + 1);
                      onRetryMap?.();
                    }}
                    className={`px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                      isDark ? 'border-amber-500/40 hover:bg-amber-500/20' : 'border-amber-400 hover:bg-amber-100'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Map</span>
                  </button>
                </div>
              </div>
            ) : initError || mapError ? (
              <div className={`max-w-sm rounded-2xl border p-5 shadow-2xl space-y-3 ${isDark ? 'bg-slate-900/95 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}>
                <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="text-sm font-black">Map Canvas Unavailable</h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {initError || mapError}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRetryCount(c => c + 1);
                    onRetryMap?.();
                  }}
                  className="px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Map</span>
                </button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-3 animate-pulse">
                  <span className="text-2xl">🗺️</span>
                </div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'} mb-1`}>Loading Google Maps Canvas</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} max-w-xs`}>
                  Initializing Johannesburg vector roadmap &amp; route waypoints...
                </p>
              </>
            )}
          </div>
        )}

        {/* Multi-Leg Route Breakdown Drawer */}
        {activeTab === 'legs' && (
          <div className={`absolute right-0 top-0 bottom-0 w-full sm:w-[380px] max-w-full ${isDark ? 'bg-slate-950/92 border-slate-800/90 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-900'} backdrop-blur-xl border-l shadow-2xl z-20 overflow-y-auto p-4 flex flex-col gap-3 animate-in slide-in-from-right duration-200`}>
            <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} shrink-0`}>
              <div>
                <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'} uppercase tracking-wider`}>
                  Turn-by-Turn Leg Sequence
                </div>
                <div className="text-[11px] text-sky-500 font-medium">
                  {legs.length} route legs
                </div>
              </div>
              <button
                onClick={() => setActiveTab('map')}
                className={`px-2.5 py-1 rounded-lg ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors`}
                title="Close Drawer & Focus Map"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>

            {legs.length === 0 ? (
              <div className={`p-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Click &quot;Plan Route&quot; to group customer visits and compute Google Routes API directions.
              </div>
            ) : (
              legs.map((leg, index) => {
                const isDepotDeparture = leg.fromStopId === 'depot';
                const isDepotReturn = leg.toStopId === 'depot';

                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (googleMapInstanceRef.current && leg.pathCoordinates.length > 0) {
                        googleMapInstanceRef.current.panTo(leg.pathCoordinates[0]);
                        googleMapInstanceRef.current.setZoom(14);
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-4 cursor-pointer group ${
                      isDark
                        ? 'bg-slate-900/80 hover:bg-slate-850 border-slate-800 hover:border-sky-500/50'
                        : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-indigo-400 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-slate-950 mt-0.5 shrink-0 group-hover:scale-110 transition-transform"
                        style={{ backgroundColor: leg.color }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <div className={`text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isDark ? 'text-white group-hover:text-sky-300' : 'text-slate-900 group-hover:text-indigo-600'
                        }`}>
                          {isDepotDeparture && <span className="text-[11px]">🏢</span>}
                          <span>{leg.fromName}</span>
                          <span className="text-slate-400">→</span>
                          {isDepotReturn && <span className="text-[11px]">🏢</span>}
                          <span>{leg.toName}</span>
                        </div>
                        <div className={`flex items-center gap-3 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span>📏 {leg.distanceFormatted}</span>
                          <span>⏱️ {leg.durationFormatted}</span>
                        </div>
                        {leg.funnyHazard && (
                          <div className={`mt-1 text-[10px] italic line-clamp-1 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                            ⚠️ {leg.funnyHazard}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        isDepotDeparture
                          ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                          : isDepotReturn
                          ? isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {isDepotDeparture ? 'Start Leg' : isDepotReturn ? 'Return Leg' : `Leg #${index + 1}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
