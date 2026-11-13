import React, { useState, useRef } from 'react';
import { PetStop } from '../types';
import {
  Clock,
  MapPin,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pin,
  GripVertical,
  Phone,
  Repeat,
  Pencil
} from 'lucide-react';

interface PetStopCardProps {
  stop: PetStop;
  index: number;
  totalStops: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onToggleStatus: () => void;
  onTogglePin?: () => void;
  isCompact?: boolean;
  isDark?: boolean;
  onChangeDuration?: (stopId: string, durationMin: number) => void;
  estimatedArrival?: string;
  timelineLeg?: {
    arrivalMinutes: number;
    waitDurationMinutes: number;
    serviceDurationMinutes: number;
    departureMinutes: number;
  };
  isViolated?: boolean;
  hasOptimized?: boolean;
  isOptimizing?: boolean;
  isDraggable?: boolean;
  isBeingDragged?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
}

const getServiceCategoryLabel = (stop: PetStop) => {
  if (stop.serviceCategory === 'pool') return 'Pool Cleaning';
  if (stop.serviceCategory === 'pest') return 'Pest Control';
  if (stop.serviceCategory === 'garden') return 'Garden Services';
  return stop.breed || 'Field Service';
};

export const PetStopCard: React.FC<PetStopCardProps> = ({
  stop,
  index,
  totalStops,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEdit,
  onToggleStatus,
  onTogglePin,
  isDark = true,
  onChangeDuration,
  estimatedArrival,
  timelineLeg,
  isViolated,
  hasOptimized = false,
  isOptimizing = false,
  isDraggable = true,
  isBeingDragged = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const justDraggedRef = useRef(false);

  const handleDragStart = (e: React.DragEvent) => {
    justDraggedRef.current = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stop.id);
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({ stopId: stop.id }));
    } catch (_) {}
    if (onDragStart) onDragStart(e);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (onDragEnd) onDragEnd(e);
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 180);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (justDraggedRef.current) {
      e.stopPropagation();
      return;
    }
    onSelect();
    setIsExpanded(true);
  };

  const isUrgent = stop.urgency === 'critical';
  const hasWait = hasOptimized && timelineLeg && timelineLeg.waitDurationMinutes > 0;
  const waitHours = hasWait ? Math.floor((timelineLeg?.waitDurationMinutes || 0) / 60) : 0;
  const waitMins = hasWait ? (timelineLeg?.waitDurationMinutes || 0) % 60 : 0;
  const waitFormatted = hasWait ? (waitHours > 0 ? `${waitHours}h ${waitMins}m` : `${waitMins}m`) : '';
  const showViolated = hasOptimized && isViolated;
  const categoryLabel = getServiceCategoryLabel(stop);

  // Compact collapsed row layout (folded by default)
  if (!isExpanded) {
    return (
      <div
        draggable={isDraggable && !isOptimizing}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        onClick={handleCardClick}
        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-xs select-none ${
          isBeingDragged
            ? 'opacity-35 border-dashed border-amber-400 ring-2 ring-amber-400/40 scale-[0.98]'
            : isSelected
              ? isDark
                ? 'bg-slate-900 border-indigo-500/80 ring-1 ring-indigo-500/50 shadow'
                : 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-400 shadow-sm'
              : isDark
                ? 'border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 hover:border-slate-700'
                : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            title="Drag to reorder visit"
            className={`p-0.5 -ml-1 rounded transition-colors shrink-0 ${
              isOptimizing ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-400'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center border shrink-0 ${
            !hasOptimized
              ? isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
              : stop.assignedVanId === 'van-1'
              ? 'bg-blue-600 text-white border-blue-400'
              : stop.assignedVanId === 'van-2'
              ? 'bg-emerald-600 text-white border-emerald-400'
              : stop.assignedVanId === 'van-3'
              ? 'bg-purple-600 text-white border-purple-400'
              : stop.assignedVanId === 'van-4'
              ? 'bg-amber-600 text-white border-amber-400'
              : stop.assignedVanId === 'van-5'
              ? 'bg-pink-600 text-white border-pink-400'
              : stop.assignedVanId === 'van-6'
              ? 'bg-cyan-600 text-white border-cyan-400'
              : stop.assignedVanId === 'van-7'
              ? 'bg-lime-600 text-white border-lime-400'
              : stop.assignedVanId === 'van-8'
              ? 'bg-orange-600 text-white border-orange-400'
              : isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            {hasOptimized ? (stop.vanOrder || index + 1) : index + 1}
          </span>
          {hasOptimized && stop.assignedVanId && (
            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-tight shrink-0 border ${
              stop.assignedVanId === 'van-1'
                ? isDark ? 'bg-blue-950/80 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-800 border-blue-300'
                : stop.assignedVanId === 'van-2'
                ? isDark ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : stop.assignedVanId === 'van-3'
                ? isDark ? 'bg-purple-950/80 text-purple-300 border-purple-800' : 'bg-purple-100 text-purple-800 border-purple-300'
                : stop.assignedVanId === 'van-4'
                ? isDark ? 'bg-amber-950/80 text-amber-300 border-amber-800' : 'bg-amber-100 text-amber-800 border-amber-300'
                : stop.assignedVanId === 'van-5'
                ? isDark ? 'bg-pink-950/80 text-pink-300 border-pink-800' : 'bg-pink-100 text-pink-800 border-pink-300'
                : stop.assignedVanId === 'van-6'
                ? isDark ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800' : 'bg-cyan-100 text-cyan-800 border-cyan-300'
                : stop.assignedVanId === 'van-7'
                ? isDark ? 'bg-lime-950/80 text-lime-300 border-lime-800' : 'bg-lime-100 text-lime-800 border-lime-300'
                : stop.assignedVanId === 'van-8'
                ? isDark ? 'bg-orange-950/80 text-orange-300 border-orange-800' : 'bg-orange-100 text-orange-800 border-orange-300'
                : isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {stop.assignedVanId === 'van-1' ? 'V1' : stop.assignedVanId === 'van-2' ? 'V2' : stop.assignedVanId === 'van-3' ? 'V3' : stop.assignedVanId === 'van-4' ? 'V4' : stop.assignedVanId === 'van-5' ? 'V5' : stop.assignedVanId === 'van-6' ? 'V6' : stop.assignedVanId === 'van-7' ? 'V7' : stop.assignedVanId === 'van-8' ? 'V8' : ''}
            </span>
          )}
          <span className="text-sm shrink-0">{stop.avatar}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${
            isDark ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          }`}>
            {stop.timeWindow.start}-{stop.timeWindow.end}
          </span>
          <span className={`font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{stop.name}</span>
          <span className={`text-[10px] truncate hidden sm:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            ({stop.suburb || categoryLabel} · {stop.durationMin}m)
          </span>
        </div>

        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Early Wait Warning Pill */}
          {hasWait && (
            <span
              title={`Vehicle arrives at ${estimatedArrival || 'early'} before window (${stop.timeWindow.start}). Technician waits ${waitFormatted}.`}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                isDark ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60' : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              ⏳ {waitFormatted} wait
            </span>
          )}

          {/* Window Violation Pill */}
          {showViolated && (
            <span
              title={`Arrival violates target window (${stop.timeWindow.start} - ${stop.timeWindow.end})`}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                isDark ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60' : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              ⚠️ Late
            </span>
          )}

          {/* Status Indicator */}
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
              stop.status === 'completed'
                ? isDark
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : stop.status === 'in-grooming'
                ? isDark
                  ? 'bg-amber-950/60 text-amber-400 border border-amber-900/50 animate-pulse'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                : isDark
                ? 'bg-slate-950 text-slate-500 border border-slate-800'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {stop.status === 'completed' ? 'Done' : stop.status === 'in-grooming' ? 'On Site' : 'Pending'}
          </span>

          {/* Edit Customer Button */}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={isOptimizing}
              aria-label={`Edit ${stop.name}`}
              title="Edit customer details"
              className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-md flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                isDark
                  ? 'bg-slate-800/80 text-sky-400 hover:bg-slate-700 hover:text-sky-300'
                  : 'bg-slate-100 text-sky-600 hover:bg-slate-200'
              }`}
            >
              <Pencil className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            </button>
          )}

          {/* Lock/Pin Position Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              disabled={isOptimizing}
              title={stop.isPinned ? "Unlock visit position" : "Lock visit position (Constraint)"}
              className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-md flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                stop.isPinned
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-amber-100 text-amber-700 border border-amber-300'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
                  : 'bg-slate-100 text-slate-400 hover:text-slate-700'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 sm:w-3 sm:h-3 ${stop.isPinned ? 'fill-amber-400 font-bold' : ''}`} />
            </button>
          )}

          {/* Quick move buttons */}
          <button
            type="button"
            disabled={isOptimizing || index === 0}
            onClick={onMoveUp}
            className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-md flex items-center justify-center disabled:opacity-20 ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark ? 'bg-slate-800/80 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          </button>
          <button
            type="button"
            disabled={isOptimizing || index === totalStops - 1}
            onClick={onMoveDown}
            className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-md flex items-center justify-center disabled:opacity-20 ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark ? 'bg-slate-800/80 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ChevronDown className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          </button>
        </div>
      </div>
    );
  }

  // Normal / Expanded card layout
  return (
    <div
      draggable={isDraggable && !isOptimizing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onClick={(e) => {
        if (justDraggedRef.current) {
          e.stopPropagation();
          return;
        }
        setIsExpanded(false);
      }}
      className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
        isBeingDragged
          ? 'opacity-35 border-dashed border-amber-400 ring-2 ring-amber-400/40 scale-[0.98]'
          : isSelected
            ? isDark
              ? 'bg-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
              : 'bg-indigo-50/50 border-indigo-500 shadow-md ring-1 ring-indigo-400'
            : isDark
              ? 'bg-slate-900/60 border-slate-800 hover:bg-slate-900/90 hover:border-slate-700'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            title="Drag to reorder visit"
            className={`p-0.5 -ml-1 rounded transition-colors shrink-0 ${
              isOptimizing ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-400'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div className="relative">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border shadow select-none ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              {stop.avatar}
            </div>
            <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow border select-none ${
              isDark ? 'border-slate-900' : 'border-white'
            }`}>
              {index + 1}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 ${
                isDark ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                <Clock className="w-2.5 h-2.5" />
                <span>{stop.timeWindow.start} - {stop.timeWindow.end}</span>
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                stop.serviceCategory === 'pool'
                  ? isDark ? 'bg-sky-950/70 text-sky-300 border-sky-800/60' : 'bg-sky-50 text-sky-700 border-sky-200'
                  : stop.serviceCategory === 'pest'
                  ? isDark ? 'bg-rose-950/70 text-rose-300 border-rose-800/60' : 'bg-rose-50 text-rose-700 border-rose-200'
                  : isDark ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {categoryLabel}
              </span>
              {isUrgent && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border animate-pulse ${
                  isDark ? 'bg-rose-950/80 text-rose-300 border-rose-800/60' : 'bg-rose-100 text-rose-700 border-rose-300'
                }`}>
                  Priority Callout
                </span>
              )}
            </div>
            <h4 className={`text-xs font-bold transition-colors ${
              isDark ? 'text-white group-hover:text-sky-400' : 'text-slate-900 group-hover:text-indigo-600'
            }`}>
              {stop.name}
            </h4>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {stop.suburb ? `${stop.suburb} · ` : ''}{stop.ownerName}
            </p>
          </div>
        </div>

        {/* Move & Action Controls */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity"
        >
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={isOptimizing}
              aria-label={`Edit ${stop.name}`}
              title="Edit customer details"
              className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                isDark
                  ? 'bg-slate-800/80 text-sky-400 hover:bg-slate-700 hover:text-sky-300'
                  : 'bg-slate-100 text-sky-600 hover:bg-slate-200'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              disabled={isOptimizing}
              title={stop.isPinned ? "Unlock visit position" : "Lock visit position (Constraint)"}
              className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                stop.isPinned
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-amber-100 text-amber-700 border border-amber-300'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${stop.isPinned ? 'fill-amber-400' : ''}`} />
            </button>
          )}

          <button
            type="button"
            disabled={isOptimizing || index === 0}
            onClick={onMoveUp}
            title="Move Earlier in Route"
            className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-lg flex items-center justify-center disabled:opacity-30 ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={isOptimizing || index === totalStops - 1}
            onClick={onMoveDown}
            title="Move Later in Route"
            className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-lg flex items-center justify-center disabled:opacity-30 ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isOptimizing}
            title="Remove Customer Visit"
            className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${
              isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${
              isDark ? 'bg-slate-800/80 text-rose-400 hover:bg-rose-950/60 hover:border-rose-800' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Address & Service */}
      <div className="mt-2.5 space-y-1 text-xs">
        <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          <MapPin className={`w-3 h-3 shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
          <span className="truncate">{stop.address}</span>
        </div>

        <div className={`flex items-center justify-between pt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <span className={`font-semibold truncate ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>{stop.serviceType}</span>
          <span className={`font-bold font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>R{stop.serviceCost}</span>
        </div>
      </div>

      {/* Customer Phone, Frequency & Access Notes */}
      <div className={`mt-2 p-2 rounded-xl text-[11px] space-y-1 ${
        isDark
          ? 'bg-slate-950/60 border border-slate-800/80 text-slate-300'
          : 'bg-slate-50 border border-slate-200 text-slate-700'
      }`}>
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1 text-sky-400 font-semibold">
            <Phone className="w-3 h-3" />
            {stop.phone || '+27 82 555 0100'}
          </span>
          <span className="flex items-center gap-1 text-amber-400 font-semibold">
            <Repeat className="w-3 h-3" />
            {stop.weeklyFrequency || 'Weekly'}
          </span>
        </div>
        {(stop.notes || stop.specialInstructions || stop.personality) && (
          <div className={`text-[10.5px] leading-snug space-y-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {(stop.notes || stop.personality) && (
              <div className={`font-medium ${isDark ? 'text-amber-300/90' : 'text-amber-800'}`}>
                Notes: {stop.notes || stop.personality}
              </div>
            )}
            {stop.specialInstructions && (
              <div>{stop.specialInstructions}</div>
            )}
          </div>
        )}
      </div>

      {/* Estimated Schedule & Early Wait Alert */}
      {(estimatedArrival || hasWait || showViolated) && (
        <div className={`mt-2.5 p-2 rounded-xl text-[11px] border flex flex-col gap-1 ${
          hasWait
            ? isDark
              ? 'bg-amber-950/30 border-amber-800/50 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-900'
            : showViolated
            ? isDark
              ? 'bg-rose-950/30 border-rose-800/50 text-rose-300'
              : 'bg-rose-50 border-rose-200 text-rose-900'
            : isDark
            ? 'bg-slate-950/40 border-slate-800/80 text-slate-300'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center justify-between font-bold text-[10px]">
            <span>Arrival: {estimatedArrival || 'Scheduled'}</span>
            {hasWait && (
              <span className="text-amber-400 font-extrabold flex items-center gap-1">
                ⏳ Early Arrival (Wait: {waitFormatted})
              </span>
            )}
            {showViolated && (
              <span className="text-rose-400 font-extrabold">⚠️ Late (Past Window)</span>
            )}
          </div>
          {hasWait && (
            <p className={`text-[10px] ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
              Technician arrives at {estimatedArrival}, customer window opens at {stop.timeWindow.start}. Waiting {waitFormatted} before starting {stop.durationMin}m visit.
            </p>
          )}
        </div>
      )}

      {/* Bottom Footer: Time window & Status toggle */}
      <div className={`mt-3 flex items-center justify-between pt-2 border-t text-xs ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
        <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          <Clock className={`w-3 h-3 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <span className="text-[10px] flex items-center gap-1">
            <span>Window: {stop.timeWindow.start} - {stop.timeWindow.end} • Visit:</span>
            {onChangeDuration ? (
              <select
                value={stop.durationMin}
                disabled={isOptimizing}
                onChange={(e) => onChangeDuration(stop.id, Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className={`border rounded px-1 py-0.5 text-[9px] focus:outline-none focus:border-indigo-500 font-extrabold disabled:opacity-40 disabled:cursor-not-allowed ${
                  isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value={15}>15m</option>
                <option value={20}>20m</option>
                <option value={25}>25m</option>
                <option value={30}>30m</option>
                <option value={35}>35m</option>
                <option value={40}>40m</option>
              </select>
            ) : (
              <span>{stop.durationMin} min</span>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus();
          }}
          disabled={isOptimizing}
          className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isOptimizing ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            stop.status === 'completed'
              ? isDark
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
              : stop.status === 'in-grooming'
              ? isDark
                ? 'bg-amber-950/80 text-amber-400 border border-amber-800 animate-pulse'
                : 'bg-amber-100 text-amber-700 border border-amber-300 animate-pulse'
              : isDark
              ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {stop.status === 'completed'
            ? '✓ Visit Complete'
            : stop.status === 'in-grooming'
            ? '🛠️ Servicing...'
            : 'Pending'}
        </button>
      </div>
    </div>
  );
};
