import React, { useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  GripVertical,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Truck,
  Compass,
  Pencil
} from 'lucide-react';
import {
  PetStop,
  Weekday,
  WEEKDAYS,
  WEEKDAY_SHORT,
  WEEKDAY_COLORS,
  WeekSchedulePlan
} from '../types';

interface WeekZoneSidebarProps {
  weekPlan: WeekSchedulePlan;
  selectedStop: PetStop | null;
  onSelectStop: (stop: PetStop) => void;
  activeWeekdayFilter: 'all' | Weekday;
  onSelectWeekdayFilter: (day: 'all' | Weekday) => void;
  onMoveStopToWeekday: (stopId: string, targetWeekday: Weekday, targetVehicleId?: string) => void;
  onReclusterWeek: () => void;
  onOpenPlacement?: () => void;
  onEditStop?: (stop: PetStop) => void;
  maxShiftHours?: number;
  isDark?: boolean;
  onClose?: () => void;
  className?: string;
}

export const WeekZoneSidebar: React.FC<WeekZoneSidebarProps> = ({
  weekPlan,
  selectedStop,
  onSelectStop,
  activeWeekdayFilter,
  onSelectWeekdayFilter,
  onMoveStopToWeekday,
  onReclusterWeek,
  onOpenPlacement,
  onEditStop,
  maxShiftHours = 9,
  isDark = true,
  onClose,
  className
}) => {
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // 'Monday' or 'Monday::van-1'

  const handleDragStart = (e: React.DragEvent, stopId: string) => {
    setDraggedStopId(stopId);
    e.dataTransfer.setData('text/plain', stopId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedStopId(null);
    setDragOverTarget(null);
  };

  const handleDropOnDay = (e: React.DragEvent, targetDay: Weekday, targetVanId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const stopId = draggedStopId || e.dataTransfer.getData('text/plain');
    setDraggedStopId(null);
    setDragOverTarget(null);
    if (!stopId) return;
    onMoveStopToWeekday(stopId, targetDay, targetVanId);
  };

  const visibleDays = activeWeekdayFilter === 'all' ? WEEKDAYS : [activeWeekdayFilter];

  return (
    <aside
      className={`flex flex-col backdrop-blur-xl h-full overflow-hidden transition-colors ${
        isDark ? 'bg-slate-950/90 border-slate-800/80 text-white' : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm'
      } ${className || 'w-full md:w-[400px] xl:w-[430px] border-l'}`}
    >
      {/* Top Header */}
      <div
        className={`px-3.5 py-2 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'bg-slate-950/90 border-slate-800/80' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-black uppercase tracking-wider truncate">
            Weekday Zones ({weekPlan.totalVisits})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReclusterWeek}
            title="Re-cluster all customers into optimal Mon–Fri geographic zones"
            className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RefreshCw className="w-3 h-3 text-sky-400" />
            <span>Re-cluster</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Collapse weekday panel"
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

      {/* Filter Pills Bar + Quick Placement Finder CTA */}
      <div className={`px-3 py-2 border-b space-y-2 shrink-0 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-100/80 border-slate-200'}`}>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => onSelectWeekdayFilter('all')}
            className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 transition-all ${
              activeWeekdayFilter === 'all'
                ? isDark
                  ? 'bg-slate-700 text-white shadow'
                  : 'bg-white text-slate-900 shadow border border-slate-300'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Week
          </button>

          {WEEKDAYS.map((day) => {
            const summary = weekPlan.daySummaries[day];
            const color = WEEKDAY_COLORS[day];
            const isActive = activeWeekdayFilter === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectWeekdayFilter(isActive ? 'all' : day)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget(day);
                }}
                onDragLeave={() => {
                  if (dragOverTarget === day) setDragOverTarget(null);
                }}
                onDrop={(e) => handleDropOnDay(e, day)}
                className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 flex items-center gap-1 border transition-all ${
                  dragOverTarget === day
                    ? 'ring-2 ring-amber-400 scale-105'
                    : ''
                } ${
                  isActive
                    ? isDark
                      ? 'bg-slate-800 text-white border-slate-600'
                      : 'bg-white text-slate-900 border-slate-400 shadow-xs'
                    : isDark
                    ? 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
                    : 'bg-white/70 text-slate-700 border-slate-200 hover:bg-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span>{WEEKDAY_SHORT[day]}</span>
                <span className="text-[9.5px] opacity-75 font-mono">{summary?.totalVisits || 0}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 text-[10.5px]">
          <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            Drag any customer onto another day to move &amp; recalculate
          </span>
          {onOpenPlacement && (
            <button
              type="button"
              onClick={onOpenPlacement}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Compass className="w-3 h-3" />
              <span>New Customer Fit</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Weekday Drop Zones */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {visibleDays.map((day) => {
          const summary = weekPlan.daySummaries[day];
          const dayColor = WEEKDAY_COLORS[day];
          const routesForDay = weekPlan.dayRoutes.filter((r) => r.weekday === day);
          const isDayDropHighlighted = dragOverTarget === day;

          return (
            <div
              key={day}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverTarget !== day && !dragOverTarget?.startsWith(`${day}::`)) {
                  setDragOverTarget(day);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (dragOverTarget === day) setDragOverTarget(null);
                }
              }}
              onDrop={(e) => handleDropOnDay(e, day)}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isDayDropHighlighted
                  ? 'ring-2 ring-amber-400 border-amber-400'
                  : isDark
                  ? 'border-slate-800 bg-slate-900/50'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              {/* Weekday Header */}
              <div
                className={`px-3 py-2 border-b flex items-center justify-between gap-2 ${
                  isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dayColor }} />
                  <span className="text-xs font-black">{day}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {summary?.totalVisits || 0} visits
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10.5px] font-mono">
                  <span className="font-bold">
                    {((summary?.totalDistanceMeters || 0) / 1000).toFixed(1)} km
                  </span>
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                    {summary?.totalDriveMinutes || 0}m drive
                  </span>
                  {summary?.anyExceedsShift ? (
                    <span title={`Exceeds ${maxShiftHours}h shift`}>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    </span>
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
              </div>

              {/* Vehicles Inside Weekday */}
              <div className="p-2 space-y-2">
                {routesForDay.map((vr) => {
                  const vanDropKey = `${day}::${vr.vehicleId}`;
                  const isVanHighlighted = dragOverTarget === vanDropKey;
                  const customers = vr.orderedStops.filter((s) => !s.id.startsWith('depot'));
                  const shiftHrs = Math.floor(vr.shiftMinutes / 60);
                  const shiftMins = vr.shiftMinutes % 60;

                  return (
                    <div
                      key={vr.vehicleId}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragOverTarget !== vanDropKey) setDragOverTarget(vanDropKey);
                      }}
                      onDrop={(e) => handleDropOnDay(e, day, vr.vehicleId)}
                      className={`rounded-xl border p-2 transition-all ${
                        isVanHighlighted
                          ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400'
                          : isDark
                          ? 'border-slate-800/80 bg-slate-950/50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {/* Vehicle Subheader */}
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-inherit text-[10.5px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-bold truncate">{vr.vehicleLabel}</span>
                          {vr.technicianName && (
                            <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              · {vr.technicianName.split(' ')[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 font-mono shrink-0">
                          <span>{(vr.totalDistanceMeters / 1000).toFixed(1)}km</span>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>·</span>
                          <span>{vr.driveMinutes}m</span>
                          <span
                            className={`px-1 rounded text-[9.5px] font-bold ${
                              vr.exceedsShift
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                            title={`Shift: ${shiftHrs}h ${shiftMins}m (return ${vr.returnTime})`}
                          >
                            {vr.returnTime}
                          </span>
                        </div>
                      </div>

                      {customers.length === 0 ? (
                        <div className={`py-2 text-center text-[10px] italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          Drop a customer here to assign to {WEEKDAY_SHORT[day]} {vr.vehicleLabel}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {customers.map((stop, idx) => {
                            const isSelected = selectedStop?.id === stop.id;
                            const isDragged = draggedStopId === stop.id;
                            return (
                              <div
                                key={stop.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, stop.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => onSelectStop(stop)}
                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-xs cursor-grab active:cursor-grabbing transition-all ${
                                  isDragged ? 'opacity-40' : 'opacity-100'
                                } ${
                                  isSelected
                                    ? isDark
                                      ? 'bg-indigo-600/20 border-indigo-500/60'
                                      : 'bg-indigo-50 border-indigo-300'
                                    : isDark
                                    ? 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span
                                    className="w-4 h-4 rounded-full text-[9.5px] font-black text-slate-950 flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: dayColor }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <span className="text-xs shrink-0">{stop.avatar}</span>
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-bold truncate">{stop.name}</div>
                                    <div className={`text-[9.5px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                      {stop.suburb || stop.address} · {stop.durationMin}m
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {onEditStop && (
                                    <button
                                      type="button"
                                      onClick={() => onEditStop(stop)}
                                      aria-label={`Edit ${stop.name}`}
                                      title="Edit customer details"
                                      className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
                                        isDark
                                          ? 'bg-slate-950 border-slate-700 text-sky-400 hover:bg-slate-800'
                                          : 'bg-white border-slate-300 text-sky-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  <select
                                    aria-label={`Move ${stop.name} to weekday`}
                                    value={day}
                                    onChange={(e) => onMoveStopToWeekday(stop.id, e.target.value as Weekday)}
                                    className={`min-h-[36px] sm:min-h-0 text-[10px] font-bold rounded-md border px-1.5 sm:px-1 py-1 sm:py-0.5 cursor-pointer shrink-0 ${
                                      isDark
                                        ? 'bg-slate-950 border-slate-700 text-slate-300'
                                        : 'bg-white border-slate-300 text-slate-700'
                                    }`}
                                  >
                                    {WEEKDAYS.map((wd) => (
                                      <option key={wd} value={wd}>
                                        {WEEKDAY_SHORT[wd]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
