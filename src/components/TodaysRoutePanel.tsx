import React, { useMemo, useState } from 'react';
import {
  Navigation,
  Copy,
  Check,
  Printer,
  Clock,
  Truck,
  Calendar,
  MessageCircle,
  CheckCircle2,
  SkipForward,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  MapPin,
  Phone,
  Sparkles,
  RefreshCw,
  Pencil
} from 'lucide-react';
import {
  PetStop,
  Weekday,
  WEEKDAYS,
  WEEKDAY_SHORT,
  WEEKDAY_COLORS,
  TodayRoutePlan,
  TodayStopExecutionStatus,
  WeekSchedulePlan
} from '../types';
import { JHB_VEHICLES } from '../data/mockPetStops';
import { formatDistance, formatDuration } from '../utils/geoUtils';
import { formatPhoneToWhatsAppDigits } from '../utils/phoneValidation';

interface TodaysRoutePanelProps {
  todayPlan: TodayRoutePlan | null;
  isLoading: boolean;
  weekday: Weekday;
  onSelectWeekday: (day: Weekday) => void;
  vehicleId: string;
  onSelectVehicleId: (vehicleId: string) => void;
  fleetSize: number;
  departureMinutes: number;
  onDepartureMinutesChange: (mins: number) => void;
  businessName: string;
  weekPlan: WeekSchedulePlan;
  selectedStop: PetStop | null;
  onSelectStop: (stop: PetStop) => void;
  onSetStopStatus: (stopId: string, status: TodayStopExecutionStatus) => void;
  onResetDayStatuses: () => void;
  onRecalculate: () => void;
  todayError?: string | null;
  onEditStop?: (stop: PetStop) => void;
  isDark?: boolean;
  onClose?: () => void;
  className?: string;
}

function formatMinToTimeInput(totalMin: number): string {
  const hrs = Math.floor(totalMin / 60) % 24;
  const mins = Math.floor(totalMin % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildCustomerWhatsAppUrl(
  stop: PetStop,
  businessName: string,
  arrivalTime: string
): string | null {
  const digits = formatPhoneToWhatsAppDigits(stop.phone);
  if (!digits) return null;
  const firstName = (stop.name || 'there').trim().split(/\s+/)[0] || 'there';
  const cleanBusiness = (businessName || 'Hamba Routes').trim() || 'Hamba Routes';
  const serviceName = (stop.serviceType || 'scheduled service').trim();
  const message = `Hi ${firstName}, ${cleanBusiness} will be with you around ${arrivalTime} today for your ${serviceName}. Reply if that time doesn't work.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export const TodaysRoutePanel: React.FC<TodaysRoutePanelProps> = ({
  todayPlan,
  isLoading,
  weekday,
  onSelectWeekday,
  vehicleId,
  onSelectVehicleId,
  fleetSize,
  departureMinutes,
  onDepartureMinutesChange,
  businessName,
  weekPlan,
  selectedStop,
  onSelectStop,
  onSetStopStatus,
  onResetDayStatuses,
  onRecalculate,
  todayError,
  onEditStop,
  isDark = true,
  onClose,
  className
}) => {
  const [copiedManifest, setCopiedManifest] = useState(false);

  const vehicleOptions = useMemo(() => {
    const count = Math.max(1, Math.min(8, fleetSize));
    return Array.from({ length: count }).map((_, idx) => {
      const vId = `van-${idx + 1}`;
      const preset = JHB_VEHICLES[idx];
      const dayRoute = weekPlan.dayRoutes.find((r) => r.weekday === weekday && r.vehicleId === vId);
      return {
        vehicleId: vId,
        label: preset?.vehicleLabel || `Vehicle ${idx + 1 < 10 ? `0${idx + 1}` : idx + 1}`,
        technicianName: preset?.technicianName || `Technician ${idx + 1}`,
        depotName: preset?.depotName || 'Johannesburg Depot',
        stopCount: dayRoute?.visitCount ?? 0
      };
    });
  }, [fleetSize, weekPlan.dayRoutes, weekday]);

  const dayStopCounts = useMemo(() => {
    const counts: Record<Weekday, number> = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0
    };
    WEEKDAYS.forEach((d) => {
      counts[d] = weekPlan.daySummaries[d]?.totalVisits || 0;
    });
    return counts;
  }, [weekPlan.daySummaries]);

  const buildPlainTextManifest = (): string => {
    if (!todayPlan) return '';
    const cleanBusiness = (businessName || 'Hamba Routes').trim() || 'Hamba Routes';
    const lines: string[] = [];
    lines.push(`*${cleanBusiness} — ${todayPlan.weekday} Route Manifest*`);
    lines.push(`Vehicle: ${todayPlan.vehicleLabel} (${todayPlan.technicianName})`);
    lines.push(`Depot: ${todayPlan.depotName} (${todayPlan.depotAddress})`);
    if (todayPlan.startingFromStopName) {
      lines.push(`Re-optimised from: ${todayPlan.startingFromStopName} at ${todayPlan.departureTimeStr}`);
    } else {
      lines.push(`Depart Depot: ${todayPlan.departureTimeStr} SAST`);
    }
    lines.push(
      `Remaining Stops: ${todayPlan.activeEntries.length} | Total Distance: ${formatDistance(
        todayPlan.totalDistanceMeters
      )} | Total Drive: ${formatDuration(todayPlan.totalDriveSeconds)} | Est. Return: ${todayPlan.returnToDepotTime}`
    );

    if (todayPlan.waypointCapExceeded) {
      lines.push(
        `⚠️ WAYPOINT CAP WARNING: Exceeded ${todayPlan.maxWaypointsAllowed}-stop Routes API limit (${
          todayPlan.activeEntries.length + todayPlan.overflowStops.length
        } pending; ${todayPlan.overflowStops.length} overflow stop(s) deferred).`
      );
    }

    lines.push('');
    if (todayPlan.activeEntries.length === 0) {
      lines.push('No remaining stops on this route.');
    } else {
      todayPlan.activeEntries.forEach((entry) => {
        const s = entry.stop;
        lines.push(
          `${entry.sequenceNumber}. *${s.name}* — ETA ${entry.arrivalTime} (${s.durationMin || 25} min, depart ${entry.departureTime})`
        );
        lines.push(`   Service: ${s.serviceType}`);
        lines.push(`   Address: ${s.address}`);
        if (s.phone) lines.push(`   Phone: ${s.phone}`);
        const accessNote = (s.notes || s.personality || '').trim();
        const combinedNotes =
          accessNote && s.specialInstructions
            ? `${accessNote} — ${s.specialInstructions}`
            : accessNote || s.specialInstructions || '';
        if (combinedNotes) {
          lines.push(`   Notes: ${combinedNotes}`);
        }
        lines.push(`   Pin: https://www.google.com/maps/search/?api=1&query=${s.location.lat},${s.location.lng}`);
      });
    }

    if (todayPlan.completedEntries.length > 0) {
      lines.push('');
      lines.push('Completed / Skipped:');
      todayPlan.completedEntries.forEach((c) => {
        lines.push(`• [${c.status.toUpperCase()}] ${c.stop.name} — ${c.stop.address}`);
      });
    }

    if (todayPlan.overflowStops.length > 0) {
      lines.push('');
      lines.push(`Deferred (Over ${todayPlan.maxWaypointsAllowed}-stop Routes API cap):`);
      todayPlan.overflowStops.forEach((o) => {
        lines.push(`• ${o.name} — ${o.address}`);
      });
    }

    return lines.join('\n');
  };

  const handleCopyManifest = async () => {
    const text = buildPlainTextManifest();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleTimeInputChange = (val: string) => {
    if (!val || !val.includes(':')) return;
    const [hStr, mStr] = val.split(':');
    const hrs = parseInt(hStr, 10);
    const mins = parseInt(mStr, 10);
    if (!isNaN(hrs) && !isNaN(mins)) {
      onDepartureMinutesChange(hrs * 60 + mins);
    }
  };

  const activeEntries = todayPlan?.activeEntries || [];
  const completedEntries = todayPlan?.completedEntries || [];
  const overflowStops = todayPlan?.overflowStops || [];
  const totalAssignedPending = activeEntries.length + overflowStops.length;
  const totalKmText = todayPlan ? formatDistance(todayPlan.totalDistanceMeters) : '0.0 km';
  const totalDriveText = todayPlan ? formatDuration(todayPlan.totalDriveSeconds) : '0 mins';

  return (
    <>
      <aside
        id="todays-route-panel"
        className={`flex flex-col backdrop-blur-xl h-full overflow-hidden transition-colors no-print ${
          isDark
            ? 'bg-slate-950/95 border-slate-800/80 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm'
        } ${className || 'w-full md:w-[440px] xl:w-[480px] border-l'}`}
      >
        {/* Top Title Header */}
        <div
          className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'bg-slate-950/90 border-slate-800/80' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Navigation className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-black uppercase tracking-wider truncate">
                Today&rsquo;s Route Dispatch
              </h2>
              <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Traffic-aware ETAs &amp; technician field manifest
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              id="copy-manifest-btn"
              onClick={handleCopyManifest}
              disabled={!todayPlan}
              title="Copy plain-text route manifest to paste into WhatsApp for technician"
              className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40 ${
                copiedManifest
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              {copiedManifest ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{copiedManifest ? 'Copied!' : 'Copy manifest'}</span>
            </button>

            <button
              type="button"
              id="print-manifest-btn"
              onClick={handlePrint}
              disabled={!todayPlan}
              title="Print Today's route manifest"
              className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Printer className="w-3.5 h-3.5 text-sky-400" />
              <span>Print</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Collapse panel"
                className={`p-1.5 rounded-lg border cursor-pointer ${
                  isDark
                    ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                    : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Selectors: Weekday, Vehicle & Departure Time */}
        <div
          className={`p-3 border-b space-y-2.5 shrink-0 ${
            isDark ? 'bg-slate-900/50 border-slate-800/80' : 'bg-slate-50/70 border-slate-200'
          }`}
        >
          {/* Weekday Selector Pills */}
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <Calendar className="w-3 h-3 text-amber-400" />
              <span>Weekday</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {WEEKDAYS.map((day) => {
                const isSelected = weekday === day;
                const dayColor = WEEKDAY_COLORS[day];
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onSelectWeekday(day)}
                    className={`min-h-[44px] sm:min-h-0 py-2 sm:py-1.5 px-1 rounded-xl border text-[11px] font-extrabold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-slate-800 text-white border-amber-400/70 shadow-sm'
                          : 'bg-amber-50 text-slate-950 border-amber-500 shadow-xs'
                        : isDark
                        ? 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dayColor }} />
                      <span>{WEEKDAY_SHORT[day]}</span>
                    </span>
                    <span className="text-[9px] font-mono opacity-75">{dayStopCounts[day]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle Selector + Departure Time Input */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <div className="sm:col-span-3">
              <label
                htmlFor="today-vehicle-select"
                className={`text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <Truck className="w-3 h-3 text-blue-400" />
                <span>Vehicle</span>
              </label>
              <select
                id="today-vehicle-select"
                value={vehicleId}
                onChange={(e) => onSelectVehicleId(e.target.value)}
                className={`w-full min-h-[44px] sm:min-h-0 rounded-xl border px-2.5 py-2 sm:py-1.5 text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {vehicleOptions.map((vo) => (
                  <option key={vo.vehicleId} value={vo.vehicleId}>
                    {vo.label} · {vo.technicianName} ({vo.stopCount} stops)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="today-departure-time"
                className={`text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Departure (SAST)</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="today-departure-time"
                  type="time"
                  value={formatMinToTimeInput(departureMinutes)}
                  onChange={(e) => handleTimeInputChange(e.target.value)}
                  className={`w-full min-h-[44px] sm:min-h-0 rounded-xl border px-2.5 py-2 sm:py-1.5 text-xs font-mono font-black focus:outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={onRecalculate}
                  disabled={isLoading}
                  title="Recalculate traffic-aware route & ETAs"
                  className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-xl border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-amber-400 hover:bg-slate-800'
                      : 'bg-white border-slate-300 text-amber-600 hover:bg-slate-100'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div
            className={`grid grid-cols-3 gap-1.5 p-2 rounded-2xl border ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div>
              <div className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Total Distance
              </div>
              <div className="text-sm font-black font-mono text-amber-400" id="today-total-km">
                {totalKmText}
              </div>
            </div>
            <div>
              <div className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Total Drive Time
              </div>
              <div className="text-sm font-black font-mono text-sky-400" id="today-total-drive">
                {totalDriveText}
              </div>
            </div>
            <div>
              <div className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Est. Return
              </div>
              <div
                className={`text-sm font-black font-mono ${
                  todayPlan?.exceedsShift ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {todayPlan?.returnToDepotTime || '--:--'}
              </div>
            </div>
          </div>

          {/* Status & Source Pill Row */}
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0 ${
                  todayPlan?.source === 'routes_api_traffic'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {isLoading
                  ? 'Updating traffic ETAs...'
                  : todayPlan?.source === 'routes_api_traffic'
                  ? 'Routes API Live Traffic'
                  : 'Estimated JHB Traffic'}
              </span>
              {todayPlan?.startingFromStopName && (
                <span className={`truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  From: {todayPlan.startingFromStopName}
                </span>
              )}
            </div>

            {completedEntries.length > 0 && (
              <button
                type="button"
                onClick={onResetDayStatuses}
                className="text-[10.5px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset ({completedEntries.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Traffic / Quota / Calculation Error or Warning Banner */}
        {(todayError || todayPlan?.warning) && (
          <div
            className={`mx-3 mt-2.5 p-2.5 rounded-2xl border flex items-start justify-between gap-2 text-xs shrink-0 ${
              isDark
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug text-[11px]">{todayError || todayPlan?.warning}</span>
            </div>
            <button
              type="button"
              onClick={onRecalculate}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10.5px] font-black shrink-0 cursor-pointer disabled:opacity-40"
            >
              Retry
            </button>
          </div>
        )}

        {/* Waypoint Cap Exceeded Warning */}
        {todayPlan?.waypointCapExceeded && (
          <div
            id="routes-api-waypoint-cap-warning"
            className={`mx-3 mt-2.5 p-2.5 rounded-2xl border flex items-start gap-2 text-xs shrink-0 ${
              isDark
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <div className="font-black text-[11.5px]">
                Routes API Waypoint Cap Exceeded ({totalAssignedPending} / {todayPlan.maxWaypointsAllowed} max)
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">
                This route is capped at the {todayPlan.maxWaypointsAllowed} intermediate waypoints Google Routes API allows per request.{' '}
                {overflowStops.length} overflow stop{overflowStops.length === 1 ? ' is' : 's are'} deferred below—move them in Week View or mark Done/Skip.
              </p>
            </div>
          </div>
        )}

        {/* Numbered Stop List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {activeEntries.length === 0 ? (
            <div
              className={`p-6 rounded-2xl border text-center space-y-2 ${
                isDark ? 'bg-slate-900/50 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-xs font-bold">
                {completedEntries.length > 0
                  ? `All stops completed or skipped for ${weekday} (${todayPlan?.vehicleLabel || vehicleId}).`
                  : `No visits scheduled for ${weekday} on ${todayPlan?.vehicleLabel || vehicleId}.`}
              </div>
              {completedEntries.length > 0 && (
                <button
                  type="button"
                  onClick={onResetDayStatuses}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer hover:bg-amber-400"
                >
                  Restore Completed / Skipped Stops
                </button>
              )}
            </div>
          ) : (
            activeEntries.map((entry) => {
              const s = entry.stop;
              const isSelected = selectedStop?.id === s.id;
              const waUrl = buildCustomerWhatsAppUrl(s, businessName, entry.arrivalTime);
              const legKm = formatDistance(entry.legDistanceMeters);
              const legMins = Math.max(1, Math.round(entry.legDurationSeconds / 60));

              return (
                <div
                  key={s.id}
                  onClick={() => onSelectStop(s)}
                  className={`rounded-2xl border p-3 transition-all cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-950/60 border-indigo-400 ring-1 ring-indigo-400/50 shadow-lg'
                        : 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-300 shadow-sm'
                      : isDark
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  {/* Top Row: Number Badge + Customer + ETA Pill */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow">
                        {entry.sequenceNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm leading-none">{s.avatar}</span>
                          <h3 className="text-xs font-black truncate">{s.name}</h3>
                        </div>
                        <div className={`text-[11px] font-semibold truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {s.serviceType} · {s.durationMin || 25} min
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-black">
                        ETA {entry.arrivalTime}
                      </div>
                      <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {legKm} · {legMins}m drive
                      </div>
                    </div>
                  </div>

                  {/* Address, Phone, Access Notes */}
                  <div className={`mt-2 space-y-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-sky-400" />
                      <span className="leading-snug">{s.address}</span>
                    </div>
                    {s.phone && (
                      <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                        <Phone className="w-3 h-3 shrink-0 text-emerald-400" />
                        <span>{s.phone}</span>
                      </div>
                    )}
                    {(s.notes || s.personality || s.specialInstructions) && (
                      <div
                        className={`text-[10.5px] px-2 py-1 rounded-lg border space-y-0.5 ${
                          isDark ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        {(s.notes || s.personality) && (
                          <div className={`font-medium ${isDark ? 'text-amber-300/90' : 'text-amber-800'}`}>
                            {s.notes || s.personality}
                          </div>
                        )}
                        {s.specialInstructions && (
                          <div className="opacity-85">{s.specialInstructions}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Row: Message customer + Edit + Done + Skip */}
                  <div
                    className="mt-2.5 pt-2 border-t border-slate-800/50 flex flex-wrap items-center justify-between gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {waUrl ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1.5 transition-all ${
                          isDark
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Message customer</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">No phone number</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {onEditStop && (
                        <button
                          type="button"
                          onClick={() => onEditStop(s)}
                          disabled={isLoading}
                          aria-label={`Edit ${s.name}`}
                          title="Edit customer details"
                          className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-2.5 py-2 sm:py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-40 ${
                            isDark
                              ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-400'
                              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-sky-600'
                          }`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSetStopStatus(s.id, 'done')}
                        disabled={isLoading}
                        title="Mark visit Done and re-optimise remaining stops"
                        className="min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1 cursor-pointer transition-all disabled:opacity-40"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetStopStatus(s.id, 'skipped')}
                        disabled={isLoading}
                        title="Skip visit and re-optimise remaining stops"
                        className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-40 ${
                          isDark
                            ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        }`}
                      >
                        <SkipForward className="w-3.5 h-3.5 text-amber-400" />
                        <span>Skip</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Overflow stops beyond Routes API 25-waypoint cap */}
          {overflowStops.length > 0 && (
            <div
              className={`rounded-2xl border p-3 space-y-2 ${
                isDark ? 'bg-rose-950/30 border-rose-500/30' : 'bg-rose-50 border-rose-200'
              }`}
            >
              <div className="text-[11px] font-black text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Deferred Beyond 25-Waypoint Cap ({overflowStops.length})</span>
              </div>
              <div className="space-y-1.5">
                {overflowStops.map((st, idx) => (
                  <div
                    key={st.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] ${
                      isDark ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-white border-rose-200 text-slate-800'
                    }`}
                  >
                    <span className="truncate font-semibold">
                      #{26 + idx} {st.name} · {st.suburb || st.address}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSetStopStatus(st.id, 'skipped')}
                      className="text-[10px] font-bold text-rose-400 hover:underline shrink-0 cursor-pointer"
                    >
                      Skip
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done / Skipped History with Undo */}
          {completedEntries.length > 0 && (
            <div
              className={`rounded-2xl border p-3 space-y-2 ${
                isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className={`text-[10.5px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Done &amp; Skipped Today ({completedEntries.length})
              </div>
              <div className="space-y-1.5">
                {completedEntries.map(({ stop, status }) => (
                  <div
                    key={stop.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] ${
                      isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          status === 'done'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {status}
                      </span>
                      <span className="truncate line-through">{stop.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSetStopStatus(stop.id, 'pending')}
                      className="text-[10px] font-bold text-sky-400 hover:underline shrink-0 cursor-pointer"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Dedicated Clean White-Paper Printable Sheet (visible only in @media print) */}
      {todayPlan && (
        <div id="today-route-print-sheet" className="hidden print:block p-6 text-black bg-white font-sans">
          <div className="border-b-2 border-black pb-3 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-black tracking-tight">
                {(businessName || 'Hamba Routes').trim()} — {todayPlan.weekday} Route Manifest
              </h1>
              <p className="text-sm mt-0.5">
                <strong>Vehicle:</strong> {todayPlan.vehicleLabel} ({todayPlan.technicianName}) ·{' '}
                <strong>Depot:</strong> {todayPlan.depotName} ({todayPlan.depotAddress})
              </p>
            </div>
            <div className="text-right text-xs font-mono">
              <div>Depart: {todayPlan.departureTimeStr} SAST</div>
              <div>Est. Return: {todayPlan.returnToDepotTime} SAST</div>
              <div>
                {formatDistance(todayPlan.totalDistanceMeters)} · {formatDuration(todayPlan.totalDriveSeconds)} drive
              </div>
            </div>
          </div>

          {todayPlan.waypointCapExceeded && (
            <div className="mb-3 p-2 border border-black text-xs font-bold">
              Warning: Route capped at {todayPlan.maxWaypointsAllowed} intermediate waypoints (Google Routes API max).{' '}
              {todayPlan.overflowStops.length} overflow stop(s) deferred.
            </div>
          )}

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black text-left bg-slate-100">
                <th className="py-1.5 px-2 border border-slate-400">#</th>
                <th className="py-1.5 px-2 border border-slate-400">ETA</th>
                <th className="py-1.5 px-2 border border-slate-400">Customer</th>
                <th className="py-1.5 px-2 border border-slate-400">Phone</th>
                <th className="py-1.5 px-2 border border-slate-400">Address</th>
                <th className="py-1.5 px-2 border border-slate-400">Service (min)</th>
                <th className="py-1.5 px-2 border border-slate-400">Notes</th>
                <th className="py-1.5 px-2 border border-slate-400 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {todayPlan.activeEntries.map((entry) => (
                <tr key={entry.stop.id} className="border-b border-slate-300">
                  <td className="py-1.5 px-2 border border-slate-300 font-bold">{entry.sequenceNumber}</td>
                  <td className="py-1.5 px-2 border border-slate-300 font-mono font-bold">{entry.arrivalTime}</td>
                  <td className="py-1.5 px-2 border border-slate-300 font-bold">{entry.stop.name}</td>
                  <td className="py-1.5 px-2 border border-slate-300 font-mono">{entry.stop.phone || '—'}</td>
                  <td className="py-1.5 px-2 border border-slate-300">{entry.stop.address}</td>
                  <td className="py-1.5 px-2 border border-slate-300">
                    {entry.stop.serviceType} ({entry.stop.durationMin || 25}m)
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300">
                    {(entry.stop.notes || entry.stop.personality)
                      ? `${entry.stop.notes || entry.stop.personality}${entry.stop.specialInstructions ? ` — ${entry.stop.specialInstructions}` : ''}`
                      : entry.stop.specialInstructions || '—'}
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300 text-center font-mono">[ ] Done</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
