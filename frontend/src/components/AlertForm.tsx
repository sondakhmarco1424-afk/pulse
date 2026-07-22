import React, { useState, useEffect } from 'react';
import { CoinInfo } from '../types';
import { Bell, HelpCircle, ArrowUp, ArrowDown } from 'lucide-react';

interface AlertFormProps {
  activeCoin: CoinInfo;
  coins: CoinInfo[];
  onCreateAlert: (symbol: string, condition: 'ABOVE' | 'BELOW', price: number) => void;
  isDemoMode: boolean;
  user: any;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onRetryConnection?: () => void;
}

export default function AlertForm({
  activeCoin,
  coins,
  onCreateAlert,
  isDemoMode,
  user,
  connectionStatus = 'connected',
  onRetryConnection,
}: AlertFormProps) {
  const [symbol, setSymbol] = useState<string>(activeCoin.symbol);
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [priceInput, setPriceInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Synchronize symbol state when activeCoin changes from parent select
  useEffect(() => {
    setSymbol(activeCoin.symbol);
  }, [activeCoin]);

  const selectedCoinInfo = coins.find(c => c.symbol === symbol) || activeCoin;
  const isNotConnected = connectionStatus !== 'connected';

  const handlePercentageChange = (percent: number) => {
    const calculated = selectedCoinInfo.currentPrice * (1 + percent / 100);
    setPriceInput(calculated.toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isNotConnected) {
      setError('Cannot connect to Binance. Please make sure you are using a VPN if Binance is restricted in your location.');
      return;
    }

    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid numeric price threshold greater than zero.');
      return;
    }

    onCreateAlert(symbol, condition, price);
  };

  const hasAccess = isDemoMode || (user && user.email);
  const noEmailButUser = user && !user.email;

  return (
    <div className="bg-[#0A0A0B] border border-zinc-800 rounded-lg p-6 select-none shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <Bell className="w-4 h-4 text-zinc-300" />
        </div>
        <div>
          <h2 className="text-md font-serif italic text-white tracking-tight">Create Price Alert</h2>
          <p className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">TRIGGER INSTANT FCM BROADCASTS</p>
        </div>
      </div>

      {isNotConnected && (
        <div className={`mb-4 rounded p-3 text-center flex flex-col items-center gap-2 border ${
          connectionStatus === 'reconnecting'
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <div>
            <p className={`text-[11px] font-mono font-medium leading-relaxed ${
              connectionStatus === 'reconnecting' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {connectionStatus === 'reconnecting' ? '⏳ CONNECTING TO BINANCE...' : '⚠️ NOT CONNECTED TO BINANCE'}
            </p>
            <p className={`text-[10px] font-sans mt-0.5 ${
              connectionStatus === 'reconnecting' ? 'text-amber-300/80' : 'text-rose-300/80'
            }`}>
              Notifications and alert creation are disabled until connection is restored. Please make sure you are using a VPN if Binance is restricted in your region.
            </p>
          </div>
          {onRetryConnection && (
            <button
              onClick={onRetryConnection}
              type="button"
              className={`px-3 py-1 border text-[10px] font-mono rounded cursor-pointer transition-colors ${
                connectionStatus === 'reconnecting'
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                  : 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300'
              }`}
            >
              🔄 RETRY CONNECTION NOW
            </button>
          )}
        </div>
      )}

      {!hasAccess ? (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded p-5 text-center my-2">
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            {noEmailButUser ? (
              "Your account does not have a registered email address. An email is required to create alerts."
            ) : (
              <>
                Please sign in with Google or toggle <span className="text-white underline font-semibold">Demo Mode</span> in the top-right to create custom alerts.
              </>
            )}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Target Coin Selector */}
          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider block mb-1.5">
              Select Symbol
            </label>
            <select
              value={symbol}
              onChange={e => {
                setSymbol(e.target.value);
              }}
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs rounded p-2.5 font-mono focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              {coins.map(c => (
                <option key={c.symbol} value={c.symbol} className="bg-zinc-900">
                  {c.symbol}/USDT — Spot: ${c.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>

          {/* Trigger Condition Selector */}
          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider block mb-1.5">
              Logic Mode
            </label>
            <div className="grid grid-cols-2 gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded">
              <button
                type="button"
                onClick={() => setCondition('ABOVE')}
                className={`flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono cursor-pointer transition-all rounded ${
                  condition === 'ABOVE'
                    ? 'bg-zinc-900 border border-emerald-500 text-emerald-500'
                    : 'text-zinc-500 hover:text-white border border-transparent'
                }`}
              >
                <ArrowUp className="w-3 h-3" />
                ABOVE
              </button>
              <button
                type="button"
                onClick={() => setCondition('BELOW')}
                className={`flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono cursor-pointer transition-all rounded ${
                  condition === 'BELOW'
                    ? 'bg-zinc-900 border border-rose-500 text-rose-500'
                    : 'text-zinc-500 hover:text-white border border-transparent'
                }`}
              >
                <ArrowDown className="w-3 h-3" />
                BELOW
              </button>
            </div>
          </div>

          {/* Threshold Price Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider block">
                Threshold Price
              </label>
              <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
                SPOT: ${selectedCoinInfo.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 font-mono text-xs">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="-"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-white font-mono text-xs rounded pl-7 pr-3 py-2.5 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {/* Quick Percentages */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: '-2%', val: -2 },
              { label: '-1%', val: -1 },
              { label: '+1%', val: 1 },
              { label: '+2%', val: 2 },
            ].map(pct => (
              <button
                key={pct.label}
                type="button"
                onClick={() => handlePercentageChange(pct.val)}
                className="bg-zinc-900/60 hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors"
              >
                {pct.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[11px] font-semibold text-rose-400 bg-rose-500/5 border border-rose-500/20 p-2 rounded leading-relaxed">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isNotConnected}
            className={`w-full py-3 font-serif italic text-sm mt-2 transition-all rounded ${
              isNotConnected
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                : 'bg-white text-black hover:bg-zinc-200 cursor-pointer'
            }`}
          >
            {isNotConnected ? 'Binance Connection Unavailable' : 'Deploy Price Alert'}
          </button>

          {/* Info Badge */}
          <div className="flex gap-2 bg-zinc-900/40 p-3 border border-zinc-900 rounded">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
              Crossing this threshold triggers immediate client-side notifications and updates the background telemetry log.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
