import React, { useState } from 'react';
import { NotificationLog } from '../types';
import { Send, Terminal, Link, BellRing, Copy, Check } from 'lucide-react';

interface NotificationLogsProps {
  logs: NotificationLog[];
  onClearLogs: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

export default function NotificationLogs({
  logs,
  onClearLogs,
  onSelectSymbol,
}: NotificationLogsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, logId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(logId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to generate the exact Firebase Cloud Messaging JSON payload structure
  const getFCMPayloadString = (log: NotificationLog) => {
    const symbolMatch = log.body.match(/([A-Z0-9]{3,10}USDT)/i);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'BTCUSDT';

    const payload = {
      to: "fcm_client_registration_token_sandbox",
      collapse_key: "price_alert",
      priority: "high",
      notification: {
        title: log.title,
        body: log.body,
        icon: "/favicon.ico",
        sound: "default",
        click_action: log.link
      },
      data: {
        symbol: symbol,
        triggeredAt: log.timestamp,
        click_action: log.link
      }
    };
    return JSON.stringify(payload, null, 2);
  };

  return (
    <div className="bg-[#0A0A0B] border border-zinc-800 rounded-lg p-6 select-none shadow-lg flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <h2 className="text-md font-serif italic text-white tracking-tight">FCM Payload Log</h2>
            <p className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">PUSH TELEMETRY & SANDBOX</p>
          </div>
        </div>
        {logs.length > 0 && (
          <button
            onClick={onClearLogs}
            className="text-[10px] font-mono tracking-wider text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
          >
            CLEAR LOGS
          </button>
        )}
      </div>

      {/* Logs View */}
      {logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded min-h-[160px]">
          <Terminal className="w-5 h-5 text-zinc-700 mb-2" />
          <p className="text-[10px] font-mono text-zinc-500 max-w-xs leading-relaxed">
            Ready... Awaiting price movements to print JSON payloads.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[440px] pr-1">
          {logs.map(log => {
            const payloadStr = log.rawPayload || getFCMPayloadString(log);
            const symbolMatch = log.body.match(/([A-Z0-9]{3,10}USDT)/i);
            const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'BTCUSDT';

            return (
              <div
                key={log.id}
                className="bg-zinc-950 border border-zinc-800/80 rounded overflow-hidden shadow-inner flex flex-col group hover:border-zinc-700 transition-colors"
              >
                {/* Log bar */}
                <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-zinc-400">
                      fcm_broadcast_received
                    </span>
                    {onSelectSymbol && (
                      <button
                        onClick={() => onSelectSymbol(symbol)}
                        className="text-[9px] font-mono text-emerald-400 hover:underline ml-2 cursor-pointer"
                      >
                        View {symbol} Chart →
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(payloadStr, log.id)}
                      className="p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Copy Payload"
                    >
                      {copiedId === log.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span className="text-[9px] font-mono text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Log Payload */}
                <div className="p-3.5 bg-zinc-950 text-[11px] font-mono text-zinc-400 leading-normal overflow-auto select-text selection:bg-zinc-500/20">
                  <pre>{payloadStr}</pre>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
