import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, CheckCircle2, Copy, Check, Clock, Sliders } from 'lucide-react';

interface DebugSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  debugInfo: {
    solverUsed: string;
    requestPayload?: any;
    responsePayload?: any;
    error?: string;
  } | null;
  solverLogs: {
    timestamp: string;
    solverUsed: string;
    optimizationMode: 'time' | 'distance' | 'balanced';
    requestPayload?: any;
    responsePayload?: any;
    error?: string;
  }[];
  isDark?: boolean;
}

export const DebugSolverModal: React.FC<DebugSolverModalProps> = ({
  isOpen,
  onClose,
  debugInfo,
  solverLogs,
  isDark = true
}) => {
  const [selectedLogIndex, setSelectedLogIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const [copied, setCopied] = useState(false);

  // Auto-select latest log when modal opens or updates
  useEffect(() => {
    if (isOpen && solverLogs.length > 0) {
      setSelectedLogIndex(0);
    }
  }, [isOpen, solverLogs.length]);

  if (!isOpen) return null;

  const activeLog = solverLogs[selectedLogIndex] || debugInfo;

  const copyToClipboard = (obj: any) => {
    if (!obj) return;
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPayload = () => {
    if (!activeLog) return null;
    return activeTab === 'request' ? activeLog.requestPayload : activeLog.responsePayload;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`border rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-200 ${
        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <span className="text-sm font-bold">⚙️</span>
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Route Planner & Routes API Inspector</h3>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Inspect geographic proximity clustering & Routes API payloads</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Outer Split Layout Container */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* LEFT SIDEBAR: Rolling Call History Log */}
          <div className={`w-1/3 border-r flex flex-col overflow-hidden ${
            isDark ? 'border-slate-800 bg-slate-950/40 divide-slate-850' : 'border-slate-200 bg-slate-50/50 divide-slate-200'
          }`}>
            <div className={`p-3 border-b shrink-0 ${isDark ? 'border-slate-800 bg-slate-950/20' : 'border-slate-200 bg-slate-100/50'}`}>
              <h4 className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Solver Run History ({solverLogs.length})
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
              {solverLogs.length === 0 ? (
                <div className={`p-8 text-center text-[11px] italic ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  No solver runs recorded in this session.
                </div>
              ) : (
                solverLogs.map((log, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedLogIndex(idx)}
                    className={`w-full p-3.5 flex flex-col text-left transition-colors border-l-4 cursor-pointer outline-none ${
                      selectedLogIndex === idx
                        ? isDark
                          ? 'bg-slate-800/80 border-indigo-500 bg-gradient-to-r from-indigo-500/5 to-transparent'
                          : 'bg-indigo-50/80 border-indigo-600'
                        : isDark
                        ? 'border-transparent hover:bg-slate-800/30 bg-transparent'
                        : 'border-transparent hover:bg-slate-100 bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] mb-1.5 w-full">
                      <span className={`font-mono flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Clock className="w-3 h-3 text-slate-400" />
                        {log.timestamp}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider uppercase ${
                        log.error ? 'bg-rose-500/10 text-rose-400 border border-rose-900/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-900/30'
                      }`}>
                        {log.error ? 'Failed' : 'Success'}
                      </span>
                    </div>

                    <div className={`text-xs font-black mb-1 flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{log.solverUsed}</span>
                    </div>

                    {Boolean(log.optimizationMode) && (
                      <div className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Goal: {log.optimizationMode === 'time' ? 'Fastest time' : log.optimizationMode === 'distance' ? 'Shortest distance' : 'Balanced'}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* RIGHT VIEWPORT: Selected Run JSON Inspector */}
          <div className={`flex-1 flex flex-col p-4 overflow-y-auto space-y-4 ${
            isDark ? 'bg-slate-900/40' : 'bg-slate-50/30'
          }`}>
            {activeLog ? (
              <>
                {/* Solver Status Card */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 shrink-0 ${
                  isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}>
                  <div className="flex items-center gap-3">
                    {!activeLog.error ? (
                      <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 border border-rose-500/20">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>Selected Run Pipeline Status</div>
                      <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {activeLog.solverUsed}
                      </div>
                    </div>
                  </div>

                  {activeLog.error && (
                    <div className="text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-500 px-3 py-1.5 rounded-lg max-w-md select-text leading-normal max-h-[80px] overflow-y-auto font-mono">
                      Error message: {activeLog.error}
                    </div>
                  )}
                </div>

                {/* Payload Tab Selector & Copy Button */}
                <div className={`flex items-center justify-between border-b pb-2 shrink-0 ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}>
                  <div className={`flex items-center gap-1.5 p-1 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    <button
                      onClick={() => setActiveTab('request')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        activeTab === 'request'
                          ? isDark ? 'bg-slate-800 text-sky-400' : 'bg-indigo-600 text-white shadow-xs'
                          : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Request Payload (to API)
                    </button>
                    <button
                      onClick={() => setActiveTab('response')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        activeTab === 'response'
                          ? isDark ? 'bg-slate-800 text-sky-400' : 'bg-indigo-600 text-white shadow-xs'
                          : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Response Payload (from API)
                    </button>
                  </div>

                  <button
                    onClick={() => copyToClipboard(getPayload())}
                    disabled={!getPayload()}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50 border ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied JSON!' : 'Copy to Clipboard'}</span>
                  </button>
                </div>

                {/* JSON Viewer viewport */}
                <div className={`flex-1 relative rounded-xl border p-4 overflow-hidden flex min-h-[250px] ${
                  isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-900'
                }`}>
                  {getPayload() ? (
                    <pre className="flex-1 overflow-auto text-[11px] font-mono text-emerald-400 select-text leading-relaxed p-1">
                      {JSON.stringify(getPayload(), null, 2)}
                    </pre>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5">
                      <span>No payload available for this tab.</span>
                      {activeTab === 'response' && activeLog.error && (
                        <span className="text-[10px] text-rose-400 text-center max-w-sm font-mono bg-rose-950/20 px-3 py-2 rounded-xl border border-rose-900/30">
                          {activeLog.error}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={`flex-1 flex flex-col items-center justify-center text-xs gap-1.5 ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <span>Select a solver run from the left panel to inspect payloads.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
