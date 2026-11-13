import React from 'react';
import { HelpCircle, Check, Loader2 } from 'lucide-react';
import { PetStop, VanTelemetry } from '../types';

export type SolverStep = 'idle' | 'solver' | 'routes' | 'completed';

interface OptimizationStepperProps {
  currentStep: SolverStep;
  solverUsed?: string;
  telemetry?: VanTelemetry;
  currentStop?: PetStop;
  currentStopIndex?: number;
  stops?: PetStop[];
  isDark?: boolean;
}

export const OptimizationStepper: React.FC<OptimizationStepperProps> = ({
  currentStep,
  solverUsed,
  telemetry,
  currentStop,
  currentStopIndex = 0,
  stops = [],
  isDark = true
}) => {
  const steps = [
    {
      id: 'solver',
      title: '1. Group & Sequence Stops'
    },
    {
      id: 'routes',
      title: '2. Google Routes API Directions'
    }
  ];

  if (currentStep === 'idle') {
    return (
      <div className={`p-2.5 rounded-xl text-xs border ${
        isDark
          ? 'bg-slate-900/80 border-slate-800 text-slate-300'
          : 'bg-white border-slate-200 text-slate-700 shadow-xs'
      }`}>
        <p className="leading-snug text-[11px]">
          This route planner orders recurring pool, pest, and garden customer visits across Johannesburg using Google Maps Platform Routes API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className={`p-2.5 rounded-xl space-y-2 text-xs border ${
        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xs'
      }`}>
        <div className={`flex items-center justify-between border-b pb-1.5 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <span className={`font-bold uppercase tracking-wider text-[10px] ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>Route Planning Progress</span>
          {currentStep === 'completed' ? (
            <span className={`text-[10px] font-extrabold flex items-center gap-1 ${
              isDark ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              <Check className="w-3.5 h-3.5 animate-in zoom-in duration-300" />
              <span>Route Ready</span>
            </span>
          ) : (
            <span className={`text-[10px] font-bold flex items-center gap-1 animate-pulse ${
              isDark ? 'text-sky-400' : 'text-sky-600'
            }`}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Planning Route...</span>
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {steps.map(step => {
            const isDone =
              currentStep === 'completed' ||
              (step.id === 'solver' && currentStep === 'routes');
            const isActive = currentStep === step.id;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 p-1.5 rounded-lg transition-all ${
                  isActive
                    ? isDark
                      ? 'bg-sky-500/10 border border-sky-500/20 text-sky-300'
                      : 'bg-sky-50 border border-sky-200 text-sky-800'
                    : isDone
                    ? isDark
                      ? 'text-emerald-400/90'
                      : 'text-emerald-700'
                    : isDark
                    ? 'text-slate-500'
                    : 'text-slate-400'
                }`}
              >
                <div className="shrink-0">
                  {isDone ? (
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-bold ${
                      isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    }`}>
                      ✓
                    </div>
                  ) : isActive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] font-bold ${
                      isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500'
                    }`}>
                      •
                    </div>
                  )}
                </div>
                <h4 className="font-semibold text-[11px] leading-tight">{step.title}</h4>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
