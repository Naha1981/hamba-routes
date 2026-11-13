import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Search,
  MapPin,
  Link2,
  Compass,
  Trophy,
  AlertTriangle,
  Fuel,
  Database,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Loader2
} from 'lucide-react';
import {
  LatLng,
  PetStop,
  ServiceCategory,
  WeekSchedulePlan,
  FuelSettings,
  PlacementOption,
  CachedMatrixEntry,
  WEEKDAY_COLORS,
  WEEKDAY_SHORT
} from '../types';
import { loadMapsLibrary, hasClientMapsKey, SOLUTION_ATTRIBUTION_ID } from '../services/mapsLoader';
import { fetchPlacementMatrix, resolveShortPinUrl } from '../services/routesService';
import {
  evaluateNewCustomerPlacements,
  parseGoogleMapsPin,
  isShortGoogleMapsUrl
} from '../utils/weekdayZones';
import { validateSouthAfricanPhone } from '../utils/phoneValidation';

interface PlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  weekPlan: WeekSchedulePlan;
  allStops: PetStop[];
  fuelSettings: FuelSettings;
  centerLocation: LatLng;
  departureMinutes?: number;
  maxShiftHours?: number;
  onAcceptPlacement: (newStop: PetStop, option: PlacementOption) => void;
  onOpenSettings?: () => void;
  isDark?: boolean;
}

const SERVICE_META: Record<ServiceCategory, { avatar: string; label: string; task: string; cost: number }> = {
  pool: { avatar: '🏊', label: 'Pool Cleaning', task: 'Pool pH Balance & Vacuum', cost: 480 },
  pest: { avatar: '🐜', label: 'Pest Control', task: 'Perimeter Pest Barrier Treatment', cost: 620 },
  garden: { avatar: '🌿', label: 'Garden Services', task: 'Lawn Mow, Edge & Blow', cost: 550 }
};

export const PlacementModal: React.FC<PlacementModalProps> = ({
  isOpen,
  onClose,
  weekPlan,
  allStops,
  fuelSettings,
  centerLocation,
  departureMinutes = 420,
  maxShiftHours = 9,
  onAcceptPlacement,
  onOpenSettings,
  isDark = true
}) => {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('+27 82 555 0148');
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>('pool');
  const [durationMin, setDurationMin] = useState<number>(25);
  const [monthlyVisitsCount, setMonthlyVisitsCount] = useState<number>(4);

  const [addressInput, setAddressInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinParseStatus, setPinParseStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [candidateLocation, setCandidateLocation] = useState<LatLng | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState('');

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const sessionTokenRef = useRef<any>(null);
  const newestRequestIdRef = useRef(0);
  const placesLibRef = useRef<any>(null);

  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstanceRef = useRef<any>(null);
  const miniMarkerInstanceRef = useRef<any>(null);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const [matrixEntry, setMatrixEntry] = useState<CachedMatrixEntry | null>(null);
  const [matrixCacheHit, setMatrixCacheHit] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixRetryCount, setMatrixRetryCount] = useState(0);
  const [miniMapError, setMiniMapError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showAllOptions, setShowAllOptions] = useState(false);

  // Reset clean state when opened
  useEffect(() => {
    if (isOpen) {
      setCustomerName('');
      setPhone('+27 82 555 0148');
      setPhoneError(null);
      setServiceCategory('pool');
      setDurationMin(25);
      setMonthlyVisitsCount(4);
      setAddressInput('');
      setPinInput('');
      setPinParseStatus(null);
      setCandidateLocation(null);
      setResolvedAddress('');
      setSuggestions([]);
      setShowSuggestions(false);
      setMatrixEntry(null);
      setMatrixCacheHit(false);
      setMatrixError(null);
      setMiniMapError(null);
      setShowAllOptions(false);
      sessionTokenRef.current = null;
    }
  }, [isOpen]);

  // Preload Places library
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    loadMapsLibrary('places')
      .then((lib) => {
        if (mounted) placesLibRef.current = lib;
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Places Autocomplete strictly restricted to South Africa (includedRegionCodes: ['za'])
  useEffect(() => {
    if (!isOpen) return;
    const query = addressInput.trim();
    if (query.length < 3 || query === resolvedAddress) {
      setSuggestions([]);
      return;
    }

    const requestId = ++newestRequestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const placesLib = placesLibRef.current || (await loadMapsLibrary('places'));
        placesLibRef.current = placesLib;
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) return;

        if (!sessionTokenRef.current && AutocompleteSessionToken) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const request: any = {
          input: query,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['za'],
          origin: { lat: centerLocation.lat, lng: centerLocation.lng },
          locationBias: {
            west: centerLocation.lng - 0.45,
            north: centerLocation.lat + 0.45,
            east: centerLocation.lng + 0.45,
            south: centerLocation.lat - 0.45
          },
          language: 'en-ZA',
          region: 'za',
          internalUsageAttributionIds: [SOLUTION_ATTRIBUTION_ID]
        };

        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (requestId === newestRequestIdRef.current) {
          setSuggestions(res?.suggestions || []);
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('QuotaExceededError') || err?.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [addressInput, resolvedAddress, isOpen, centerLocation.lat, centerLocation.lng]);

  // Mini-map setup & marker sync
  useEffect(() => {
    if (!isOpen || !miniMapRef.current) return;
    let mounted = true;

    async function initMap() {
      if (!hasClientMapsKey()) {
        if (mounted) setMiniMapError('Maps preview unavailable without a Maps key. Use coordinates or pasted pin above.');
        return;
      }
      try {
        setMiniMapError(null);
        const { Map } = await loadMapsLibrary('maps');
        const markerLib = await loadMapsLibrary('marker');
        const coreLib = await loadMapsLibrary('core').catch(() => null);
        const AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
        if (!mounted || !miniMapRef.current) return;

        const initPos = candidateLocation || centerLocation;
        const colorScheme = coreLib?.ColorScheme
          ? isDark
            ? coreLib.ColorScheme.DARK
            : coreLib.ColorScheme.LIGHT
          : isDark
          ? 'DARK'
          : 'LIGHT';

        const map = new Map(miniMapRef.current, {
          center: initPos,
          zoom: candidateLocation ? 14 : 11,
          mapId: 'DEMO_MAP_ID',
          colorScheme,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          ...(SOLUTION_ATTRIBUTION_ID ? { internalUsageAttributionIds: [SOLUTION_ATTRIBUTION_ID] } : {})
        });

        const pinEl = document.createElement('div');
        pinEl.className = 'relative flex items-center justify-center w-9 h-9 -translate-y-2 cursor-grab active:cursor-grabbing';
        pinEl.innerHTML = `
          <div class="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 border-2 border-white shadow-xl flex items-center justify-center text-sm">
            📍
          </div>
        `;

        const marker = new AdvancedMarkerElement({
          map,
          position: initPos,
          content: pinEl,
          gmpDraggable: true,
          title: 'Drag or click map to set new customer location'
        });

        marker.addListener('dragend', () => {
          if (marker.position) {
            const lat = typeof marker.position.lat === 'function' ? marker.position.lat() : Number(marker.position.lat);
            const lng = typeof marker.position.lng === 'function' ? marker.position.lng() : Number(marker.position.lng);
            const nextLoc = { lat, lng, altitude: 1500 };
            setCandidateLocation(nextLoc);
            setResolvedAddress(`Pinned (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
            setPinParseStatus({ ok: true, text: `Pin updated: ${lat.toFixed(5)}, ${lng.toFixed(5)}` });
          }
        });

        map.addListener('click', (e: any) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            const nextLoc = { lat, lng, altitude: 1500 };
            marker.position = nextLoc;
            setCandidateLocation(nextLoc);
            setResolvedAddress(`Pinned (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
            setPinParseStatus({ ok: true, text: `Pin updated: ${lat.toFixed(5)}, ${lng.toFixed(5)}` });
          }
        });

        miniMapInstanceRef.current = map;
        miniMarkerInstanceRef.current = marker;
      } catch (err) {
        console.warn('Placement mini-map error:', err);
        if (mounted) setMiniMapError('Mini-map preview unavailable. Coordinates & pasted pins still work.');
      }
    }

    const t = setTimeout(initMap, 80);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [isOpen, isDark]);

  // Pan mini-map whenever candidateLocation updates programmatically
  useEffect(() => {
    if (!candidateLocation) return;
    if (miniMapInstanceRef.current) {
      miniMapInstanceRef.current.panTo({ lat: candidateLocation.lat, lng: candidateLocation.lng });
      miniMapInstanceRef.current.setZoom(14);
    }
    if (miniMarkerInstanceRef.current) {
      miniMarkerInstanceRef.current.position = { lat: candidateLocation.lat, lng: candidateLocation.lng };
    }
  }, [candidateLocation?.lat, candidateLocation?.lng]);

  // Fetch SINGLE cached Distance Matrix whenever candidateLocation changes
  useEffect(() => {
    if (!isOpen || !candidateLocation) return;
    let cancelled = false;

    async function runMatrix() {
      setIsEvaluating(true);
      setMatrixError(null);
      try {
        const nodes: Array<{ id: string; location: LatLng }> = [];
        weekPlan.dayRoutes.forEach((dr) => {
          dr.orderedStops.forEach((s) => {
            nodes.push({ id: s.id, location: s.location });
          });
        });
        allStops.forEach((s) => {
          nodes.push({ id: s.id, location: s.location });
        });

        const { entry, cacheHit, error } = await fetchPlacementMatrix(candidateLocation!, nodes, departureMinutes);
        if (!cancelled) {
          setMatrixEntry(entry);
          setMatrixCacheHit(cacheHit);
          setMatrixError(error || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setMatrixError(err?.message || 'Unable to fetch distance matrix right now.');
        }
      } finally {
        if (!cancelled) setIsEvaluating(false);
      }
    }

    runMatrix();
    return () => {
      cancelled = true;
    };
  }, [isOpen, candidateLocation?.lat, candidateLocation?.lng, departureMinutes, weekPlan, allStops, matrixRetryCount]);

  const handleSelectSuggestion = async (suggestion: any) => {
    const prediction = suggestion?.placePrediction;
    if (!prediction) return;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'displayName'] });
      const loc = place.location;
      const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
      const formatted = place.formattedAddress || place.displayName || prediction.text?.toString() || addressInput;

      setAddressInput(formatted);
      setResolvedAddress(formatted);
      setSuggestions([]);
      setShowSuggestions(false);
      sessionTokenRef.current = null;

      if (lat !== undefined && lng !== undefined) {
        setCandidateLocation({ lat, lng, altitude: 1500 });
        setPinParseStatus({ ok: true, text: `ZA address resolved (${lat.toFixed(4)}, ${lng.toFixed(4)})` });
      }
    } catch (err) {
      console.warn('Place fetchFields error:', err);
    }
  };

  const handleParsePastedPin = async (value: string) => {
    setPinInput(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setPinParseStatus(null);
      return;
    }

    const parsed = parseGoogleMapsPin(trimmed);
    if (parsed) {
      setCandidateLocation(parsed);
      setResolvedAddress(`Google Maps Pin (${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)})`);
      setPinParseStatus({ ok: true, text: `Pin coordinates extracted: ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}` });
      return;
    }

    if (isShortGoogleMapsUrl(trimmed)) {
      setIsResolvingPin(true);
      setPinParseStatus({ ok: true, text: 'Resolving short maps.app.goo.gl link...' });
      const res = await resolveShortPinUrl(trimmed);
      setIsResolvingPin(false);
      if (res.location) {
        setCandidateLocation(res.location);
        setResolvedAddress(`Short Pin (${res.location.lat.toFixed(5)}, ${res.location.lng.toFixed(5)})`);
        setPinParseStatus({
          ok: true,
          text: `Short link resolved: ${res.location.lat.toFixed(5)}, ${res.location.lng.toFixed(5)}`
        });
      } else {
        setPinParseStatus({
          ok: false,
          text: res.error || 'Could not extract coordinates from short URL. Try pasting full URL or lat, lng.'
        });
      }
      return;
    }

    setPinParseStatus({
      ok: false,
      text: 'Paste a Google Maps URL (@lat,lng), DMS, short maps.app.goo.gl link, or "-26.1076, 28.0567".'
    });
  };

  // Recompute rankings locally & instantaneously whenever fuelSettings, durationMin, monthlyVisitsCount, or cached matrix changes
  const placementEvaluation = useMemo(() => {
    if (!candidateLocation || !matrixEntry) return null;
    return evaluateNewCustomerPlacements({
      candidateLocation,
      visitDurationMin: durationMin,
      monthlyVisitsCount,
      weekPlan,
      distancesByNodeId: matrixEntry.distancesByNodeId,
      fuelSettings,
      departureMinutes,
      maxShiftMinutes: maxShiftHours * 60
    });
  }, [
    candidateLocation,
    matrixEntry,
    durationMin,
    monthlyVisitsCount,
    weekPlan,
    fuelSettings,
    departureMinutes,
    maxShiftHours
  ]);

  const handleAssignOption = (option: PlacementOption) => {
    if (!candidateLocation) return;

    const phoneCheck = validateSouthAfricanPhone(phone, false);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error || 'Enter a valid South African number (+27 XX XXX XXXX or 0XX XXX XXXX)');
      return;
    }
    setPhoneError(null);
    const cleanedPhone = phoneCheck.normalized || '+27 82 555 0148';

    const meta = SERVICE_META[serviceCategory];
    const freqLabel =
      monthlyVisitsCount === 8
        ? `Twice Weekly (${WEEKDAY_SHORT[option.weekday]})`
        : monthlyVisitsCount === 2
        ? `Fortnightly (${WEEKDAY_SHORT[option.weekday]})`
        : `Weekly (${WEEKDAY_SHORT[option.weekday]})`;

    const displayName = customerName.trim() || `New Customer (${WEEKDAY_SHORT[option.weekday]})`;
    const newStop: PetStop = {
      id: `custom-${Date.now()}`,
      order: allStops.length + 1,
      name: displayName,
      ownerName: 'New Customer Site',
      breed: `${meta.label} · JHB`,
      species: 'dog',
      serviceCategory,
      suburb: 'Johannesburg',
      phone: cleanedPhone,
      weeklyFrequency: freqLabel,
      avatar: meta.avatar,
      address: resolvedAddress || addressInput || `${candidateLocation.lat.toFixed(4)}, ${candidateLocation.lng.toFixed(4)}`,
      location: candidateLocation,
      serviceType: meta.task,
      serviceCost: meta.cost,
      personality: 'New customer placement',
      urgency: 'standard',
      mudLevel: 20,
      fluffFactor: 80,
      timeWindow: { start: '07:00', end: '16:00' },
      durationMin,
      specialInstructions: `${freqLabel} · Added via Placement Finder`,
      funnyQuote: `${freqLabel} · ${durationMin}m · ${cleanedPhone}`,
      status: 'pending',
      assignedWeekday: option.weekday,
      assignedVanId: option.vehicleId,
      weekdayOrder: option.insertIndex
    };

    onAcceptPlacement(newStop, option);
    onClose();
  };

  if (!isOpen) return null;

  const formatVanShort = (vehicleId: string) => {
    const num = parseInt(vehicleId.replace('van-', ''), 10) || 1;
    return `Van ${num}`;
  };

  const fuelSavingsWorstVsBest =
    placementEvaluation?.worst && placementEvaluation.top3[0]
      ? Math.max(0, placementEvaluation.worst.extraMonthlyFuelCostZar - placementEvaluation.top3[0].extraMonthlyFuelCostZar)
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div
        className={`w-full max-w-4xl max-h-[94vh] rounded-3xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 ${
          isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight">
                Where should a new customer go?
              </h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Single cached matrix + local insertion ranker · Extra km, drive min &amp; monthly fuel cost (R{fuelSettings.fuelPricePerLitre}/L, {fuelSettings.fuelConsumptionLPer100Km} L/100km)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Fuel className="w-3.5 h-3.5" />
                <span>R{fuelSettings.fuelPricePerLitre}/L · {fuelSettings.fuelConsumptionLPer100Km}L</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className={`p-1.5 rounded-xl cursor-pointer ${
                isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Address / Pin + Customer Parameters + Mini-Map */}
          <div className="lg:col-span-5 space-y-3">
            {/* Places Autocomplete (South Africa restricted) */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Search className="w-3.5 h-3.5 text-sky-400" />
                <span>South Africa Street Address (Places Autocomplete)</span>
              </label>
              <div className="relative">
                <input
                  id="placement-address-input"
                  type="text"
                  placeholder="Type a Johannesburg address (restricted to ZA)..."
                  value={addressInput}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                  onChange={(e) => {
                    setAddressInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:border-sky-500 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul
                    className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-2xl max-h-44 overflow-y-auto ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    {suggestions.map((sug, idx) => {
                      const text = sug?.placePrediction?.text?.toString() || '';
                      if (!text) return null;
                      return (
                        <li
                          key={sug?.placePrediction?.placeId || idx}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void handleSelectSuggestion(sug);
                          }}
                          className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 border-b last:border-b-0 ${
                            isDark ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="truncate">{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Pasted Google Maps Pin / URL */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold flex items-center justify-between ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Or Paste Google Maps Pin / Coordinates</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleParsePastedPin('-26.0742, 28.0235')}
                  className="text-[10px] text-sky-400 hover:underline cursor-pointer font-semibold"
                >
                  Try Bryanston Sample
                </button>
              </label>
              <div className="relative">
                <input
                  id="placement-pin-input"
                  type="text"
                  placeholder="Paste maps link, maps.app.goo.gl, or -26.085, 28.045"
                  value={pinInput}
                  onChange={(e) => void handleParsePastedPin(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isResolvingPin && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              {pinParseStatus && (
                <p className={`text-[10.5px] font-medium ${pinParseStatus.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {pinParseStatus.text}
                </p>
              )}
            </div>

            {/* Mini-Map */}
            <div className="relative w-full h-36 rounded-2xl border overflow-hidden">
              <div
                ref={miniMapRef}
                className={`w-full h-full ${
                  isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-100'
                }`}
              />
              {miniMapError && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-[11px] ${isDark ? 'bg-slate-950/90 text-slate-300' : 'bg-slate-100/95 text-slate-700'}`}>
                  <AlertTriangle className="w-4 h-4 text-amber-400 mb-1" />
                  <span>{miniMapError}</span>
                </div>
              )}
            </div>

            {/* Optional Customer Name & Visit Parameters */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10.5px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nomsa Dube"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={`w-full rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none focus:border-sky-500 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[10.5px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Service Type
                </label>
                <select
                  value={serviceCategory}
                  onChange={(e) => setServiceCategory(e.target.value as ServiceCategory)}
                  className={`w-full rounded-xl border px-2 py-1.5 text-xs ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="pool">🏊 Pool Cleaning</option>
                  <option value="pest">🐜 Pest Control</option>
                  <option value="garden">🌿 Garden Services</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={`block text-[10.5px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Visit Length
                </label>
                <select
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className={`w-full rounded-xl border px-2 py-1.5 text-xs ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  {[15, 20, 25, 30, 35, 40].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-[10.5px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Frequency
                </label>
                <select
                  value={monthlyVisitsCount}
                  onChange={(e) => setMonthlyVisitsCount(Number(e.target.value))}
                  className={`w-full rounded-xl border px-2 py-1.5 text-xs ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value={4}>Weekly (4×/mo)</option>
                  <option value={8}>2× Week (8×/mo)</option>
                  <option value={2}>Fortnight (2×/mo)</option>
                </select>
              </div>
              <div>
                <label className={`block text-[10.5px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Phone (+27)
                </label>
                <input
                  type="tel"
                  placeholder="+27 82 555 0148"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPhone(val);
                    if (phoneError) {
                      const check = validateSouthAfricanPhone(val, false);
                      if (check.valid) setPhoneError(null);
                    }
                  }}
                  className={`w-full rounded-xl border px-2 py-2 sm:py-1.5 text-[11px] font-mono focus:outline-none ${
                    phoneError ? 'border-rose-500' : 'focus:border-sky-500'
                  } ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>
            {phoneError && (
              <p className="text-[10.5px] font-semibold text-rose-400">{phoneError}</p>
            )}
          </div>

          {/* Right Column: Ranked Weekday & Vehicle Results */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {!candidateLocation ? (
              <div
                className={`flex-1 min-h-[280px] rounded-2xl border border-dashed flex flex-col items-center justify-center p-6 text-center ${
                  isDark ? 'border-slate-800 bg-slate-950/40 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-500'
                }`}
              >
                <MapPin className="w-8 h-8 text-amber-400 mb-2" />
                <div className="text-sm font-bold text-slate-200 dark:text-slate-200">
                  Select an address or paste a Google Maps pin
                </div>
                <p className="text-xs max-w-sm mt-1">
                  We fetch <strong>one distance matrix</strong>, cache it locally, and immediately rank all{' '}
                  {weekPlan.dayRoutes.length} weekday &times; vehicle routes by extra km, extra drive minutes, shift fit, and monthly fuel cost.
                </p>
              </div>
            ) : isEvaluating ? (
              <div
                className={`flex-1 min-h-[280px] rounded-2xl border flex flex-col items-center justify-center p-6 text-center ${
                  isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400 mb-2" />
                <div className="text-xs font-bold">Fetching single distance matrix &amp; running local insertion maths...</div>
              </div>
            ) : placementEvaluation ? (
              <>
                {matrixError && (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                    isDark ? 'bg-amber-950/60 border-amber-500/40 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}>
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{matrixError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMatrixRetryCount(c => c + 1)}
                      className="px-2.5 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] shrink-0 cursor-pointer"
                    >
                      Retry Matrix
                    </button>
                  </div>
                )}

                {/* Cache Status Pill */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10.5px] font-bold ${
                      matrixCacheHit
                        ? isDark
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : isDark
                        ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                        : 'bg-sky-50 border-sky-200 text-sky-700'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>
                      {matrixCacheHit
                        ? 'Cached Distance Matrix reused (0 extra API calls)'
                        : matrixEntry?.source === 'google_routes_matrix'
                        ? '1 Google Routes Matrix API call cached · Local insertion'
                        : '1 Distance Matrix cached (offline/demo estimate) · Local insertion'}
                    </span>
                  </div>

                  <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Evaluated {placementEvaluation.allOptions.length} weekday &times; vehicle options
                  </span>
                </div>

                {/* Top 3 Ranked Options */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Top 3 Best Placements</span>
                  </div>

                  {placementEvaluation.top3.map((opt, idx) => {
                    const dayColor = WEEKDAY_COLORS[opt.weekday];
                    const vanShort = formatVanShort(opt.vehicleId);
                    return (
                      <div
                        key={`${opt.weekday}-${opt.vehicleId}`}
                        className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
                          idx === 0
                            ? isDark
                              ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg'
                              : 'bg-emerald-50 border-emerald-300 shadow-sm'
                            : isDark
                            ? 'bg-slate-950/70 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                                idx === 0
                                  ? 'bg-emerald-500 text-slate-950'
                                  : isDark
                                  ? 'bg-slate-800 text-slate-200'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: dayColor }}
                            />
                            <span className="text-xs sm:text-sm font-black tracking-tight">
                              {opt.weekday}, {vanShort}:{' '}
                              <span className="font-mono text-emerald-400">
                                +{opt.extraKm.toFixed(1)} km, +{opt.extraDriveMinutes} min
                              </span>
                            </span>
                          </div>

                          <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <span className="font-mono font-bold text-amber-400">
                              +R{opt.extraMonthlyFuelCostZar.toFixed(2)}/mo fuel ({opt.monthlyVisitsCount}× × R{opt.perVisitFuelCostZar.toFixed(2)})
                            </span>
                            <span>
                              Return: <strong className="font-mono">{opt.newReturnTime}</strong>
                            </span>
                            {opt.fitsShift ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3 h-3" />
                                Fits 07:00–16:00
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                Over 16:00 shift
                              </span>
                            )}
                          </div>

                          <div className={`text-[10px] truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {opt.technicianName ? `${opt.technicianName} · ` : ''}Insert after: {opt.insertAfterName}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAssignOption(opt)}
                          className={`px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-black flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-all ${
                            idx === 0
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow'
                              : isDark
                              ? 'bg-slate-800 hover:bg-slate-700 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                          }`}
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Add to Route</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Worst Option Contrast Card */}
                {placementEvaluation.worst && (
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-rose-950/30 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Worst Option (For Comparison)</span>
                      </div>
                      {fuelSavingsWorstVsBest > 0 && (
                        <span className="text-[11px] font-mono font-black text-emerald-400">
                          Best option saves R{fuelSavingsWorstVsBest.toFixed(2)}/mo fuel!
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-bold">
                        {placementEvaluation.worst.weekday}, {formatVanShort(placementEvaluation.worst.vehicleId)}:{' '}
                        <span className="font-mono text-rose-400">
                          +{placementEvaluation.worst.extraKm.toFixed(1)} km, +{placementEvaluation.worst.extraDriveMinutes} min
                        </span>
                      </div>
                      <div className="font-mono font-bold text-rose-400">
                        +R{placementEvaluation.worst.extraMonthlyFuelCostZar.toFixed(2)}/mo fuel · Return {placementEvaluation.worst.newReturnTime}
                      </div>
                    </div>
                  </div>
                )}

                {/* Collapsible Full Weekday x Vehicle Table */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAllOptions((p) => !p)}
                    className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                      isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {showAllOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{showAllOptions ? 'Hide' : 'Show'} all {placementEvaluation.allOptions.length} weekday &times; vehicle options</span>
                  </button>

                  {showAllOptions && (
                    <div className={`mt-2 rounded-xl border overflow-x-auto max-h-44 overflow-y-auto ${
                      isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className={`border-b text-[9.5px] uppercase ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                            <th className="py-1.5 px-2">Rank</th>
                            <th className="py-1.5 px-2">Day &amp; Vehicle</th>
                            <th className="py-1.5 px-2">Extra km / min</th>
                            <th className="py-1.5 px-2">Monthly Fuel</th>
                            <th className="py-1.5 px-2">Return</th>
                          </tr>
                        </thead>
                        <tbody className={isDark ? 'divide-y divide-slate-900' : 'divide-y divide-slate-200'}>
                          {placementEvaluation.allOptions.map((opt, idx) => (
                            <tr key={`${opt.weekday}-${opt.vehicleId}`}>
                              <td className="py-1.5 px-2 font-mono font-bold">#{idx + 1}</td>
                              <td className="py-1.5 px-2 font-semibold">
                                {WEEKDAY_SHORT[opt.weekday]} · {formatVanShort(opt.vehicleId)}
                              </td>
                              <td className="py-1.5 px-2 font-mono">
                                +{opt.extraKm.toFixed(1)} km · +{opt.extraDriveMinutes}m
                              </td>
                              <td className="py-1.5 px-2 font-mono text-amber-400">
                                +R{opt.extraMonthlyFuelCostZar.toFixed(2)}
                              </td>
                              <td className={`py-1.5 px-2 font-mono ${opt.fitsShift ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {opt.newReturnTime}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
