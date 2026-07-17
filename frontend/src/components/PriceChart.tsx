import React, { useMemo } from 'react';
import { CoinInfo } from '../types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, TrendingUp, HelpCircle, Activity } from 'lucide-react';

interface PriceChartProps {
  coin: CoinInfo;
  interval: string;
  setInterval: (val: string) => void;
}

export default function PriceChart({ coin, interval, setInterval }: PriceChartProps) {
  const isPositive = coin.change24h >= 0;

  // Compute domain bounds for Y-Axis to keep the price line centered and beautiful
  const yDomain = useMemo(() => {
    if (!coin.history || coin.history.length === 0) return [0, 100];
    const prices = coin.history.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.05 || max * 0.005; // 5% padding or default
    return [Math.max(0, min - pad), max + pad];
  }, [coin.history]);

  const intervals = [
    { value: '1m', label: '1M' },
    { value: '5m', label: '5M' },
    { value: '15m', label: '15M' },
    { value: '1h', label: '1H' },
    { value: '1d', label: '1D' },
  ];

  const currentPriceFormatted = coin.currentPrice.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return (
    <div className="bg-[#0A0A0B] border border-zinc-800 rounded-lg p-6 flex flex-col gap-6 select-none h-full shadow-lg">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-serif italic text-white tracking-tight flex items-baseline gap-2">
              {coin.name} Index
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-normal not-italic">
                {coin.symbol} / USDT
              </span>
            </h2>
          </div>
          <div className="flex items-baseline gap-2.5 mt-1">
            <span className="text-3xl font-serif text-white tracking-tight">
              ${currentPriceFormatted}
            </span>
            <span className={`text-xs font-mono flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%</span>
            </span>
          </div>
        </div>

        {/* Interval Toggles */}
        <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded self-end sm:self-auto shadow-inner">
          {intervals.map(opt => (
            <button
              key={opt.value}
              onClick={() => setInterval(opt.value)}
              className={`px-3 py-1.5 rounded text-[10px] font-mono tracking-wider transition-all uppercase cursor-pointer ${
                interval === opt.value
                  ? 'bg-white text-black font-semibold'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-900/30 p-5 border border-zinc-900/60 rounded-lg">
        <div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">24h High</div>
          <div className="text-xs font-mono text-zinc-200 mt-1">
            ${coin.high24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">24h Low</div>
          <div className="text-xs font-mono text-zinc-200 mt-1">
            ${coin.low24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">Feed Buffer</div>
          <div className="text-xs font-mono text-emerald-400 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{coin.history.length} / 100 Ticks</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">Data Source</div>
          <div className="text-xs font-mono text-zinc-400 mt-1">
            WS-FEED-LIVE
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full h-[280px] sm:h-[320px] select-none" id="price-chart-container">
        {coin.history.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={coin.history} margin={{ top: 10, right: 5, left: 15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#10B981' : '#F43F5E'} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={isPositive ? '#10B981' : '#F43F5E'} stopOpacity={0.00}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" opacity={0.3} />
              <XAxis
                dataKey="time"
                stroke="#71717a"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                domain={yDomain}
                stroke="#71717a"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                tickFormatter={val => `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-zinc-800 p-3 rounded shadow-xl">
                        <p className="text-[9px] font-mono text-zinc-500">{point.time}</p>
                        <p className="text-xs font-mono font-bold text-white mt-0.5">
                          ${point.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#10B981' : '#F43F5E'}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
              {/* Reference line showing current price */}
              <ReferenceLine
                y={coin.currentPrice}
                stroke={isPositive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}
                strokeDasharray="2 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-zinc-500">Synchronizing historical feed...</span>
          </div>
        )}
      </div>
    </div>
  );
}
