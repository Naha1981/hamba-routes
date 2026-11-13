import React, { useMemo, useState } from 'react';
import { Code2, ChevronRight, ArrowUpDown } from 'lucide-react';
import { PetStop, OptimizedRouteResult } from '../types';
import { PetStopCard } from './PetStopCard';
import { SolverStep } from './OptimizationStepper';
import { validateTimeWindows, validateFleet } from '../utils/tspSolver';
import { JHB_VEHICLES } from '../data/mockPetStops';

interface StopListSidebarProps {
  stops: PetStop[];
  routeResult: OptimizedRouteResult;
  selectedStop: PetStop | null;
  onSelectStop: (stop: PetStop | null) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onSwapStops?: (stopIdA: string, stopIdB: string) => void;
  onReorderStop?: (sourceStopId: string, targetStopId: string, position: 'before' | 'after') => void;
  onDeleteStop: (id: string) => void;
  onEditStop?: (stop: PetStop) => void;
  onToggleStatus: (id: string) => void;
  onAddStop: () => void;
  onOpenSolverDebug?: () => void;
  onOpenBenchmark?: () => void;
  onTogglePin?: (id: string) => void;
  onReverseOrder?: () => void;
  className?: string;
  isDark?: boolean;
  onChangeDuration?: (stopId: string, durationMin: number) => void;
  solverStep?: SolverStep;
  solverUsed?: string;
  showStepper?: boolean;
  telemetry?: any;
  currentStop?: PetStop;
  currentStopIndex?: number;
  departureMinutes?: number;
  vehicleRoutes?: any[];
  activeVanFilter?: string;
  onSelectVanFilter?: (vanId: string) => void;
  fleetSize?: number;
  maxShiftHours?: number;
  onSelectMaxShiftHours?: (hrs: number) => void;
  hasOptimized?: boolean;
  isOptimizing?: boolean;
  onClose?: () => void;
}

export const StopListSidebar: React.FC<StopListSidebarProps> = ({
  stops,
  routeResult,
  selectedStop,
  onSelectStop,
  onMoveUp,
  onMoveDown,
  onSwapStops,
  onReorderStop,
  onDeleteStop,
  onEditStop,
  onToggleStatus,
  onOpenSolverDebug,
  onTogglePin,
  onReverseOrder,
  className,
  isDark = true,
  onChangeDuration,
  departureMinutes = 420,
  vehicleRoutes = [],
  activeVanFilter = 'all',
  onSelectVanFilter,
  fleetSize = 3,
  hasOptimized = false,
  isOptimizing = false,
  onClose
}) => {
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ stopId: string; position: 'before' | 'after' } | null>(null);

  const nonDepotStops = stops.filter(s => s.id !== 'depot');

  const filteredStops = useMemo(() => {
    if (!hasOptimized || !activeVanFilter || activeVanFilter === 'all') return nonDepotStops;
    return nonDepotStops.filter(s => s.assignedVanId === activeVanFilter);
  }, [nonDepotStops, activeVanFilter, hasOptimized]);

  const activeVanRoute = useMemo(() => {
    if (!hasOptimized || activeVanFilter === 'all') return null;
    return vehicleRoutes.find(vr => vr.vehicleId === activeVanFilter);
  }, [vehicleRoutes, activeVanFilter, hasOptimized]);

  const validation = useMemo(() => {
    if (!hasOptimized) {
      return {
        arrivalTimes: {},
        violationsCount: 0,
        violatedStopIds: [],
        totalShiftMinutes: 0,
        totalWaitMinutes: 0,
        formattedShiftDuration: '--',
        returnTime: '--',
        timelineLegs: []
      };
    }
    return validateTimeWindows(stops, routeResult.legs, departureMinutes);
  }, [stops, routeResult.legs, departureMinutes, hasOptimized]);

  const fleetVal = useMemo(() => {
    const vRoutes = vehicleRoutes && vehicleRoutes.length > 0 ? vehicleRoutes : routeResult.vehicleRoutes;
    if (vRoutes && vRoutes.length > 0) {
      return validateFleet(vRoutes, departureMinutes);
    }
    return null;
  }, [vehicleRoutes, routeResult.vehicleRoutes, departureMinutes]);

  const handleDragStart = (stopId: string) => {
    setDraggedStopId(stopId);
  };

  const handleDragEnd = () => {
    setDraggedStopId(null);
    setDropTarget(null);
  };

  const handleDragOverCard = (e: React.DragEvent, targetStopId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedStopId || draggedStopId === targetStopId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const position = relY < rect.height / 2 ? 'before' : 'after';

    if (!dropTarget || dropTarget.stopId !== targetStopId || dropTarget.position !== position) {
      setDropTarget({ stopId: targetStopId, position });
    }
  };

  const handleDropOnCard = (e: React.DragEvent, targetStopId: string) => {
    e.preventDefault();
    if (!draggedStopId || draggedStopId === targetStopId) {
      setDraggedStopId(null);
      setDropTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const position = relY < rect.height / 2 ? 'before' : 'after';

    if (onReorderStop) {
      onReorderStop(draggedStopId, targetStopId, position);
    } else if (onSwapStops) {
      onSwapStops(draggedStopId, targetStopId);
    }

    setDraggedStopId(null);
    setDropTarget(null);
  };

  return (
    <aside className={`flex flex-col backdrop-blur-xl h-full overflow-hidden transition-colors ${
      isDark
        ? 'bg-slate-950/90 border-slate-800/80 text-white'
        : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm'
    } ${className || 'w-full md:w-[400px] xl:w-[420px] border-l'}`}>
      {/* Top Header with Title, Reverse Order Button, and Optional Collapse Button */}
      <div className={`px-3.5 py-2 border-b flex items-center justify-between shrink-0 transition-colors ${
        isDark ? 'bg-slate-950/90 border-slate-800/80' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
            Customers & Visits ({nonDepotStops.length})
          </span>
          {onReverseOrder && nonDepotStops.length > 1 && (
            <button
              id="sidebar-reverse-order-btn"
              onClick={onReverseOrder}
              title="Reverse the sequence of scheduled visits"
              className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2 py-1.5 sm:py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                isDark
                  ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:text-white'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 hover:text-slate-950 shadow-xs'
              }`}
            >
              <ArrowUpDown className="w-3 h-3 text-amber-400" />
              <span>Reverse</span>
            </button>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Collapse visits panel to view full map"
            title="Collapse visits panel to view full map"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
              isDark
                ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
                : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Multi-Vehicle Filter Tabs - Shown after route planning */}
      {hasOptimized && fleetSize > 1 && (
        <div className={`px-3 py-2 border-b shrink-0 transition-colors ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100/90 border-slate-200'
        }`}>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap">
            <button
              onClick={() => onSelectVanFilter?.('all')}
              disabled={isOptimizing}
              className={`min-h-[44px] sm:min-h-0 py-1.5 px-3 sm:px-2.5 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                activeVanFilter === 'all'
                  ? isDark
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                    : 'bg-white text-slate-900 shadow-sm border border-slate-300'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Vehicles ({nonDepotStops.length})
            </button>
            {Array.from({
              length: Math.max(
                fleetSize,
                vehicleRoutes?.length || 0,
                ...nonDepotStops.map(s => {
                  const num = parseInt(s.assignedVanId?.replace('van-', '') || '0', 10);
                  return isNaN(num) ? 0 : num;
                })
              )
            }).map((_, idx) => {
              const vanId = `van-${idx + 1}`;
              const vanStops = nonDepotStops.filter(s => s.assignedVanId === vanId);
              const isActive = activeVanFilter === vanId;
              const vanBgActive = idx === 0
                ? 'bg-blue-600 text-white'
                : idx === 1
                ? 'bg-emerald-600 text-white'
                : idx === 2
                ? 'bg-purple-600 text-white'
                : idx === 3
                ? 'bg-amber-600 text-white'
                : idx === 4
                ? 'bg-pink-600 text-white'
                : idx === 5
                ? 'bg-cyan-600 text-white'
                : idx === 6
                ? 'bg-lime-600 text-white'
                : 'bg-orange-600 text-white';

              return (
                <button
                  key={vanId}
                  onClick={() => onSelectVanFilter?.(vanId)}
                  disabled={isOptimizing}
                  className={`min-h-[44px] sm:min-h-0 py-1.5 px-2.5 sm:px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    isActive
                      ? `${vanBgActive} shadow-sm`
                      : isDark ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800' : 'bg-white/80 text-slate-700 hover:bg-white border border-slate-200'
                  }`}
                >
                  <span>Veh {idx + 1}</span>
                  <span className={`text-[10px] px-1 rounded-full ${isActive ? 'bg-black/30 text-white' : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'}`}>
                    {vanStops.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Vehicle Specific Metrics Pill */}
          {activeVanRoute && activeVanFilter !== 'all' && (() => {
            const vNum = parseInt(activeVanFilter.replace('van-', ''), 10) || 1;
            const preset = JHB_VEHICLES[vNum - 1];
            const techName = activeVanRoute.technicianName || preset?.technicianName;
            const depotAddr = activeVanRoute.depotAddress || preset?.depotAddress;
            return (
              <div className={`mt-2 flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-sans font-bold text-slate-400">
                    Vehicle {vNum}{techName ? ` · ${techName}` : ''}
                  </span>
                  <span className="font-bold text-indigo-400">
                    {activeVanRoute.formattedTotalDistance} · {activeVanRoute.formattedShiftDuration} shift
                  </span>
                </div>
                {depotAddr && (
                  <div className={`font-sans text-[10px] truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Depot: {depotAddr}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Visit Cards Scrollable List */}
      <div
        className={`flex-1 overflow-y-auto p-3 space-y-2 ${isDark ? '' : 'bg-slate-50/50'}`}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTarget(null);
          }
        }}
      >
        {filteredStops.length === 0 ? (
          <div className={`p-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            No customer visits scheduled.
          </div>
        ) : (
          filteredStops.map((stop, index) => {
            const stopIndexInAll = stops.findIndex(s => s.id === stop.id);
            const stopInfo = fleetVal?.stopValidationMap[stop.id];

            const timelineLeg = hasOptimized
              ? (stopInfo ? stopInfo.timelineLeg : validation.timelineLegs[stopIndexInAll - 1])
              : undefined;
            const arrivalTimeStr = hasOptimized
              ? (stopInfo ? stopInfo.estimatedArrival : (validation.arrivalTimes as any)[stopIndexInAll])
              : undefined;
            const isViolated = hasOptimized
              ? (stopInfo ? stopInfo.isViolated : validation.violatedStopIds.includes(stop.id))
              : false;

            const isTargetBefore = dropTarget?.stopId === stop.id && dropTarget.position === 'before';
            const isTargetAfter = dropTarget?.stopId === stop.id && dropTarget.position === 'after';

            return (
              <React.Fragment key={stop.id}>
                {isTargetBefore && (
                  <div className="relative py-0.5 z-30 pointer-events-none transition-all">
                    <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-indigo-500 to-amber-400 rounded-full shadow-lg shadow-amber-400/40 animate-pulse" />
                  </div>
                )}
                <PetStopCard
                  stop={stop}
                  index={index}
                  totalStops={filteredStops.length}
                  isSelected={selectedStop?.id === stop.id}
                  onSelect={() => onSelectStop(stop)}
                  onMoveUp={() => {
                    if (onSwapStops && index > 0) {
                      onSwapStops(stop.id, filteredStops[index - 1].id);
                    } else {
                      onMoveUp(stops.indexOf(stop));
                    }
                  }}
                  onMoveDown={() => {
                    if (onSwapStops && index < filteredStops.length - 1) {
                      onSwapStops(stop.id, filteredStops[index + 1].id);
                    } else {
                      onMoveDown(stops.indexOf(stop));
                    }
                  }}
                  onDelete={() => onDeleteStop(stop.id)}
                  onEdit={onEditStop ? () => onEditStop(stop) : undefined}
                  onToggleStatus={() => onToggleStatus(stop.id)}
                  onTogglePin={() => onTogglePin && onTogglePin(stop.id)}
                  isCompact={true}
                  isDark={isDark}
                  onChangeDuration={onChangeDuration}
                  estimatedArrival={arrivalTimeStr}
                  timelineLeg={timelineLeg}
                  isViolated={isViolated}
                  hasOptimized={hasOptimized}
                  isOptimizing={isOptimizing}
                  isDraggable={!isOptimizing}
                  isBeingDragged={draggedStopId === stop.id}
                  onDragStart={() => handleDragStart(stop.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOverCard(e, stop.id)}
                  onDrop={(e) => handleDropOnCard(e, stop.id)}
                  onDragLeave={() => {
                    if (dropTarget?.stopId === stop.id) {
                      setDropTarget(null);
                    }
                  }}
                />
                {isTargetAfter && (
                  <div className="relative py-0.5 z-30 pointer-events-none transition-all">
                    <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-indigo-500 to-amber-400 rounded-full shadow-lg shadow-amber-400/40 animate-pulse" />
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

      {onOpenSolverDebug && (
        <div className={`p-2.5 border-t shrink-0 ${isDark ? 'bg-slate-950/95 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
          <button
            onClick={onOpenSolverDebug}
            disabled={isOptimizing}
            className={`w-full min-h-[44px] sm:min-h-0 font-bold py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl text-xs flex items-center justify-between border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark
                ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-xs'
            }`}
            title="Inspect Route Planner & Routes API request and response payloads"
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Inspect Planner & Routes API</span>
            </div>
            <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>JSON</span>
          </button>
        </div>
      )}
    </aside>
  );
};
