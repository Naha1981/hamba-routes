import { OPEN_MAPS } from '../providerConfig';
import React, { useState, useEffect, useRef } from 'react';
import { PetStop, UrgencyLevel, LatLng, ServiceCategory } from '../types';
import { X, MapPin, Search, Compass, Eye, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { loadMapsLibrary, hasClientMapsKey, SOLUTION_ATTRIBUTION_ID } from '../services/mapsLoader';
import { validateSouthAfricanPhone } from '../utils/phoneValidation';

interface AddPetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStop: (stop: PetStop) => void;
  onUpdateStop?: (stop: PetStop) => void;
  editingStop?: PetStop | null;
  currentStopsCount: number;
  centerLocation: LatLng;
  theme?: 'dark' | 'light';
}

const SERVICE_DEFAULTS: Record<ServiceCategory, { avatar: string; label: string; defaultTask: string; defaultCost: number }> = {
  pool: { avatar: '🏊', label: 'Pool Cleaning', defaultTask: 'Pool pH Balance & Vacuum', defaultCost: 480 },
  pest: { avatar: '🐜', label: 'Pest Control', defaultTask: 'Perimeter Pest Barrier Treatment', defaultCost: 620 },
  garden: { avatar: '🌿', label: 'Garden Services', defaultTask: 'Lawn Mow, Edge & Blow', defaultCost: 550 }
};

export const AddPetModal: React.FC<AddPetModalProps> = ({
  isOpen,
  onClose,
  onAddStop,
  onUpdateStop,
  editingStop = null,
  currentStopsCount,
  centerLocation,
  theme = 'dark'
}) => {
  const [name, setName] = useState('');
  const [openPinConfirmed,setOpenPinConfirmed] = useState(false);
  const [phone, setPhone] = useState('+27 82 555 0199');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [suburb, setSuburb] = useState('Sandton');
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>('pool');
  const [serviceType, setServiceType] = useState('Pool pH Balance & Vacuum');
  const [weeklyFrequency, setWeeklyFrequency] = useState('Weekly (Mon)');
  const [serviceCost, setServiceCost] = useState(480);
  const [address, setAddress] = useState('');
  const [customLocation, setCustomLocation] = useState<LatLng>(() => ({
    lat: centerLocation.lat,
    lng: centerLocation.lng,
    altitude: 1500
  }));
  const [notes, setNotes] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('standard');
  const [durationMin, setDurationMin] = useState(25);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('15:00');
  const [isMinimized, setIsMinimized] = useState(false);

  // Autocomplete state & mini-map refs
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [miniMapError, setMiniMapError] = useState<string | null>(null);
  const sessionTokenRef = useRef<any>(null);
  const newestRequestIdRef = useRef(0);
  const placesLibRef = useRef<any>(null);
  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstanceRef = useRef<any>(null);
  const miniMarkerInstanceRef = useRef<any>(null);

  const isDark = theme === 'dark';
  const isEditing = Boolean(editingStop);

  // Synchronize form fields whenever modal opens (prefill if editing)
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
      setOpenPinConfirmed(Boolean(editingStop));
      setPhoneError(null);
      setMiniMapError(null);
      setSuggestions([]);
      setShowSuggestions(false);
      sessionTokenRef.current = null;

      if (editingStop) {
        const inferredCat: ServiceCategory =
          editingStop.serviceCategory ||
          (editingStop.serviceType?.toLowerCase().includes('pest')
            ? 'pest'
            : editingStop.serviceType?.toLowerCase().includes('garden')
            ? 'garden'
            : 'pool');
        setCustomLocation({
          lat: editingStop.location?.lat || centerLocation.lat,
          lng: editingStop.location?.lng || centerLocation.lng,
          altitude: editingStop.location?.altitude || 1500
        });
        setName(editingStop.name || '');
        setPhone(editingStop.phone || '+27 82 555 0199');
        setSuburb(editingStop.suburb || 'Sandton');
        setServiceCategory(inferredCat);
        setServiceType(editingStop.serviceType || SERVICE_DEFAULTS[inferredCat].defaultTask);
        setServiceCost(editingStop.serviceCost || SERVICE_DEFAULTS[inferredCat].defaultCost);
        setWeeklyFrequency(editingStop.weeklyFrequency || 'Weekly (Mon)');
        setDurationMin(editingStop.durationMin || 25);
        setTimeStart(editingStop.timeWindow?.start || '08:00');
        setTimeEnd(editingStop.timeWindow?.end || '15:00');
        setAddress(editingStop.address || '');
        const existingNotes =
          editingStop.notes !== undefined
            ? editingStop.notes
            : editingStop.personality && editingStop.personality !== 'Standard gate access'
            ? editingStop.personality
            : '';
        setNotes(existingNotes);
        setUrgency(editingStop.urgency || 'standard');
      } else {
        setCustomLocation({
          lat: centerLocation.lat,
          lng: centerLocation.lng,
          altitude: 1500
        });
        setName('');
        setPhone('+27 82 555 0199');
        setSuburb('Sandton');
        setServiceCategory('pool');
        setServiceType(SERVICE_DEFAULTS.pool.defaultTask);
        setServiceCost(SERVICE_DEFAULTS.pool.defaultCost);
        setWeeklyFrequency('Weekly (Mon)');
        setDurationMin(25);
        setTimeStart('08:00');
        setTimeEnd('15:00');
        setAddress('');
        setNotes('');
        setUrgency('standard');
      }
    }
  }, [isOpen, editingStop, centerLocation.lat, centerLocation.lng]);

  // Preload modern Places API (New) library
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    let isMounted = true;
    loadMapsLibrary('places')
      .then((placesLib) => {
        if (isMounted) {
          placesLibRef.current = placesLib;
        }
      })
      .catch((err) => {
        console.warn('Places library load warning:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, isMinimized]);

  // Fetch modern AutocompleteSuggestion predictions biased to Johannesburg, South Africa
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const query = address.trim();
    if (query.length < 3 || query.startsWith('Location (')) {
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
            west: centerLocation.lng - 0.35,
            north: centerLocation.lat + 0.35,
            east: centerLocation.lng + 0.35,
            south: centerLocation.lat - 0.35
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
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('QuotaExceededError') ||
          err?.status === 429
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        console.warn('Autocomplete suggestions error:', err);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [address, isOpen, isMinimized, centerLocation.lat, centerLocation.lng]);

  const handleSelectSuggestion = async (suggestion: any) => {
    const prediction = suggestion?.placePrediction;
    if (!prediction) return;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['formattedAddress', 'location', 'displayName']
      });
      const loc = place.location;
      const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
      const chosenAddress = place.formattedAddress || place.displayName || prediction.text?.toString() || address;

      setAddress(chosenAddress);
      setSuggestions([]);
      setShowSuggestions(false);
      sessionTokenRef.current = null;

      if (lat !== undefined && lng !== undefined) {
        setCustomLocation({ lat, lng, altitude: 1500 });
        if (miniMapInstanceRef.current) {
          miniMapInstanceRef.current.panTo({ lat, lng });
          miniMapInstanceRef.current.setZoom(16);
        }
        if (miniMarkerInstanceRef.current) {
          miniMarkerInstanceRef.current.position = { lat, lng };
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('QuotaExceededError') ||
        err?.status === 429
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      console.warn('Place fetchFields error:', err);
    }
  };

  // Setup interactive Mini-Map with Draggable Marker centered on current city
  useEffect(() => {
    if (!isOpen || isMinimized || !miniMapRef.current) return;
    let isMounted = true;

    async function initMiniMap() {
      if (!hasClientMapsKey()) {
        if (isMounted) setMiniMapError(OPEN_MAPS ? 'Open-map mode: confirm latitude and longitude below. No Google request is made.' : 'Google Maps API key not configured. Enter an address or coordinates.');
        return;
      }
      try {
        setMiniMapError(null);
        const { Map } = await loadMapsLibrary('maps');
        const markerLib = await loadMapsLibrary('marker');
        const coreLib = await loadMapsLibrary('core').catch(() => null);
        const AdvancedMarkerElement = markerLib.AdvancedMarkerElement;

        if (!isMounted || !miniMapRef.current) return;

        const initialLat = customLocation.lat || centerLocation.lat;
        const initialLng = customLocation.lng || centerLocation.lng;
        const colorScheme = coreLib?.ColorScheme
          ? isDark
            ? coreLib.ColorScheme.DARK
            : coreLib.ColorScheme.LIGHT
          : isDark
          ? 'DARK'
          : 'LIGHT';

        const mapInstance = new Map(miniMapRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: 13,
          mapId: 'DEMO_MAP_ID',
          colorScheme,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          ...(SOLUTION_ATTRIBUTION_ID ? { internalUsageAttributionIds: [SOLUTION_ATTRIBUTION_ID] } : {})
        });

        const pinContent = document.createElement('div');
        pinContent.className =
          'relative flex items-center justify-center w-10 h-10 -translate-y-2 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform';
        pinContent.innerHTML = `
          <div class="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-30"></div>
          <div class="relative w-9 h-9 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl shadow-xl flex items-center justify-center border-2 border-white text-base">
            📍
          </div>
        `;

        const marker = new AdvancedMarkerElement({
          map: mapInstance,
          position: { lat: initialLat, lng: initialLng },
          content: pinContent,
          gmpDraggable: true,
          title: 'Drag to adjust customer street location'
        });

        marker.addListener('dragend', () => {
          if (marker.position) {
            const lat =
              typeof marker.position.lat === 'function'
                ? marker.position.lat()
                : (marker.position.lat as number);
            const lng =
              typeof marker.position.lng === 'function'
                ? marker.position.lng()
                : (marker.position.lng as number);
            setCustomLocation({ lat, lng, altitude: 1500 });
            setAddress(prev => (!prev || prev.startsWith('Location (')) ? `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})` : prev);
          }
        });

        mapInstance.addListener('click', (e: any) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            marker.position = { lat, lng };
            setCustomLocation({ lat, lng, altitude: 1500 });
            setAddress(prev => (!prev || prev.startsWith('Location (')) ? `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})` : prev);
          }
        });

        miniMapInstanceRef.current = mapInstance;
        miniMarkerInstanceRef.current = marker;
      } catch (err) {
        console.warn('Mini map init error:', err);
        if (isMounted) setMiniMapError('Mini-map preview unavailable. You can still type the customer address or save.');
      }
    }

    const timer = setTimeout(() => {
      initMiniMap();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, isMinimized, isDark, editingStop?.id, centerLocation.lat, centerLocation.lng]);

  const handleCategoryChange = (cat: ServiceCategory) => {
    setServiceCategory(cat);
    const meta = SERVICE_DEFAULTS[cat];
    setServiceType(meta.defaultTask);
    setServiceCost(meta.defaultCost);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const phoneCheck = validateSouthAfricanPhone(phone, true);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error || 'Enter a valid South African number (+27 XX XXX XXXX or 0XX XXX XXXX)');
      return;
    }
    setPhoneError(null);

    if (OPEN_MAPS && (!openPinConfirmed || !Number.isFinite(customLocation.lat) || !Number.isFinite(customLocation.lng) || Math.abs(customLocation.lat)>90 || Math.abs(customLocation.lng)>180 || !address.trim())) { setPhoneError('Enter an address label and valid confirmed coordinates.'); return; }
    const finalLat = customLocation.lat ?? centerLocation.lat;
    const finalLng = customLocation.lng ?? centerLocation.lng;
    const finalAddress = address.trim() || `${suburb}, Johannesburg (${finalLat.toFixed(4)}, ${finalLng.toFixed(4)})`;
    const meta = SERVICE_DEFAULTS[serviceCategory];

    const trimmedNotes = notes.trim().slice(0, 500);

    const stopPayload: PetStop = {
      ...(editingStop || {}),
      id: editingStop ? editingStop.id : `custom-${Date.now()}`,
      order: editingStop ? editingStop.order : currentStopsCount + 1,
      name: name.trim(),
      ownerName: editingStop?.ownerName || `Residence · ${suburb}`,
      breed: `${meta.label} · ${suburb}`,
      species: editingStop?.species || 'dog',
      serviceCategory,
      suburb,
      phone: phoneCheck.normalized,
      weeklyFrequency,
      avatar: meta.avatar,
      address: finalAddress,
      location: {
        lat: finalLat,
        lng: finalLng,
        altitude: 1500
      },
      serviceType: serviceType.trim() || meta.defaultTask,
      serviceCost: Number(serviceCost) || meta.defaultCost,
      personality: trimmedNotes,
      urgency,
      mudLevel: editingStop?.mudLevel ?? 25,
      fluffFactor: editingStop?.fluffFactor ?? 75,
      timeWindow: { start: timeStart, end: timeEnd },
      durationMin: Number(durationMin),
      specialInstructions: `${weeklyFrequency} recurring visit`,
      notes: trimmedNotes || undefined,
      funnyQuote: `${weeklyFrequency} · ${durationMin}m · ${phoneCheck.normalized}`,
      status: editingStop ? editingStop.status : 'pending'
    };

    if (isEditing && onUpdateStop) {
      onUpdateStop(stopPayload);
    } else {
      onAddStop(stopPayload);
    }
    onClose();
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <>
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-2">
          <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border shadow-2xl backdrop-blur-xl text-xs font-bold ${
            isDark ? 'bg-slate-900/95 border-amber-500/40 text-white' : 'bg-white/95 border-amber-300 text-slate-900'
          }`}>
            <div className="flex items-center gap-1.5 text-amber-400">
              <Eye className="w-4 h-4" />
              <span>Peeking Map</span>
            </div>
            <span className="text-slate-500 font-normal">&bull;</span>
            <button
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95"
            >
              <span>Reopen Add Visit</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              title="Cancel & Close"
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="fixed top-1/2 -translate-y-1/2 right-0 z-50">
          <button
            onClick={() => setIsMinimized(false)}
            title="Reopen Add Customer Visit form"
            aria-label="Reopen Add Customer Visit form"
            className={`w-5 h-12 rounded-l-md border border-r-0 flex items-center justify-center transition-all hover:w-6 active:scale-95 cursor-pointer ${
              isDark
                ? 'bg-slate-900/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200'
                : 'bg-white/80 hover:bg-white border-slate-300/80 text-slate-500 hover:text-slate-800 shadow-2xs'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] flex justify-end p-0 sm:p-4 pointer-events-auto">
      <div
        className={`border-l sm:border sm:rounded-2xl w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200 ${
          isDark
            ? 'bg-slate-900/95 backdrop-blur-xl border-slate-800 text-white'
            : 'bg-white/98 backdrop-blur-xl border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between shrink-0 ${
            isDark
              ? 'border-slate-800 bg-slate-950/60'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{SERVICE_DEFAULTS[serviceCategory].avatar}</span>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {isEditing ? 'Edit Customer Visit' : 'Add Customer Visit'}
              </h3>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Search Johannesburg street address or drag map pin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              title="Temporarily hide form to view full map"
              className={`px-2.5 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs flex items-center gap-1.5 font-bold cursor-pointer transition-colors ${
                isDark
                  ? 'bg-slate-800 text-amber-300 hover:text-white hover:bg-slate-700'
                  : 'bg-amber-50 text-amber-700 hover:text-amber-900 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Peek Map</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close customer form"
              className={`p-2 sm:p-1.5 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
                isDark
                  ? 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 flex-1 overflow-y-auto">
          {/* 1. Address FIRST: Single Address Input & Mini-Map */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-[11px] font-bold flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                <span>Street Address / Map Pin <span className="text-rose-500 font-bold">*</span></span>
              </label>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Type a Sandton, Bryanston, Randburg or Midrand street..."
                value={address}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setShowSuggestions(true);
                }}
                className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 shadow-sm ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden max-h-48 overflow-y-auto ${
                    isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                  }`}
                >
                  {suggestions.map((suggestion, idx) => {
                    const text = suggestion?.placePrediction?.text?.toString() || '';
                    if (!text) return null;
                    return (
                      <li
                        key={suggestion?.placePrediction?.placeId || idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleSelectSuggestion(suggestion);
                        }}
                        className={`px-3.5 py-2 text-xs cursor-pointer flex items-center gap-2 border-b last:border-b-0 ${
                          isDark
                            ? 'border-slate-800 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-100 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <label className={`text-[10px] font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  <span>Pinpoint on Map (Drag marker)</span>
                </label>
                <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {customLocation.lat.toFixed(4)}, {customLocation.lng.toFixed(4)}
                </span>
              </div>

              <div className="relative w-full h-36 rounded-xl border overflow-hidden shadow-inner">
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
              <p className={`text-[10px] italic flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Compass className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>Drag the 📍 marker or click anywhere on the map to place the customer visit.</span>
              </p>
            </div>
          </div>

          {OPEN_MAPS && <div className="grid grid-cols-2 gap-2"><label>Latitude<input aria-label="Latitude" type="number" step="any" min="-90" max="90" required value={customLocation.lat} onChange={e=>setCustomLocation({...customLocation,lat:Number(e.target.value)})} className="w-full bg-slate-800 p-2 rounded"/></label><label>Longitude<input aria-label="Longitude" type="number" step="any" min="-180" max="180" required value={customLocation.lng} onChange={e=>setCustomLocation({...customLocation,lng:Number(e.target.value)})} className="w-full bg-slate-800 p-2 rounded"/></label><label className="col-span-2 text-xs"><input aria-label="I confirm these coordinates" type="checkbox" required checked={openPinConfirmed} onChange={e=>setOpenPinConfirmed(e.target.checked)}/> I confirm these coordinates identify this test stop.</label><p className="col-span-2 text-xs">Use confirmed coordinates. Public Nominatim is not enabled: no autocomplete or customer address disclosure to it.</p></div>}
          {/* 2. Customer Name & Service Category */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Customer Name <span className="text-rose-500 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Lerato Khumalo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Service Type
              </label>
              <select
                value={serviceCategory}
                onChange={(e) => handleCategoryChange(e.target.value as ServiceCategory)}
                className={`w-full border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="pool">🏊 Pool Cleaning</option>
                <option value="pest">🐜 Pest Control</option>
                <option value="garden">🌿 Garden Services</option>
              </select>
            </div>
          </div>

          {/* 3. Phone (+27) & Suburb */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                South African Phone (+27) <span className="text-rose-500 font-bold">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="+27 82 555 0199 or 082 555 0199"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value;
                  setPhone(val);
                  if (phoneError) {
                    const check = validateSouthAfricanPhone(val, true);
                    if (check.valid) setPhoneError(null);
                  }
                }}
                className={`w-full border rounded-xl px-3 py-2.5 sm:py-2 text-xs font-mono focus:outline-none ${
                  phoneError
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'focus:border-indigo-500'
                } ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
              {phoneError && (
                <p id="add-customer-phone-error" className="text-[10.5px] font-semibold text-rose-400 mt-1">
                  {phoneError}
                </p>
              )}
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Suburb
              </label>
              <select
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className={`w-full border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="Sandton">Sandton</option>
                <option value="Bryanston">Bryanston</option>
                <option value="Fourways">Fourways</option>
                <option value="Randburg">Randburg</option>
                <option value="Rosebank">Rosebank</option>
                <option value="Midrand">Midrand</option>
              </select>
            </div>
          </div>

          {/* 4. Weekly Frequency & Fee (ZAR) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Weekly Frequency
              </label>
              <select
                value={weeklyFrequency}
                onChange={(e) => setWeeklyFrequency(e.target.value)}
                className={`w-full border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="Weekly (Mon)">Weekly (Mon)</option>
                <option value="Weekly (Tue)">Weekly (Tue)</option>
                <option value="Weekly (Wed)">Weekly (Wed)</option>
                <option value="Weekly (Thu)">Weekly (Thu)</option>
                <option value="Weekly (Fri)">Weekly (Fri)</option>
                <option value="Twice Weekly (Mon, Thu)">Twice Weekly (Mon, Thu)</option>
                <option value="Fortnightly (Wed)">Fortnightly (Wed)</option>
              </select>
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Visit Fee (ZAR R)
              </label>
              <input
                type="number"
                min={100}
                max={5000}
                step={10}
                value={serviceCost}
                onChange={(e) => setServiceCost(Number(e.target.value))}
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
            </div>
          </div>

          {/* 5. Time Window (24h) & Visit Length (15-40 mins) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Time Window (24h, SAST)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className={`flex-1 border rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <span className="text-slate-500 text-xs">-</span>
                <input
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  className={`flex-1 border rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Visit Length (15–40 mins)
              </label>
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className={`w-full border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value={15}>15 mins (Quick Check & Dose)</option>
                <option value={20}>20 mins (Standard Routine Visit)</option>
                <option value={25}>25 mins (Full Pool / Pest Service)</option>
                <option value={30}>30 mins (Extended Property Care)</option>
                <option value={35}>35 mins (Large Garden / Complex)</option>
                <option value={40}>40 mins (Full Treatment & Cleanup)</option>
              </select>
            </div>
          </div>

          {/* 6. Job Description & Priority */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Service Task
              </label>
              <input
                type="text"
                placeholder="e.g. Pool pH Balance & Vacuum"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Visit Priority
              </label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                className={`w-full border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="standard">Standard Route</option>
                <option value="high">High Priority</option>
                <option value="critical">Urgent Callout</option>
              </select>
            </div>
          </div>

          {/* 7. Optional Customer Notes (Access instructions, gate codes, pet warnings) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="customer-notes-input" className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Notes <span className={`font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>(Optional)</span>
              </label>
              <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {notes.length}/500
              </span>
            </div>
            <textarea
              id="customer-notes-input"
              rows={2}
              maxLength={500}
              placeholder="e.g. Gate code #402, ring intercom twice, 2 friendly dogs in backyard — keep side latch shut"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-xs leading-snug resize-y focus:outline-none focus:border-indigo-500 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          {/* Submit Action Buttons */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                isDark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isEditing ? 'Save Changes' : 'Add Customer Visit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
