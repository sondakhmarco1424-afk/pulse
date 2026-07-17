import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface HeaderProps {
  user: any;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
}

export default function Header({
  user,
  connectionStatus,
}: HeaderProps) {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    connected: 'bg-emerald-500 text-emerald-400',
    reconnecting: 'bg-amber-500 text-amber-400',
    disconnected: 'bg-rose-500 text-rose-400',
  };

  return (
    <header className="border-b border-zinc-800 bg-[#0A0A0B] px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
      {/* Brand Logo & Connection Info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-100 rounded flex items-center justify-center shrink-0">
            <div className="w-4 h-4 bg-black rotate-45"></div>
          </div>
          <h1 className="text-xl font-serif italic tracking-tight text-white flex items-baseline gap-1.5">
            PulseCrypto <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-normal not-italic">DeltaStream</span>
          </h1>
        </div>

        <div className="px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            connectionStatus === 'connected' ? 'bg-emerald-500' :
            connectionStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-rose-500'
          } animate-pulse`} />
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            {connectionStatus === 'connected' ? 'Binance WS Live' : connectionStatus}
          </span>
        </div>
      </div>

      {/* UTC Clock & System Info */}
      <div className="hidden lg:flex items-center gap-5 border-l border-r border-zinc-800/60 px-6 py-1">
        <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px] tracking-wider">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          <span>{utcTime}</span>
        </div>
      </div>

      {/* User Session Section */}
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800 p-1.5 pl-3.5 pr-3.5 rounded-lg select-none">
            <div className="text-right">
              <div className="text-xs font-semibold text-zinc-200">{user.displayName || 'User'}</div>
              <div className="text-[10px] font-mono text-zinc-500">{user.email}</div>
            </div>
            <div className="w-7 h-7 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center font-bold text-xs uppercase select-none">
              {user.email ? user.email.slice(0, 2) : 'US'}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
