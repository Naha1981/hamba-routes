import React from 'react';
import { CalendarDays, Route, Clock, Fuel, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  WeekSchedulePlan,
  Weekday,
  WEEKDAYS,
  WEEKDAY_SHORT,
  WEEKDAY_COLORS,
  FuelSettings
} from '../types';

interface WeekDashboardProps {
  weekPlan: WeekSchedulePlan;
  fuelSettings: FuelSettings;
  activeWeekdayFilter: 'all' | Weekday;
  onSelectWeekdayFilter: (day: 'all' | Weekday) => void;
  fleetSize: number;
  className?: string;
  isDark?: boolean;
}

export const WeekDashboard: React.FC<WeekDashboardProps> = ({
  weekPlan,
  fuelSettings,
  activeWeekdayFilter,
  onSelectWeekdayFilter,
  fleetSize,
  className,
  isDark = true
}) => {
  const totalKm = weekPlan.totalDistanceMeters / 1000;
  const weeklyFuelCost =
    totalKm * (fuelSettings.fuelConsumptionLPer100Km / 100) * fuelSettings.fuelPricePerLitre;

  const vehicleIds = Array.from({ length: Math.max(1, fleetSize) }, (_, i) => `van-${i + 1}`);

  return (
    <div
      id="week-metrics-panel"
      className={`backdrop-blur-md p-3 rounded-2xl border flex flex-col gap-2.5 transition-colors ${
        isDark
          ? 'bg-slate-950/95 border-slate-800 text-slate-100 shadow-xl'
          : 'bg-white/98 border-slate-200 text-slate-900 shadow-md'
      } ${className || ''}`}
    >
      {/* Top Weekly Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={`p-2 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium truncate">Mon–Fri Scheduled Visits</span>
          </div>
          <div className="text-xs font-black font-mono mt-1">{weekPlan.totalVisits} visits</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium truncate">Weekly Fleet Distance</span>
          </div>
          <div className="text-xs font-black font-mono text-sky-400 mt-1">{totalKm.toFixed(1)} km</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium truncate">Weekly Drive Time</span>
          </div>
          <div className="text-xs font-black font-mono text-purple-400 mt-1">{weekPlan.totalDriveMinutes} min</div>
        </div>

        <div className={`p-2 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5">
            <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium truncate">
              Est. Weekly Fuel (R{fuelSettings.fuelPricePerLitre}/L)
            </span>
          </div>
          <div className="text-xs font-black font-mono text-amber-400 mt-1">R{weeklyFuelCost.toFixed(0)}</div>
        </div>
      </div>

      {/* Per-Day x Per-Vehicle Matrix Table */}
      <div className="overflow-x-auto w-full min-h-0">
        <table className="w-full min-w-[560px] text-left border-collapse text-[11px] leading-tight">
          <thead>
            <tr
              className={`border-b font-bold uppercase tracking-wider text-[9px] ${
                isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
              }`}
            >
              <th className="py-1.5 pr-2">Weekday</th>
              {vehicleIds.map((vId, idx) => (
                <th key={vId} className="py-1.5 px-2">
                  Van {idx + 1} (km · drive min)
                </th>
              ))}
              <th className="py-1.5 px-2 text-right">Day Total</th>
            </tr>
          </thead>
          <tbody className={isDark ? 'divide-y divide-slate-900/80' : 'divide-y divide-slate-100'}>
            {WEEKDAYS.map((day) => {
              const summary = weekPlan.daySummaries[day];
              const isSelected = activeWeekdayFilter === day;
              const dayColor = WEEKDAY_COLORS[day];

              return (
                <tr
                  key={day}
                  onClick={() => onSelectWeekdayFilter(isSelected ? 'all' : day)}
                  className={`cursor-pointer transition-colors border-l-2 ${
                    isSelected
                      ? isDark
                        ? 'bg-slate-800/70 font-bold'
                        : 'bg-slate-100 font-bold'
                      : isDark
                      ? 'hover:bg-slate-900/60 border-l-transparent'
                      : 'hover:bg-slate-50 border-l-transparent'
                  }`}
                  style={isSelected ? { borderLeftColor: dayColor } : undefined}
                >
                  <td className="py-2.5 sm:py-1.5 pr-2 pl-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dayColor }} />
                      <span className="font-bold">{WEEKDAY_SHORT[day]}</span>
                      <span className={`text-[9.5px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ({summary?.totalVisits || 0})
                      </span>
                    </div>
                  </td>

                  {vehicleIds.map((vId) => {
                    const dr = weekPlan.dayRoutes.find((r) => r.weekday === day && r.vehicleId === vId);
                    if (!dr || dr.visitCount === 0) {
                      return (
                        <td key={vId} className={`py-1.5 px-2 font-mono text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                          —
                        </td>
                      );
                    }
                    const km = (dr.totalDistanceMeters / 1000).toFixed(1);
                    return (
                      <td key={vId} className="py-1.5 px-2 font-mono text-[10.5px]">
                        <span className="font-bold">{km} km</span>{' '}
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>· {dr.driveMinutes}m</span>{' '}
                        <span
                          className={`text-[9.5px] px-1 rounded ${
                            dr.exceedsShift ? 'bg-rose-500/20 text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          ({dr.visitCount}v · {dr.returnTime})
                        </span>
                      </td>
                    );
                  })}

                  <td className="py-1.5 px-2 text-right font-mono">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="font-bold">{((summary?.totalDistanceMeters || 0) / 1000).toFixed(1)} km</span>
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>· {summary?.totalDriveMinutes || 0}m</span>
                      {summary?.anyExceedsShift ? (
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
