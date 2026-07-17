import React from 'react';
import { Alert, CoinInfo } from '../types';
import { Bell, Trash2, ArrowUp, ArrowDown, CheckCircle2, RefreshCw } from 'lucide-react';

interface AlertListProps {
  alerts: Alert[];
  onDeleteAlert: (id: string) => void;
  coins: CoinInfo[];
  onClearAllTriggeredAlerts?: () => void;
}

export default function AlertList({ alerts, onDeleteAlert, coins, onClearAllTriggeredAlerts }: AlertListProps) {
  const getCoinMeta = (symbol: string) => {
    const coin = coins.find(c => c.symbol === symbol);
    return {
      icon: coin?.icon || '🪙',
      color: coin?.color || 'bg-slate-500',
    };
  };

  const activeAlerts = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);

  return (
    <div className="bg-[#0A0A0B] border border-zinc-800 rounded-lg p-6 select-none shadow-lg flex flex-col gap-6 h-full">
      {/* List Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <h2 className="text-md font-serif italic text-white tracking-tight">Active Thresholds</h2>
            <p className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">REAL-TIME TELEMETRY GATES</p>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded">
          {alerts.length} total
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-zinc-900/10 border border-dashed border-zinc-800 rounded my-4 min-h-[140px]">
          <Bell className="w-6 h-6 text-zinc-600 mb-2.5" />
          <p className="text-xs text-zinc-500 max-w-xs leading-relaxed font-sans">
            No price thresholds set. Configure an asset and target limit on the left to activate active triggers.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[380px] flex flex-col gap-4 pr-1">
          {/* Active Alerts Section */}
          {activeAlerts.length > 0 && (
            <div>
              <h3 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2.5">
                Active Gates ({activeAlerts.length})
              </h3>
              <div className="flex flex-col gap-2">
                {activeAlerts.map(alert => {
                  const meta = getCoinMeta(alert.symbol);
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700 p-3.5 rounded transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-white tracking-tight">{alert.symbol}</span>
                            <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded ${
                              alert.condition === 'ABOVE'
                                ? 'bg-zinc-900 border border-emerald-500/20 text-emerald-400'
                                : 'bg-zinc-900 border border-rose-500/20 text-rose-400'
                            }`}>
                              {alert.condition === 'ABOVE' ? 'Above' : 'Below'}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-zinc-400 mt-1">
                            Limit: <span className="font-bold text-white">${alert.priceThreshold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteAlert(alert.id)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 rounded transition-all cursor-pointer"
                        title="Delete Alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Triggered Alerts Section */}
          {triggeredAlerts.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2.5">
                <h3 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                  Triggered Logs ({triggeredAlerts.length})
                </h3>
                {onClearAllTriggeredAlerts && (
                  <button
                    onClick={onClearAllTriggeredAlerts}
                    className="text-[9px] font-mono uppercase text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {triggeredAlerts.map(alert => {
                  const meta = getCoinMeta(alert.symbol);
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between bg-zinc-950 border border-zinc-900 p-3.5 rounded opacity-65 hover:opacity-90 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-zinc-300">{alert.symbol}</span>
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-500">
                              Triggered
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-zinc-500 mt-1 leading-normal">
                            Crossed <span className="font-semibold text-zinc-300">${alert.priceThreshold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <br />
                            <span className="text-[9px] text-zinc-600 flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Fired at {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleTimeString() : 'N/A'}
                            </span>
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteAlert(alert.id)}
                        className="p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-zinc-900 rounded transition-all cursor-pointer"
                        title="Clear Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
