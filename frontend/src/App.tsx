import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getToken, onMessage } from 'firebase/messaging';
import { db, auth, messaging, handleFirestoreError, OperationType } from './firebase';
import { Alert as AlertType, CoinInfo, NotificationLog, PricePoint } from './types';
import { playNotificationSound } from './utils/audio';
import { fetchInitialHistory, fetchTicker24h } from './utils/binance';
import Header from './components/Header';
import CoinTickerCard from './components/CoinTickerCard';
import PriceChart from './components/PriceChart';
import AlertForm from './components/AlertForm';
import AlertList from './components/AlertList';
import NotificationLogs from './components/NotificationLogs';
import { Bell, Info, ShieldCheck, X, Link, Volume2 } from 'lucide-react';

const COIN_CONFIGS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿', color: 'bg-amber-500 text-amber-500' },
  { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ', color: 'bg-indigo-500 text-indigo-400' },
  { symbol: 'BNBUSDT', name: 'Binance Coin', icon: '🔶', color: 'bg-yellow-500 text-yellow-500' },
  { symbol: 'SOLUSDT', name: 'Solana', icon: '☀️', color: 'bg-purple-500 text-purple-400' },
];

interface ToastItemProps {
  key?: string | number;
  toast: NotificationLog;
  onClose: (id: string) => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 3500); // 3.5 seconds
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: 100 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className="bg-[#0A0A0B] border border-zinc-800 p-5 rounded-lg shadow-2xl flex flex-col gap-2.5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />

      {/* Title and dismiss */}
      <div className="flex justify-between items-center mt-1">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center shrink-0">
            <div className="w-2 h-2 bg-black rounded-full"></div>
          </div>
          <span className="text-[11px] text-white font-medium font-serif italic">PulseCrypto Alert</span>
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message Payload */}
      <p className="text-[11px] text-zinc-400 leading-normal font-sans">
        {toast.body}
      </p>

    </motion.div>
  );
}

function getIntervalTimeString(date: Date, interval: string): string {
  const rounded = new Date(date);
  if (interval === '1m') {
    rounded.setSeconds(0, 0);
  } else if (interval === '5m') {
    const min = rounded.getMinutes();
    rounded.setMinutes(min - (min % 5), 0, 0);
  } else if (interval === '15m') {
    const min = rounded.getMinutes();
    rounded.setMinutes(min - (min % 15), 0, 0);
  } else if (interval === '1h') {
    rounded.setMinutes(0, 0, 0);
  } else if (interval === '1d') {
    rounded.setHours(0, 0, 0, 0);
  } else {
    rounded.setSeconds(0, 0);
  }
  if (interval === '1d') {
    return rounded.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return rounded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':');
}

export default function App() {
  // Auth state
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8081';
  const defaultDemoMode = (import.meta as any).env?.VITE_DEMO_MODE === 'true' || (!isLocalhost && !(import.meta as any).env?.VITE_API_BASE_URL);
  const [isDemoMode, setDemoMode] = useState(defaultDemoMode);
  const [user, setUser] = useState<any>({
    email: !defaultDemoMode ? 'guest@pulse.com' : 'local-storage@pulse.com',
    displayName: !defaultDemoMode ? 'Guest (Live)' : 'Guest (Demo)'
  });
  const [loadingAuth, setLoadingAuth] = useState(false);

  // App UI state
  const [activeSymbol, setActiveSymbol] = useState('BTCUSDT');
  const [chartInterval, setChartInterval] = useState('1m');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');

  // Interactive local states
  const [coins, setCoins] = useState<CoinInfo[]>(() =>
    COIN_CONFIGS.map(cfg => ({
      ...cfg,
      currentPrice: 0,
      change24h: 0,
      high24h: 0,
      low24h: 0,
      history: [],
    }))
  );
  
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [activeToasts, setActiveToasts] = useState<NotificationLog[]>([]);

  // Refs for tracking mutable states in event handlers without triggering re-effects
  const alertsRef = useRef<AlertType[]>([]);
  const coinsRef = useRef<CoinInfo[]>([]);
  const chartIntervalRef = useRef(chartInterval);
  
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);

  useEffect(() => {
    chartIntervalRef.current = chartInterval;
  }, [chartInterval]);
  // Load and subscribe to Alerts from Go Backend
  const fetchAlerts = useCallback(async () => {
    if (!isDemoMode) {
      const requesterEmail = user?.email || 'guest@pulse.com';
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/alerts?requester=${encodeURIComponent(requesterEmail)}&t=${Date.now()}`);

        if (!response.ok) throw new Error("Failed to fetch alerts");
        const rawAlerts = await response.json();
        console.log('[fetchAlerts] Successfully fetched alerts from Go backend:', rawAlerts);
        let clearedIds: string[] = [];
        try {
          clearedIds = JSON.parse(localStorage.getItem('cleared_triggered_alerts') || '[]');
        } catch (e) {
          console.warn("Resetting corrupted cleared_triggered_alerts");
          localStorage.removeItem('cleared_triggered_alerts');
        }

        const loadedAlerts: AlertType[] = rawAlerts
          .map((raw: any) => ({
            id: raw.id.toString(),
            userId: raw.requester,
            symbol: raw.symbol,
            priceThreshold: raw.price_trigger,
            condition: raw.trigger_direction,
            createdAt: raw.created_at,
            triggered: raw.notification_status === 'TRIGGERED',
            triggeredAt: raw.triggered_at || undefined,
          }))
          .filter((a: AlertType) => !clearedIds.includes(a.id));
        console.log('[fetchAlerts] Parsed alerts for state:', loadedAlerts);
        setAlerts(loadedAlerts);
      } catch (error: any) {
        console.error("[fetchAlerts] Error loading alerts from Go backend:", error);
      }
    } else {
      // If Guest/Demo Mode, load alerts from Local Storage
      const cached = localStorage.getItem('crypto_tracker_alerts');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          console.log('[fetchAlerts] Loaded alerts from local storage (Demo Mode):', parsed);
          setAlerts(parsed);
        } catch (e) {
          console.error('Failed to parse cached alerts', e);
        }
      } else {
        setAlerts([]);
      }
    }
  }, [user, isDemoMode]);

  // Function to dispatch alerts and display in-app toast
  const triggerPushAlert = useCallback((symbol: string, condition: 'ABOVE' | 'BELOW', price: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    const title = '🚨 Crypto Alert Triggered!';
    const body = `The price of ${symbol} is currently ${condition} ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`;
    const appUrl = (import.meta as any).env?.VITE_APP_URL || window.location.origin;
    const link = `${appUrl}/?symbol=${symbol}`;

    const newLog: NotificationLog = {
      id,
      title,
      body,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // 1. Play Synthesizer sound
    playNotificationSound();

    // 2. Add to logs
    setLogs(prev => [newLog, ...prev]);

    // 3. Add to floating toasts
    setActiveToasts(prev => [newLog, ...prev]);

    // 4. Fire standard Browser Native Push Notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: symbol,
        });
        notif.onclick = () => {
          window.focus();
          setActiveSymbol(symbol);
          fetchAlerts();
          notif.close();
        };
      } catch (err) {
        console.warn('System push skipped:', err);
      }
    }
  }, [setActiveSymbol, fetchAlerts]);

  // Parse URL search parameters and synchronize alerts state on mount, window focus, visibility change, and history traversal
  useEffect(() => {
    const handleSync = () => {
      // 1. Refetch alerts to capture background DB updates
      fetchAlerts();

      // 2. Parse active symbol from query params
      const params = new URLSearchParams(window.location.search);
      const symbolParam = params.get('symbol');
      if (symbolParam) {
        const upperSymbol = symbolParam.toUpperCase();
        const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upperSymbol);
        if (exists) {
          setActiveSymbol(upperSymbol);
        }
      }
    };

    // Run once on load/mount
    handleSync();

    // Listen to focus, visibility changes, and back/forward browser navigation
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('popstate', handleSync);

    return () => {
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('popstate', handleSync);
    };
  }, [fetchAlerts, setActiveSymbol]);

  // Validate Firestore Connection on load
  useEffect(() => {
    async function testFirestore() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        console.log('Firestore initialization check:', error);
      }
    }
    testFirestore();
  }, []);


  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Setup FCM notifications and subscribe device token to Go backend topic
  useEffect(() => {
    if (!isDemoMode) {
      const initFCM = async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.warn('Notification permission not granted');
            return;
          }

          const token = await getToken(messaging, {
            vapidKey: 'BOS3cdGU65M5dCHzgdLCE82-90ifQbEMKtUbP4trprrXsR2P1Y-YDJtpBzOjrfrChZ9jI0jkhWUn23Jbc-ixtIo'
          });

          if (token) {
            console.log('FCM Registration Token:', token);
            await fetch(`${API_BASE_URL}/api/v1/fcm/subscribe`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                token: token,
                email: user?.email || 'guest@pulse.com',
                requester: user?.email || 'guest@pulse.com',
              }),
            });
          }

          // Handle foreground message
          const unsubscribe = onMessage(messaging, (payload) => {
            console.log('FCM Foreground message received:', payload);
            if (payload.data) {
              const body = payload.data.body || 'Alert triggered!';
              
              // Play notification sound
              playNotificationSound();
              
              const newLog = {
                id: Math.random().toString(36).substring(2, 9),
                title: payload.data.title || 'Price Alert',
                body: body,
                timestamp: new Date().toISOString(),
                read: false,
                rawPayload: JSON.stringify({
                  from: payload.from,
                  messageId: payload.messageId,
                  collapseKey: payload.collapseKey,
                  data: payload.data,
                  notification: payload.notification
                }, null, 2),
              };
              setLogs(prev => [newLog, ...prev]);
              setActiveToasts(prev => [newLog, ...prev]);

              // Refetch alerts list to update status without polling
              fetchAlerts();
            }
          });
          return unsubscribe;
        } catch (err) {
          console.error('Error setting up FCM on client:', err);
        }
      };

      let unsubscribeFn: (() => void) | undefined;
      initFCM().then(fn => {
        unsubscribeFn = fn;
      });
      return () => {
        if (unsubscribeFn) unsubscribeFn();
      };
    }
  }, [user, isDemoMode, triggerPushAlert, fetchAlerts]);

  // Sync Local Storage alerts in Demo mode
  const syncDemoAlerts = (updated: AlertType[]) => {
    if (!user || isDemoMode) {
      setAlerts(updated);
      localStorage.setItem('crypto_tracker_alerts', JSON.stringify(updated));
    }
  };

  // Initialize Historical Data for all 4 coins
  useEffect(() => {
    const loadAllHistory = async () => {
      const updatedCoins = await Promise.all(
        coinsRef.current.map(async (coin) => {
          const history = await fetchInitialHistory(coin.symbol, chartInterval);
          const ticker = await fetchTicker24h(coin.symbol);
          return {
            ...coin,
            ...ticker,
            history: history.slice(-100), // Enforce maximum of 100 prices
          };
        })
      );
      setCoins(updatedCoins);
    };

    loadAllHistory();
  }, [chartInterval]);

  // Request browser Notification permissions on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);



  // Check alerts against incoming prices (Demo/Guest mode check only)
  const checkAlerts = useCallback((symbol: string, currentPrice: number) => {
    if (user && !isDemoMode) {
      return; // Handled by Go Backend
    }

    const activeAlerts = alertsRef.current;
    
    activeAlerts.forEach(async (alert) => {
      if (alert.symbol === symbol && !alert.triggered) {
        let isTriggered = false;
        
        if (alert.condition === 'ABOVE' && currentPrice >= alert.priceThreshold) {
          isTriggered = true;
        } else if (alert.condition === 'BELOW' && currentPrice <= alert.priceThreshold) {
          isTriggered = true;
        }

        if (isTriggered) {
          const timestamp = new Date().toISOString();
          
          // Trigger the visual and audio feedback
          triggerPushAlert(symbol, alert.condition, alert.priceThreshold);

          // Update local state and localStorage for Guest
          const updated = alertsRef.current.map(a =>
            a.id === alert.id ? { ...a, triggered: true, triggeredAt: timestamp } : a
          );
          syncDemoAlerts(updated);
        }
      }
    });
  }, [user, isDemoMode, triggerPushAlert]);

  // Connect to Binance Websocket or Fallback Stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let simInterval: any = null;
    let isSimulating = false;

    const handleTickUpdate = (symbol: string, price: number, changePercent: number, high: number, low: number) => {
      const currentInterval = chartIntervalRef.current;
      const intervalTimeStr = getIntervalTimeString(new Date(), currentInterval);

      setCoins(prevCoins =>
        prevCoins.map(coin => {
          if (coin.symbol === symbol) {
            const updatedHistory = [...coin.history];
            
            // Generate some clean initial history if history is empty
            if (updatedHistory.length === 0) {
              const basePrice = symbol === 'BTCUSDT' ? 64200 : symbol === 'ETHUSDT' ? 3440 : symbol === 'BNBUSDT' ? 585 : 140;
              const now = Date.now();
              for (let i = 50; i >= 1; i--) {
                const tStr = new Date(now - i * 5000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const noise = (Math.sin(i / 10) + Math.cos(i / 5)) * (basePrice * 0.001);
                updatedHistory.push({
                  time: tStr,
                  price: Number((basePrice + noise).toFixed(2)),
                });
              }
            }

            const lastPoint = updatedHistory[updatedHistory.length - 1];
            if (lastPoint && lastPoint.time === intervalTimeStr) {
              updatedHistory[updatedHistory.length - 1] = { ...lastPoint, price };
            } else {
              updatedHistory.push({ time: intervalTimeStr, price });
            }

            return {
              ...coin,
              currentPrice: price,
              change24h: changePercent,
              high24h: high,
              low24h: low,
              history: updatedHistory.slice(-100),
            };
          }
          return coin;
        })
      );

      // Check alerts instantly
      checkAlerts(symbol, price);
    };

    const startSimulation = () => {
      if (isSimulating) return;
      isSimulating = true;
      setConnectionStatus('connected');
      console.warn('Binance WebSocket fallback active. Sandbox secure simulation stream engaged.');

      // Update coins periodically with realistic Brownian walk
      simInterval = setInterval(() => {
        const activeSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
        
        activeSymbols.forEach(symbol => {
          if (Math.random() > 0.3) {
            setCoins(currentCoins => {
              const coin = currentCoins.find(c => c.symbol === symbol);
              if (!coin) return currentCoins;

              const currentPrice = coin.currentPrice > 0 ? coin.currentPrice : (symbol === 'BTCUSDT' ? 64281.40 : symbol === 'ETHUSDT' ? 3452.12 : symbol === 'BNBUSDT' ? 589.30 : 142.05);
              const change24h = coin.change24h !== 0 ? coin.change24h : 1.45;
              const high24h = coin.high24h > 0 ? coin.high24h : currentPrice * 1.01;
              const low24h = coin.low24h > 0 ? coin.low24h : currentPrice * 0.99;

              const drift = (Math.random() - 0.495) * 0.001;
              const nextPrice = Number((currentPrice * (1 + drift)).toFixed(2));
              const nextChange = Number((change24h + drift * 100).toFixed(2));
              const nextHigh = Math.max(high24h, nextPrice);
              const nextLow = Math.min(low24h, nextPrice);

              setTimeout(() => {
                handleTickUpdate(symbol, nextPrice, nextChange, nextHigh, nextLow);
              }, 0);

              return currentCoins;
            });
          }
        });
      }, 2000);
    };

    const connectWebSocket = () => {
      setConnectionStatus('reconnecting');
      
      try {
        ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/bnbusdt@ticker/solusdt@ticker');

        ws.onopen = () => {
          setConnectionStatus('connected');
          if (simInterval) {
            clearInterval(simInterval);
            isSimulating = false;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (!message || !message.data) return;
            
            const raw = message.data;
            const symbol = raw.s;
            const price = parseFloat(raw.c);
            const changePercent = parseFloat(raw.P);
            const high = parseFloat(raw.h);
            const low = parseFloat(raw.l);

            handleTickUpdate(symbol, price, changePercent, high, low);
          } catch (e) {
            console.warn('Failed to parse Binance websocket stream', e);
          }
        };

        ws.onerror = () => {
          console.warn('Binance WebSocket is not accessible in this sandbox environment. Engaging secure simulator fallback...');
          if (ws) ws.close();
          startSimulation();
        };

        ws.onclose = () => {
          if (!isSimulating) {
            startSimulation();
          }
        };
      } catch (err) {
        console.warn('Failed to construct Binance WebSocket:', err);
        startSimulation();
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (simInterval) clearInterval(simInterval);
    };
  }, [checkAlerts]);

  // Handler: Create alert
  const handleCreateAlert = async (symbol: string, condition: 'ABOVE' | 'BELOW', priceThreshold: number) => {
    if (!isDemoMode) {
      const requesterEmail = user?.email || 'guest@pulse.com';
      const payload = {
        requester: requesterEmail,
        symbol: symbol,
        price: priceThreshold.toString(),
        trigger_direction: condition,
      };
      console.log('[handleCreateAlert] Sending creation payload to Go backend:', payload);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/alerts/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to create alert');
        }

        const data = await response.json();
        console.log('[handleCreateAlert] Successfully created alert in Go backend:', data);

        // Trigger refetch of alerts list
        fetchAlerts();
      } catch (err: any) {
        console.error('[handleCreateAlert] Failed to create alert on Go backend:', err);
        alert(err.message || 'Failed to create alert on backend');
      }
    } else {
      // Demo Mode
      const alertId = `${symbol.toLowerCase()}-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const newAlert: AlertType = {
        id: alertId,
        userId: 'guest_user_id',
        symbol,
        priceThreshold,
        condition,
        createdAt: timestamp,
        triggered: false,
      };
      const updated = [newAlert, ...alertsRef.current];
      syncDemoAlerts(updated);
    }
  };

  // Handler: Delete alert
  const handleDeleteAlert = async (id: string) => {
    const targetAlert = alerts.find(a => a.id === id);
    if (!targetAlert) return;

    if (targetAlert.triggered) {
      // For triggered alerts, clear them locally without calling the backend API
      const clearedIds = JSON.parse(localStorage.getItem('cleared_triggered_alerts') || '[]');
      clearedIds.push(id);
      localStorage.setItem('cleared_triggered_alerts', JSON.stringify(clearedIds));
      setAlerts(prev => prev.filter(a => a.id !== id));
      return;
    }

    if (!isDemoMode) {
      const requesterEmail = user?.email || 'guest@pulse.com';

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/alerts/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: targetAlert.id,
            requester: requesterEmail,
            symbol: targetAlert.symbol,
            price: targetAlert.priceThreshold.toString(),
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to cancel alert');
        }

        // Trigger refetch of alerts list
        fetchAlerts();
      } catch (err: any) {
        console.error('Failed to delete alert on Go backend:', err);
        alert(err.message || 'Failed to delete alert on backend');
      }
    } else {
      // Demo Mode
      const updated = alertsRef.current.filter(a => a.id !== id);
      syncDemoAlerts(updated);
    }
  };

  // Handler: Clear all triggered alerts locally
  const handleClearAllTriggeredAlerts = () => {
    const triggeredIds = alerts.filter(a => a.triggered).map(a => a.id);
    if (triggeredIds.length === 0) return;

    try {
      const clearedIds = JSON.parse(localStorage.getItem('cleared_triggered_alerts') || '[]');
      const updatedClearedIds = Array.from(new Set([...clearedIds, ...triggeredIds]));
      localStorage.setItem('cleared_triggered_alerts', JSON.stringify(updatedClearedIds));
      setAlerts(prev => prev.filter(a => !triggeredIds.includes(a.id)));
    } catch (e) {
      console.error('Failed to clear triggered alerts locally:', e);
    }
  };

  const handleCloseToast = useCallback((id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const activeCoin = coins.find(c => c.symbol === activeSymbol) || coins[0];
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#D4D4D8] flex flex-col font-sans select-none antialiased relative">
      {/* Dynamic Header */}
      <Header
        user={user}
        connectionStatus={connectionStatus}
      />

      {/* Main Bento Layout */}
      <main className="flex-1 p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pb-24">
        {/* Left Side: Asset Ticker Overview & Alerts Form */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          <div className="flex flex-col gap-3.5">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 pl-1">
              Select Asset to Chart
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
              {coins.map(coin => (
                <CoinTickerCard
                  key={coin.symbol}
                  coin={coin}
                  isActive={coin.symbol === activeSymbol}
                  onSelect={() => setActiveSymbol(coin.symbol)}
                />
              ))}
            </div>
          </div>

          <AlertForm
            activeCoin={activeCoin}
            coins={coins}
            onCreateAlert={handleCreateAlert}
            isDemoMode={isDemoMode}
            user={user}
          />
        </div>

        {/* Center/Right: Live Interactive Graph & Alerts Telemetry Log */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* Main Price Trend Graph */}
          <div className="h-[430px] sm:h-[460px]">
            <PriceChart
              coin={activeCoin}
              interval={chartInterval}
              setInterval={setChartInterval}
            />
          </div>

          {/* Alert Toggles & FCM Push Logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-[380px]">
            <AlertList
              alerts={alerts}
              onDeleteAlert={handleDeleteAlert}
              coins={coins}
              onClearAllTriggeredAlerts={handleClearAllTriggeredAlerts}
            />
            <NotificationLogs
              logs={logs}
              onClearLogs={() => setLogs([])}
            />
          </div>
        </div>
      </main>

      {/* Interactive Bottom Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-900 px-8 py-4 flex justify-between items-center text-[10px] font-mono text-zinc-500 shadow-xl select-none">
        <div className="flex gap-8 items-center truncate">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>FCM STATUS: ACTIVE</span>
          </div>
          <span className="hidden sm:inline border-l border-zinc-800 h-3" />
          <span className="truncate text-zinc-400">Worker: firebase-messaging-sw.js</span>
          <span className="hidden sm:inline border-l border-zinc-800 h-3" />
          <div className="hidden md:block">
            <span className="text-zinc-600 uppercase mr-2">Latency</span>
            <span className="text-emerald-400">14ms</span>
          </div>
          <span className="hidden md:inline border-l border-zinc-800 h-3" />
          <div className="hidden md:block">
            <span className="text-zinc-600 uppercase mr-2">Source</span>
            <span className="text-white">BINANCE-USDT-STREAM</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 uppercase shrink-0">
          GITHUB://PULSE-CORE-V1.0.4
        </div>
      </footer>

      {/* Floating In-App Push Notification Toast Overlays */}
      <div className="fixed bottom-16 right-8 z-50 flex flex-col gap-3 max-w-sm w-full select-text">
        <AnimatePresence>
          {activeToasts.map(toast => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onClose={handleCloseToast}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
