import React, { useEffect, useState, useRef } from 'react';
import { CoinInfo } from '../types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface CoinTickerCardProps {
  key?: string;
  coin: CoinInfo;
  isActive: boolean;
  onSelect: () => void;
}

export default function CoinTickerCard({ coin, isActive, onSelect }: CoinTickerCardProps) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number>(coin.currentPrice);

  useEffect(() => {
    if (coin.currentPrice > prevPriceRef.current) {
      setFlash('up');
      const timeout = setTimeout(() => setFlash(null), 800);
      prevPriceRef.current = coin.currentPrice;
      return () => clearTimeout(timeout);
    } else if (coin.currentPrice < prevPriceRef.current) {
      setFlash('down');
      const timeout = setTimeout(() => setFlash(null), 800);
      prevPriceRef.current = coin.currentPrice;
      return () => clearTimeout(timeout);
    }
    prevPriceRef.current = coin.currentPrice;
  }, [coin.currentPrice]);

  // Generate simple SVG path data for a beautiful custom inline Sparkline
  const generateSparklinePath = () => {
    if (!coin.history || coin.history.length < 2) return '';
    const prices = coin.history.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min === 0 ? 1 : max - min;
    
    const width = 120;
    const height = 36;
    const padding = 2;
    
    const points = coin.history.map((point, index) => {
      const x = (index / (coin.history.length - 1)) * (width - padding * 2) + padding;
      const y = height - ((point.price - min) / range) * (height - padding * 2) - padding;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    
    return `M ${points.join(' L ')}`;
  };

  const isPositive = coin.change24h >= 0;

  // Render glowing border classes based on flash & selection
  const getBorderClass = () => {
    if (flash === 'up') return 'border-emerald-500 bg-zinc-900/90 shadow-[0_0_12px_rgba(16,185,129,0.1)]';
    if (flash === 'down') return 'border-rose-500 bg-zinc-900/90 shadow-[0_0_12px_rgba(244,63,94,0.1)]';
    if (isActive) return 'border-zinc-700 border-l-2 border-l-emerald-500 bg-zinc-900 shadow-md';
    return 'border-zinc-800/80 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/30 opacity-70 hover:opacity-100';
  };

  return (
    <div
      onClick={onSelect}
      className={`relative p-5 rounded-lg border cursor-pointer transition-all duration-300 flex flex-col gap-2.5 select-none ${getBorderClass()}`}
    >
      {/* Top row: Symbol and Percentage change */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-white tracking-tight">{coin.symbol.replace('USDT', '')}/USDT</span>
          <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">{coin.name}</span>
        </div>
        <span className={`text-[10px] font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
        </span>
      </div>

      {/* Middle row: Price and Sparkline */}
      <div className="flex items-center justify-between mt-1">
        {/* Price */}
        <div className={`text-2xl font-serif tracking-tight transition-colors duration-200 ${
          flash === 'up' ? 'text-emerald-400 scale-[1.01] origin-left font-medium' :
          flash === 'down' ? 'text-rose-400 scale-[1.01] origin-left font-medium' : 'text-white'
        }`}>
          ${coin.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </div>

        {/* Custom Mini-Sparkline */}
        <div className="relative h-6 w-20 flex items-center justify-center opacity-65">
          {coin.history.length >= 2 ? (
            <svg className="w-full h-full" viewBox="0 0 120 36">
              <path
                d={generateSparklinePath()}
                fill="none"
                stroke={isPositive ? '#10B981' : '#F43F5E'}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div className="text-[8px] font-mono text-zinc-600">...</div>
          )}
        </div>
      </div>
    </div>
  );
}
