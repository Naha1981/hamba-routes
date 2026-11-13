import React from 'react';
import { VehicleRoute, OptimizedRouteResult, PetStop } from '../types';
import { Truck, CheckCircle2, Clock, Banknote, Calendar } from 'lucide-react';
import { calculateRouteResult, validateTimeWindows } from '../utils/tspSolver';
import { JHB_VEHICLES } from '../data/mockPetStops';

interface VanDashboardProps {
  vehicleRoutes?: VehicleRoute[];
  routeResult?: OptimizedRouteResult;
  hasOptimized?: boolean;
  fleetSize?: number;
  activeVanFilter?: string;
  onSelectVanFilter?: (vanId: string) => void;
  onOptimize?: () => void;
  isOptimizing?: boolean;
  className?: string;
  isDark?: boolean;
}

export const VanDashboard: React.FC<VanDashboardProps> = ({
  vehicleRoutes = [],
  routeResult,
  hasOptimized = false,
  fleetSize = 3,
  activeVanFilter = 'all',
  onSelectVanFilter,
  isOptimizing = false,
  className,
  isDark = true
}) => {
  // Always ensure we have active routes to display
  const effectiveRoutes: VehicleRoute[] = React.useMemo(() => {
    const list = (vehicleRoutes && vehicleRoutes.length > 0)
      ? vehicleRoutes
      : (routeResult?.vehicleRoutes && routeResult.vehicleRoutes.length > 0)
      ? routeResult.vehicleRoutes
      : null;

    if (list && list.length > 0) {
      return list.map((vr, idx) => {
        const isSingle = list.length === 1;
        const preset = JHB_VEHICLES[idx];
        const dist = (vr.formattedTotalDistance && vr.formattedTotalDistance !== '--')
          ? vr.formattedTotalDistance
          : (isSingle && routeResult?.formattedTotalDistance ? routeResult.formattedTotalDistance : '--');
        const dur = (vr.formattedTotalDuration && vr.formattedTotalDuration !== '--')
          ? vr.formattedTotalDuration
          : (isSingle && routeResult?.formattedTotalDuration ? routeResult.formattedTotalDuration : '--');
        const shift = (vr.formattedShiftDuration && vr.formattedShiftDuration !== '--')
          ? vr.formattedShiftDuration
          : (isSingle && routeResult?.formattedMaxShiftDuration ? routeResult.formattedMaxShiftDuration : '--');

        return {
          ...vr,
          vehicleLabel: vr.vehicleLabel || preset?.vehicleLabel || `Vehicle ${idx < 9 ? `0${idx + 1}` : idx + 1}`,
          technicianName: vr.technicianName || preset?.technicianName,
          depotName: vr.depotName || preset?.depotName,
          depotAddress: vr.depotAddress || preset?.depotAddress,
          shiftSchedule: vr.shiftSchedule || (preset ? `${preset.shiftDays} ${preset.shiftStart}–${preset.shiftEnd}` : 'Mon–Fri 07:00–16:00'),
          formattedTotalDistance: dist,
          formattedTotalDuration: dur,
          formattedShiftDuration: shift,
          totalDistanceMeters: vr.totalDistanceMeters || (isSingle ? routeResult?.totalDistanceMeters || 0 : 0),
          totalDurationSeconds: vr.totalDurationSeconds || (isSingle ? routeResult?.totalDurationSeconds || 0 : 0),
          shiftDurationMinutes: vr.shiftDurationMinutes || (isSingle ? routeResult?.maxShiftDurationMinutes || 0 : 0)
        };
      });
    }

    // Synthesis for pre-optimization or baseline state from available stops
    const stopsToPartition = (routeResult?.orderedStops || []).filter(s => s.id !== 'depot');
    const fallbackDepot = (routeResult?.orderedStops || []).find(s => s.id === 'depot') || {
      id: 'depot',
      name: 'Sandton Depot',
      location: stopsToPartition[0]?.location || { lat: -26.095, lng: 28.025 }
    };
    const count = Math.max(1, fleetSize);

    return Array.from({ length: count }).map((_, idx) => {
      const vanId = `van-${idx + 1}`;
      const preset = JHB_VEHICLES[idx];
      const chunkSize = Math.ceil(stopsToPartition.length / count);
      const assignedStops = stopsToPartition.slice(idx * chunkSize, (idx + 1) * chunkSize);
      const vanRevenue = assignedStops.reduce((acc, s) => acc + (s.serviceCost || 450), 0) || (assignedStops.length * 450);

      const depotStop: PetStop = preset
        ? {
            ...(fallbackDepot as PetStop),
            id: 'depot',
            name: preset.depotName,
            address: preset.depotAddress,
            location: preset.depotLocation
          }
        : (fallbackDepot as PetStop);

      const vanStops = [depotStop, ...assignedStops];
      const baselineCalc = calculateRouteResult(vanStops);
      const baselineVal = validateTimeWindows(vanStops, baselineCalc.legs, 420);

      return {
        vehicleId: vanId,
        vehicleLabel: preset?.vehicleLabel || `Vehicle ${idx < 9 ? `0${idx + 1}` : idx + 1}`,
        technicianName: preset?.technicianName,
        depotName: preset?.depotName,
        depotAddress: preset?.depotAddress,
        depotLocation: preset?.depotLocation,
        shiftSchedule: preset ? `${preset.shiftDays} ${preset.shiftStart}–${preset.shiftEnd}` : 'Mon–Fri 07:00–16:00',
        color: ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316'][idx % 8],
        appointmentCount: assignedStops.length,
        totalDistanceMeters: baselineCalc.totalDistanceMeters,
        totalDurationSeconds: baselineCalc.totalDurationSeconds,
        shiftDurationMinutes: baselineVal.totalShiftMinutes,
        formattedTotalDistance: baselineCalc.formattedTotalDistance,
        formattedTotalDuration: baselineCalc.formattedTotalDuration,
        formattedShiftDuration: baselineVal.formattedShiftDuration,
        revenue: vanRevenue,
        orderedStops: assignedStops,
        legs: baselineCalc.legs,
        totalDurationMin: baselineCalc.totalDurationMin
      };
    });
  }, [vehicleRoutes, routeResult, fleetSize]);

  // Aggregate totals across all vehicles
  const totalStops = effectiveRoutes.reduce(
    (sum, vr) => sum + (vr.orderedStops?.length ? vr.orderedStops.filter(s => s.id !== 'depot').length : vr.appointmentCount || 0),
    0
  );

  const totalRevenue = effectiveRoutes.reduce((sum, vr) => sum + (vr.revenue || 0), 0) || (totalStops * 450);

  const totalShiftMinutes = effectiveRoutes.reduce((sum, vr) => sum + (vr.shiftDurationMinutes || 0), 0);
  const totalShiftHrs = Math.floor(totalShiftMinutes / 60);
  const totalShiftMins = Math.round(totalShiftMinutes % 60);
  const formattedTotalShift = totalShiftMinutes > 0
    ? (totalShiftHrs > 0 ? `${totalShiftHrs}h ${totalShiftMins}m` : `${totalShiftMins}m`)
    : (routeResult?.formattedTotalDuration || '--');

  return (
    <div
      id="route-metrics-panel"
      className={`backdrop-blur-md p-3 rounded-2xl border flex flex-col gap-2.5 transition-colors ${
        isDark
          ? 'bg-slate-950/95 border-slate-800 text-slate-100 shadow-xl'
          : 'bg-white/98 border-slate-200 text-slate-900 shadow-md'
      } ${className || ''}`}
    >
      {/* Quick KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={`p-2 rounded-xl border flex flex-col justify-center min-w-0 ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 shrink-0">
              <Calendar className="w-3 h-3" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium truncate">Customer Visits</span>
          </div>
          <div className="text-xs font-black font-mono truncate mt-1 pl-0.5">{totalStops} visits</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center min-w-0 ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 shrink-0">
              <Truck className="w-3 h-3" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium truncate">Active Vehicles</span>
          </div>
          <div className="text-xs font-black font-mono truncate mt-1 pl-0.5">{effectiveRoutes.length} vehicles</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center min-w-0 ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 rounded-md bg-sky-500/10 text-sky-400 shrink-0">
              <Clock className="w-3 h-3" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium truncate">Total Crew Hours</span>
          </div>
          <div className="text-xs font-black font-mono text-sky-400 truncate mt-1 pl-0.5">{formattedTotalShift}</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center min-w-0 ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/10 text-amber-400 shrink-0">
              <Banknote className="w-3 h-3" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium truncate">Daily Revenue</span>
          </div>
          <div className="text-xs font-black font-mono text-amber-400 truncate mt-1 pl-0.5">R{totalRevenue.toLocaleString('en-ZA')}</div>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="overflow-x-auto w-full min-h-0">
        <table className="w-full min-w-[540px] text-left border-collapse text-[11px] leading-tight">
          <thead>
            <tr
              className={`border-b font-bold uppercase tracking-wider text-[9px] ${
                isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
              }`}
            >
              <th className="py-1.5 pr-2">Vehicle / Technician / Depot</th>
              <th className="py-1.5 px-2 text-center">Visits</th>
              <th className="py-1.5 px-2">Transit (km / Drive)</th>
              <th className="py-1.5 px-2" title="Total shift duration including driving, buffer, and 15-40m visit durations (Mon–Fri 07:00–16:00)">
                Shift (07:00–16:00)
              </th>
              <th className="py-1.5 px-2 text-center">Time Windows</th>
              <th className="py-1.5 px-2 text-right">Revenue (ZAR)</th>
            </tr>
          </thead>
          <tbody className={isDark ? 'divide-y divide-slate-900/80' : 'divide-y divide-slate-100'}>
            {effectiveRoutes.map((vr, idx) => {
              const vanId = vr.vehicleId || `van-${idx + 1}`;
              const isSelected = activeVanFilter === vanId;
              const visitCount = vr.orderedStops?.length
                ? vr.orderedStops.filter(s => s.id !== 'depot').length
                : vr.appointmentCount || 0;

              const vanBgBorder =
                idx === 0
                  ? 'border-l-blue-500 bg-blue-500/10'
                  : idx === 1
                  ? 'border-l-emerald-500 bg-emerald-500/10'
                  : idx === 2
                  ? 'border-l-purple-500 bg-purple-500/10'
                  : idx === 3
                  ? 'border-l-amber-500 bg-amber-500/10'
                  : 'border-l-pink-500 bg-pink-500/10';

              const vanPillColor =
                idx === 0
                  ? 'bg-blue-500 text-white'
                  : idx === 1
                  ? 'bg-emerald-500 text-white'
                  : idx === 2
                  ? 'bg-purple-500 text-white'
                  : idx === 3
                  ? 'bg-amber-500 text-white'
                  : 'bg-pink-500 text-white';

              const vehicleRevenue = vr.revenue || visitCount * 450;

              return (
                <tr
                  key={vanId}
                  id={`van-row-${vanId}`}
                  onClick={() => !isOptimizing && onSelectVanFilter?.(activeVanFilter === vanId ? 'all' : vanId)}
                  className={`transition-all duration-150 border-l-2 ${
                    isOptimizing ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? `${vanBgBorder} font-bold`
                      : isDark
                      ? 'text-slate-300 hover:bg-slate-900/50 border-l-transparent'
                      : 'text-slate-700 hover:bg-slate-50 border-l-transparent'
                  }`}
                >
                  <td className="py-2.5 sm:py-1.5 pr-2 font-semibold">
                    <div className="flex items-center gap-1.5 pl-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black tracking-wide shrink-0 ${vanPillColor}`}>
                        {vr.vehicleLabel || `Vehicle ${idx < 9 ? `0${idx + 1}` : idx + 1}`}
                      </span>
                      <div className="min-w-0">
                        {vr.technicianName && (
                          <div className={`text-[10.5px] font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            {vr.technicianName}
                          </div>
                        )}
                        {vr.depotAddress && (
                          <div className={`text-[9px] truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {vr.depotAddress}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center align-middle font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {visitCount} visits
                    </span>
                  </td>
                  <td className="py-1.5 px-2 font-mono align-middle text-[10.5px]">
                    <span>{vr.formattedTotalDistance?.split('(')[0]?.trim() || vr.formattedTotalDistance || '--'}</span>
                    <span className={`ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      &bull; {vr.formattedTotalDuration || '--'}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 px-2 font-mono align-middle font-bold ${
                      isDark ? 'text-sky-400' : 'text-sky-600'
                    }`}
                  >
                    <div>{vr.formattedShiftDuration || '--'}</div>
                    <div className={`text-[9px] font-sans font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {vr.shiftSchedule || 'Mon–Fri 07:00–16:00'}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center align-middle">
                    {hasOptimized ? (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold text-emerald-400 bg-emerald-500/10">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>{visitCount}/{visitCount} On-Time</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[9.5px]">Pending Plan</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold align-middle text-amber-400">
                    R{vehicleRevenue.toLocaleString('en-ZA')}
                  </td>
                </tr>
              );
            })}

            {/* Combined All Vehicles Total Row */}
            <tr
              id="all-vans-total-row"
              className={`border-t font-black ${
                isDark ? 'border-slate-800 bg-slate-900/60 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              <td className="py-1.5 pr-2 pl-2">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>All Vehicles Total</span>
                </div>
              </td>
              <td className="py-1.5 px-2 text-center font-mono">{totalStops} visits</td>
              <td className="py-1.5 px-2 font-mono text-[10.5px]">
                <span>{routeResult?.formattedTotalDistance?.split('(')[0]?.trim() || routeResult?.formattedTotalDistance || '--'}</span>
                <span className={`ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  &bull; {routeResult?.formattedTotalDuration || '--'}
                </span>
              </td>
              <td className={`py-1.5 px-2 font-mono font-bold ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>
                {formattedTotalShift}
              </td>
              <td className="py-1.5 px-2 text-center">
                {hasOptimized ? (
                  <span className="text-emerald-400 text-[10px] font-bold">100% On-Time</span>
                ) : (
                  <span className="text-amber-400 text-[10px] font-bold">Scheduled Visits</span>
                )}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-amber-400">
                R{totalRevenue.toLocaleString('en-ZA')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
