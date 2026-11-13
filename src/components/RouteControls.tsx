import React, { useState } from 'react';
import {
  Sparkles,
  PlusCircle,
  Play,
  Pause,
  RotateCcw,
  ArrowUpDown,
  Truck,
  Users,
  Database,
  CalendarDays,
  Compass,
  Navigation,
  Calculator
} from 'lucide-react';
import { OptimizedRouteResult, PetStop, VanTelemetry } from '../types';
import { OptimizationStepper, SolverStep } from './OptimizationStepper';

interface RouteControlsProps {
  onOptimize: () => void;
  onAddStop: () => void;
  onLoadDemoData?: () => void;
  onOpenPlacement?: () => void;
  viewMode?: 'day' | 'week' | 'today' | 'savings';
  onViewModeChange?: (mode: 'day' | 'week' | 'today' | 'savings') => void;
  onToggleSimulation: () => void;
  onReverseMeetingOrder?: () => void;
  onReverseSimulation?: () => void;
  onResetSimulation?: () => void;
  simStatus: 'idle' | 'running' | 'paused';
  simDirection?: 'forward' | 'reverse';
  isSimulationDisabled?: boolean;
  isOptimizing: boolean;
  hasOptimized: boolean;
  routeResult: OptimizedRouteResult;
  className?: string;
  isDark?: boolean;
  fleetSize?: number;
  onFleetSizeChange?: (size: number) => void;
  onSelectFleetSize?: (size: number) => void;
  fleetAllocationMode?: 'auto' | 'manual';
  onSelectFleetAllocationMode?: (mode: 'auto' | 'manual') => void;
  maxShiftHours?: number;
  onSelectMaxShiftHours?: (hrs: number) => void;
  clientStopCount?: number;
  onClientStopCountChange?: (count: number) => void;
  onResetToDefaults?: () => void;
  // Vehicle status HUD props
  telemetry?: VanTelemetry;
  currentStop?: PetStop;
  currentStopIndex?: number;
  stops?: PetStop[];
  solverStep?: SolverStep;
  solverUsed?: string;
  showStepper?: boolean;
  showVanHud?: boolean;
}

export const RouteControls: React.FC<RouteControlsProps> = ({
  onOptimize,
  onAddStop,
  onLoadDemoData,
  onOpenPlacement,
  viewMode = 'day',
  onViewModeChange,
  onToggleSimulation,
  onReverseMeetingOrder,
  onResetSimulation,
  simStatus,
  isSimulationDisabled,
  isOptimizing,
  hasOptimized,
  className,
  isDark = true,
  fleetSize = 3,
  onFleetSizeChange,
  clientStopCount = 15,
  onClientStopCountChange,
  solverStep = 'completed',
  solverUsed,
  showStepper = false
}) => {
  const [showPlanRouteNotice, setShowPlanRouteNotice] = useState(false);

  const handleSimulateClick = () => {
    if (!hasOptimized) {
      setShowPlanRouteNotice(true);
      setTimeout(() => setShowPlanRouteNotice(false), 4500);
      onToggleSimulation();
      return;
    }
    onToggleSimulation();
  };

  const innerControls = (
    <div className={`p-2 rounded-2xl border backdrop-blur-md flex items-center gap-2 overflow-x-auto w-full flex-wrap lg:flex-nowrap shrink-0 transition-colors ${
      isDark
        ? 'bg-slate-900/90 border-slate-800 shadow-xl'
        : 'bg-white/95 border-slate-200 shadow-md'
    }`}>
      {/* 0. Day View | Week View Toggle */}
      {onViewModeChange && (
        <div
          className={`flex items-center p-0.5 rounded-xl border shrink-0 ${
            isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
          role="group"
          aria-label="Route view mode"
        >
          <button
            type="button"
            id="view-mode-day-btn"
            onClick={() => onViewModeChange('day')}
            className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'day'
                ? 'bg-indigo-600 text-white shadow'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Day View
          </button>
          <button
            type="button"
            id="view-mode-week-btn"
            onClick={() => onViewModeChange('week')}
            className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'week'
                ? 'bg-emerald-600 text-white shadow'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3 h-3" />
            <span>Week View</span>
          </button>
          <button
            type="button"
            id="view-mode-today-btn"
            onClick={() => onViewModeChange('today')}
            className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'today'
                ? 'bg-amber-500 text-slate-950 shadow'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Navigation className="w-3 h-3" />
            <span>Today&rsquo;s route</span>
          </button>
          <button
            type="button"
            id="view-mode-savings-btn"
            onClick={() => onViewModeChange('savings')}
            className={`min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'savings'
                ? 'bg-teal-500 text-slate-950 shadow'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3 h-3" />
            <span>Savings</span>
          </button>
        </div>
      )}

      {/* 1. Plan Route Button */}
      <button
        onClick={onOptimize}
        disabled={isOptimizing}
        className="min-h-[44px] sm:min-h-0 flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 px-3.5 py-2 sm:py-1.5 rounded-xl text-xs font-extrabold shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap"
      >
        <Sparkles className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
        <span className="sm:hidden">{isOptimizing ? 'Planning...' : 'Plan'}</span>
        <span className="hidden sm:inline">{isOptimizing ? 'Planning...' : 'Plan Route'}</span>
      </button>

      {/* 1b. "Where should a new customer go?" Button */}
      {onOpenPlacement && (
        <button
          type="button"
          id="where-new-customer-btn"
          onClick={onOpenPlacement}
          disabled={isOptimizing}
          title="Rank Mon–Fri & vehicle placement options for a new customer address or Google Maps pin"
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-extrabold border transition-all shrink-0 whitespace-nowrap cursor-pointer disabled:opacity-40 ${
            isDark
              ? 'bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border-teal-500/35'
              : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden xl:inline">Where should a new customer go?</span>
          <span className="xl:hidden">New Customer Fit</span>
        </button>
      )}

      {/* 2. Simulate & 3. Refresh (Reset) Controls */}
      <div className="relative flex items-center gap-1 shrink-0">
        {showPlanRouteNotice && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-950 text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-2xl shadow-amber-500/40 whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 flex items-center gap-1.5 border border-amber-400">
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            <span>Please first Plan Route!</span>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-500 rotate-45 border-r border-b border-amber-400" />
          </div>
        )}

        <button
          onClick={handleSimulateClick}
          disabled={isSimulationDisabled || isOptimizing}
          title={
            !hasOptimized
              ? "First click 'Plan Route' before simulating"
              : simStatus === 'running'
              ? 'Pause simulation'
              : simStatus === 'paused'
              ? 'Resume simulation'
              : 'Start vehicle simulation'
          }
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 sm:gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            simStatus === 'running'
              ? 'bg-amber-600 text-white animate-pulse'
              : isSimulationDisabled || isOptimizing
              ? isDark
                ? 'bg-slate-900 text-slate-600 border border-slate-800/80 cursor-not-allowed opacity-40'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-40'
              : !hasOptimized
              ? isDark
                ? 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 border border-slate-700/60'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-300'
              : simStatus === 'paused'
              ? isDark
                ? 'bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40'
                : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-300'
              : isDark
              ? 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
          }`}
        >
          {simStatus === 'running' ? (
            <>
              <Pause className="w-3.5 h-3.5 text-white" />
              <span>Pause</span>
            </>
          ) : simStatus === 'paused' ? (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Simulate</span>
            </>
          )}
        </button>

        {onResetSimulation && (
          <button
            onClick={onResetSimulation}
            disabled={isOptimizing || !hasOptimized}
            title={!hasOptimized ? "First click 'Plan Route' to calculate route" : "Reset simulation back to 07:00 start"}
            className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 sm:p-1.5 rounded-xl border transition-all shrink-0 ${
              isOptimizing || !hasOptimized
                ? 'opacity-30 cursor-not-allowed'
                : 'cursor-pointer'
            } ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 3b. Load Demo Data (40 fictional customers across 3 vehicles) */}
      {onLoadDemoData && (
        <button
          id="load-demo-data-btn"
          onClick={onLoadDemoData}
          disabled={isOptimizing}
          title="Load 40 fictional customers across Sandton, Bryanston, Fourways, Randburg, Rosebank & Midrand (3 vehicles, Mon–Fri 07:00–16:00)"
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 sm:gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            isOptimizing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
          } ${
            clientStopCount === 40 && fleetSize === 3
              ? isDark
                ? 'bg-sky-500/25 hover:bg-sky-500/35 text-sky-300 border-sky-400/50'
                : 'bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300'
              : isDark
              ? 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border-sky-500/30'
              : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Load demo data</span>
        </button>
      )}

      {/* 4. Add Customer Visit */}
      <button
        onClick={onAddStop}
        disabled={isOptimizing}
        className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 sm:gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
          isOptimizing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
        } ${
          isDark
            ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/30'
            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
        }`}
      >
        <PlusCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Add Visit</span>
        <span className="sm:hidden">Add</span>
      </button>

      {/* 5. Customer Visits & 6. Vehicles Controls */}
      <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-slate-700/40">
        {/* 5. Customer Visits Stepper Pill */}
        <div
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-semibold shrink-0 ${
            isDark ? 'bg-slate-800/90 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-800'
          }`}
          title={`Customer visits: ${clientStopCount} (Min 6, Max 40)`}
        >
          <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-bold">Visits:</span>
          <button
            onClick={() => onClientStopCountChange && onClientStopCountChange(clientStopCount - 1)}
            disabled={isOptimizing || clientStopCount <= 6}
            className="w-8 h-8 sm:w-4 sm:h-4 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-700/50 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          >
            -
          </button>
          <span className={`font-mono text-xs font-bold px-0.5 ${clientStopCount === 40 || clientStopCount === 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {clientStopCount}
          </span>
          <button
            onClick={() => onClientStopCountChange && onClientStopCountChange(clientStopCount + 1)}
            disabled={isOptimizing || clientStopCount >= 40}
            className="w-8 h-8 sm:w-4 sm:h-4 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-700/50 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>

        {/* 6. Vehicles Stepper Pill */}
        <div
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-semibold shrink-0 ${
            isDark ? 'bg-slate-800/90 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-800'
          }`}
          title={`Fleet size: ${fleetSize} vehicles (Min 1, Max 8, Default 3 • Mon–Fri 07:00–16:00 SAST)`}
        >
          <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold">Vehicles:</span>
          <button
            onClick={() => onFleetSizeChange && onFleetSizeChange(fleetSize - 1)}
            disabled={isOptimizing || fleetSize <= 1}
            className="w-8 h-8 sm:w-4 sm:h-4 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-700/50 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          >
            -
          </button>
          <span className={`font-mono text-xs font-bold px-0.5 ${fleetSize === 3 ? 'text-emerald-400' : 'text-blue-400'}`}>
            {fleetSize}
          </span>
          <button
            onClick={() => onFleetSizeChange && onFleetSizeChange(fleetSize + 1)}
            disabled={isOptimizing || fleetSize >= 8}
            className="w-8 h-8 sm:w-4 sm:h-4 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-700/50 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      </div>

      {/* 7. Reverse Actual Order of Visits (Last on the right) */}
      {onReverseMeetingOrder && (
        <button
          id="reverse-meeting-order-btn"
          onClick={onReverseMeetingOrder}
          disabled={isOptimizing}
          title="Reverse the sequence of scheduled customer visits"
          className={`min-h-[44px] sm:min-h-0 flex items-center gap-1 sm:gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl border text-xs font-bold transition-all shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            isOptimizing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
          } ${
            isDark
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 hover:text-slate-950'
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
          <span>Reverse</span>
        </button>
      )}
    </div>
  );

  if (!showStepper) {
    return (
      <div className={`w-full ${className || ''}`}>
        {innerControls}
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col gap-2.5 ${className || ''}`}>
      {innerControls}
      <OptimizationStepper isDark={isDark} currentStep={solverStep} solverUsed={solverUsed} />
    </div>
  );
};
