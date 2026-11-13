import React, { useState, useEffect } from 'react';
import { Fuel, Settings, RotateCcw, X, Clock, Info, Building2, Trash2, AlertTriangle, UserCheck } from 'lucide-react';
import { FuelSettings } from '../types';

export const DEFAULT_FUEL_SETTINGS: FuelSettings = {
  fuelPricePerLitre: 30,
  fuelConsumptionLPer100Km: 10,
  businessName: 'Hamba Routes'
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fuelSettings: FuelSettings;
  onSaveFuelSettings: (settings: FuelSettings) => void;
  maxShiftHours?: number;
  isDark?: boolean;
  isSignedIn?: boolean;
  userEmail?: string | null;
  onDeleteAllDataRequest?: () => void;
  isDeletingAllData?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  fuelSettings,
  onSaveFuelSettings,
  maxShiftHours = 9,
  isDark = true,
  isSignedIn = false,
  userEmail = null,
  onDeleteAllDataRequest,
  isDeletingAllData = false
}) => {
  const [pricePerLitre, setPricePerLitre] = useState<string>(String(fuelSettings.fuelPricePerLitre));
  const [consumptionL100, setConsumptionL100] = useState<string>(String(fuelSettings.fuelConsumptionLPer100Km));
  const [businessName, setBusinessName] = useState<string>(fuelSettings.businessName || DEFAULT_FUEL_SETTINGS.businessName || 'Hamba Routes');

  useEffect(() => {
    if (isOpen) {
      setPricePerLitre(String(fuelSettings.fuelPricePerLitre));
      setConsumptionL100(String(fuelSettings.fuelConsumptionLPer100Km));
      setBusinessName(fuelSettings.businessName || DEFAULT_FUEL_SETTINGS.businessName || 'Hamba Routes');
    }
  }, [isOpen, fuelSettings.fuelPricePerLitre, fuelSettings.fuelConsumptionLPer100Km, fuelSettings.businessName]);

  if (!isOpen) return null;

  const parsedPrice = Math.max(1, Number(pricePerLitre) || DEFAULT_FUEL_SETTINGS.fuelPricePerLitre);
  const parsedConsumption = Math.max(1, Number(consumptionL100) || DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km);
  const cleanedBusinessName = businessName.trim() || 'Hamba Routes';
  const randPerKm = (parsedConsumption / 100) * parsedPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveFuelSettings({
      fuelPricePerLitre: Number(parsedPrice.toFixed(2)),
      fuelConsumptionLPer100Km: Number(parsedConsumption.toFixed(1)),
      businessName: cleanedBusinessName
    });
    onClose();
  };

  const handleReset = () => {
    setPricePerLitre(String(DEFAULT_FUEL_SETTINGS.fuelPricePerLitre));
    setConsumptionL100(String(DEFAULT_FUEL_SETTINGS.fuelConsumptionLPer100Km));
    setBusinessName(DEFAULT_FUEL_SETTINGS.businessName || 'Hamba Routes');
    onSaveFuelSettings(DEFAULT_FUEL_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-md border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Business, Fleet &amp; Fuel Settings</h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                South African fuel cost assumptions (ZAR) &amp; WhatsApp sender name
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className={`p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="space-y-3.5">
            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Building2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Business Name (WhatsApp &amp; Print Header)</span>
              </label>
              <input
                id="settings-business-name-input"
                type="text"
                maxLength={60}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Hamba Routes"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-amber-500 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
              <p className={`text-[10.5px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Used in WhatsApp customer reminders: &ldquo;Hi [first name], {cleanedBusinessName} will be with you around [time]...&rdquo;
              </p>
            </div>

            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Fuel className="w-3.5 h-3.5 text-amber-400" />
                <span>Fuel Price (R per litre)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">R</span>
                <input
                  id="settings-fuel-price-input"
                  type="number"
                  min={5}
                  max={100}
                  step="0.5"
                  required
                  value={pricePerLitre}
                  onChange={(e) => setPricePerLitre(e.target.value)}
                  className={`w-full rounded-xl border pl-8 pr-16 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">/ litre</span>
              </div>
              <p className={`text-[10.5px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Default: R30 per litre (Gauteng unleaded / diesel fleet average).
              </p>
            </div>

            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Fuel className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vehicle Fuel Consumption (L per 100 km)</span>
              </label>
              <div className="relative">
                <input
                  id="settings-fuel-consumption-input"
                  type="number"
                  min={2}
                  max={40}
                  step="0.5"
                  required
                  value={consumptionL100}
                  onChange={(e) => setConsumptionL100(e.target.value)}
                  className={`w-full rounded-xl border pl-3.5 pr-24 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-amber-500 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">L / 100 km</span>
              </div>
              <p className={`text-[10.5px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Default: 10 L per 100 km (laden service bakkie / panel van).
              </p>
            </div>
          </div>

          {/* Live Calculated Cost Rate Card */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2 ${
              isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                Effective Fuel Rate
              </span>
              <span className={`text-base font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                R{randPerKm.toFixed(2)} / km
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Example: A weekly customer adding <span className="font-mono font-bold">+2.1 km</span> adds{' '}
              <span className="font-mono font-bold">
                R{(2.1 * randPerKm * 4).toFixed(2)}/mo
              </span>{' '}
              (4 visits) in extra fuel.
            </p>
          </div>

          {/* Shift Window Info */}
          <div
            className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs ${
              isDark ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Working Shift Window: Mon–Fri 07:00–16:00 SAST</div>
              <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Info className="w-3 h-3 shrink-0" />
                <span>{maxShiftHours}h daily shift budget (Africa/Johannesburg) used for Weekday Zones &amp; placement checks.</span>
              </div>
            </div>
          </div>

          {isSignedIn && onDeleteAllDataRequest && (
            <div
              className={`p-3.5 rounded-2xl border space-y-2.5 ${
                isDark ? 'bg-rose-950/25 border-rose-500/30' : 'bg-rose-50 border-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Account Data &amp; Privacy</span>
                </div>
                {userEmail && (
                  <span className={`text-[10.5px] font-mono truncate max-w-[190px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    {userEmail}
                  </span>
                )}
              </div>
              <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Permanently erase all customer visits, route zones, and business settings stored in Firestore for this account.
              </p>
              <button
                type="button"
                id="settings-delete-all-data-btn"
                disabled={isDeletingAllData}
                onClick={() => {
                  onClose();
                  onDeleteAllDataRequest();
                }}
                className="w-full px-3.5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl border border-rose-500/40 bg-rose-600/20 hover:bg-rose-600 hover:text-white text-rose-300 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingAllData ? 'Deleting Data...' : 'Delete all my data'}</span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className={`px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isDark
                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-bold cursor-pointer ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 cursor-pointer transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
