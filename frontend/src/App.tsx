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
import { db, auth, messaging, firebaseConfig, handleFirestoreError, OperationType } from './firebase';
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
  onSelectSymbol: (symbol: string) => void;
}

function ToastItem({ toast, onClose, onSelectSymbol }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 3500); // 3.5 seconds
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const symbolMatch = toast.body.match(/([A-Z0-9]{3,10}USDT)/i);
  const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'BTCUSDT';

  const handleClick = () => {
    onSelectSymbol(symbol);
    onClose(toast.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: 100 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      onClick={handleClick}
      className="bg-[#0A0A0B] border border-zinc-800 p-5 rounded-lg shadow-2xl flex flex-col gap-2.5 relative overflow-hidden cursor-pointer hover:border-zinc-700 transition-all group"
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
          onClick={(e) => {
            e.stopPropagation();
            onClose(toast.id);
          }}
          className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message Payload */}
      <p className="text-[11px] text-zinc-400 leading-normal font-sans group-hover:text-zinc-200 transition-colors">
        {toast.body}
      </p>
      <span className="text-[9px] font-mono text-emerald-400 tracking-wider flex items-center gap-1 mt-0.5">
        Click to view {symbol} chart →
      </span>

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
  const configuredApiUrl = String((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const API_BASE_URL = configuredApiUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const BINANCE_WS_URL = String((import.meta as any).env?.VITE_BINANCE_WS_URL || '').trim();
  const defaultDemoMode = (import.meta as any).env?.VITE_DEMO_MODE === 'true';
  const [isDemoMode, setDemoMode] = useState(defaultDemoMode);
  const getOrCreateGuestEmail = (): string => {
    if (typeof window === 'undefined') return 'guest@pulse.com';
    let guestId = localStorage.getItem('pulse_guest_session_id');
    if (!guestId) {
      guestId = `guest_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}@pulse.com`;
      localStorage.setItem('pulse_guest_session_id', guestId);
    }
    return guestId;
  };

  const [user, setUser] = useState<any>(() => ({
    email: !defaultDemoMode ? getOrCreateGuestEmail() : 'local-storage@pulse.com',
    displayName: !defaultDemoMode ? 'Guest (Live)' : 'Guest (Demo)'
  }));
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
  const [logs, setLogs] = useState<NotificationLog[]>(() => {
    try {
      const cached = localStorage.getItem('pulse_notification_logs');
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [activeToasts, setActiveToasts] = useState<NotificationLog[]>([]);
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  const initialNotificationPermission: NotificationPermission | 'unsupported' = notificationsSupported
    ? Notification.permission
    : 'unsupported';
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(initialNotificationPermission);
  const [notificationPermissionError, setNotificationPermissionError] = useState<string | null>(null);
  const [showNotifPermissionModal, setShowNotifPermissionModal] = useState(
    initialNotificationPermission !== 'granted' && initialNotificationPermission !== 'unsupported'
  );

  useEffect(() => {
    if (!notificationsSupported) return;

    const syncNotificationPermission = () => {
      const permission = Notification.permission;
      setNotificationPermission(permission);
      if (permission === 'granted') {
        setNotificationPermissionError(null);
        setShowNotifPermissionModal(false);
      } else if (permission === 'default') {
        setNotificationPermissionError(null);
        setShowNotifPermissionModal(true);
      }
    };

    window.addEventListener('focus', syncNotificationPermission);
    return () => window.removeEventListener('focus', syncNotificationPermission);
  }, [notificationsSupported]);

  const handleEnableNotifications = async () => {
    if (!notificationsSupported) {
      setNotificationPermissionError('This browser does not support notifications.');
      return;
    }

    try {
      setNotificationPermissionError(null);
      if (Notification.permission === 'denied') {
        setNotificationPermission('denied');
        setNotificationPermissionError('Notifications are blocked for localhost. Reset the permission from the browser address-bar site settings, then return to this page.');
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        setShowNotifPermissionModal(false);
      } else if (permission === 'denied') {
        setNotificationPermissionError('Notifications were blocked. Reset the permission from the browser address-bar site settings before trying again.');
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setNotificationPermissionError('The browser could not open the notification permission prompt. Check the site permission settings for localhost.');
    }
  };

  // Sync logs state to localStorage
  useEffect(() => {
    try {
      if (Array.isArray(logs)) {
        localStorage.setItem('pulse_notification_logs', JSON.stringify(logs.slice(0, 50)));
      }
    } catch (e) {
      console.error('Failed to save logs to localStorage:', e);
    }
  }, [logs]);

  // Refs for tracking mutable states in event handlers without triggering re-effects
  const alertsRef = useRef<AlertType[]>([]);
  const coinsRef = useRef<CoinInfo[]>([]);
  const chartIntervalRef = useRef(chartInterval);
  const checkAlertsRef = useRef<any>(null);
  const recentMessageHashesRef = useRef<Map<string, number>>(new Map());
  
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
          const parsed = JSON.parse(localStorage.getItem('cleared_triggered_alerts') || '[]');
          clearedIds = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn("Resetting corrupted cleared_triggered_alerts");
          localStorage.removeItem('cleared_triggered_alerts');
        }

        if (!Array.isArray(rawAlerts)) {
          console.warn("Expected array of alerts from Go backend but received:", rawAlerts);
          return;
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
          setAlerts(Array.isArray(parsed) ? parsed : []);
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
    const rawAppUrl = (import.meta as any).env?.VITE_APP_URL || window.location.origin;
    const appUrl = rawAppUrl.includes('localhost:3000') ? window.location.origin : rawAppUrl;
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

    // 4. Fire standard Browser Native Push Notification in Demo/Guest mode only (FCM handles live mode)
    if ((isDemoMode || !user) && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: symbol,
        });
        notif.onclick = () => {
          window.focus();
          setActiveSymbol(symbol);
          try {
            window.history.pushState({}, '', `/?symbol=${symbol}`);
          } catch (e) {}
          fetchAlerts();
          notif.close();
        };
      } catch (err) {
        console.warn('System push skipped:', err);
      }
    }
  }, [setActiveSymbol, fetchAlerts, isDemoMode, user]);

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
    if (!isDemoMode && messaging && notificationsSupported && notificationPermission === 'granted') {
      let swRegistration: ServiceWorkerRegistration | undefined;
      let unsubscribeFn: (() => void) | undefined;

      // Helper to process payload into UI state
      const processFCMPayload = (payload: any) => {
        const dataObj = payload.data || payload.FCM_MSG?.data || payload;
        const notifObj = payload.notification || payload.FCM_MSG?.notification || {};

        const rawTitle = notifObj.title || dataObj.title || 'Price Alert';
        const rawBody = notifObj.body || dataObj.body || 'Alert triggered!';

        // Extract symbol via explicit property or regex search
        let symbol = dataObj.symbol || payload.symbol;
        if (!symbol) {
          const match = (rawBody + ' ' + rawTitle).match(/([A-Z0-9]{3,10}USDT)/i);
          if (match) {
            symbol = match[1].toUpperCase();
          }
        }
        const upperSymbol = symbol ? symbol.toUpperCase() : '';

        // Standardize title and body
        const title = rawTitle !== 'Price Alert' ? rawTitle : '🚨 Crypto Alert Triggered!';
        const body = (rawBody && rawBody !== 'Alert triggered!' && rawBody !== 'Alert condition met!')
          ? rawBody
          : (upperSymbol ? `The currency ${upperSymbol} crossed threshold.` : rawBody);

        const msgKey = payload.messageId || payload.fcmMessageId || `${upperSymbol}_${body}`;

        const now = Date.now();
        recentMessageHashesRef.current.forEach((ts, key) => {
          if (now - ts > 10000) recentMessageHashesRef.current.delete(key);
        });

        if (recentMessageHashesRef.current.has(msgKey)) {
          console.log('[processFCMPayload] Duplicate payload skipped:', msgKey);
          return;
        }
        recentMessageHashesRef.current.set(msgKey, now);

        playNotificationSound();

        if (upperSymbol) {
          const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upperSymbol);
          if (exists) {
            setActiveSymbol(upperSymbol);
          }
        }

        const rawPayloadObj = {
          from: payload.from || `projects/${firebaseConfig.projectId}/topics/user_alerts`,
          messageId: msgKey,
          priority: 'high',
          collapseKey: payload.collapseKey || 'price_alert',
          data: {
            title: title,
            body: body,
            symbol: upperSymbol || 'BTCUSDT',
            price: dataObj.price || ''
          },
          notification: {
            title: title,
            body: body,
            icon: '/favicon.ico'
          }
        };

        const rawPayloadStr = JSON.stringify(rawPayloadObj, null, 2);

        setLogs(prev => {
          const exists = prev.some(log => (log.body === body || (upperSymbol && log.body.includes(upperSymbol))) && Date.now() - new Date(log.timestamp).getTime() < 5000);
          if (exists) return prev;
          const newLog = {
            id: Math.random().toString(36).substring(2, 9),
            title: title,
            body: body,
            timestamp: new Date().toISOString(),
            read: false,
            rawPayload: rawPayloadStr,
          };
          return [newLog, ...prev];
        });

        setActiveToasts(prev => {
          const exists = prev.some(log => (log.body === body || (upperSymbol && log.body.includes(upperSymbol))) && Date.now() - new Date(log.timestamp).getTime() < 5000);
          if (exists) return prev;
          const newLog = {
            id: Math.random().toString(36).substring(2, 9),
            title: title,
            body: body,
            timestamp: new Date().toISOString(),
            read: false,
            rawPayload: rawPayloadStr,
          };
          return [newLog, ...prev];
        });

        fetchAlerts();
      };

      // Register SW message listener synchronously on mount
      const handleSWMessage = (event: MessageEvent) => {
        if (!event.data) return;

        if (event.data.type === 'FCM_NOTIFICATION_CLICK') {
          console.log('FCM Notification Click received via SW:', event.data);
          let symbol = event.data.symbol || event.data.payload?.symbol || event.data.payload?.data?.symbol;
          if (!symbol) {
            const searchText = (event.data.payload?.body || '') + ' ' + (event.data.payload?.notification?.body || '') + ' ' + (event.data.payload?.title || '');
            const match = searchText.match(/([A-Z0-9]{3,10}USDT)/i);
            if (match) {
              symbol = match[1].toUpperCase();
            }
          }

          if (symbol) {
            const upperSymbol = symbol.toUpperCase();
            const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upperSymbol);
            if (exists) {
              setActiveSymbol(upperSymbol);
              try {
                window.history.pushState({}, '', `/?symbol=${upperSymbol}`);
              } catch (e) {
                console.warn('Failed to update URL history:', e);
              }
            }
          }
          fetchAlerts();
          return;
        }

        if (event.data.type === 'FCM_BACKGROUND_MESSAGE') {
          console.log('FCM Background Message received via SW:', event.data.payload);
          if (event.data.payload) {
            processFCMPayload(event.data.payload);
          }
        }
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleSWMessage);
      }

      const initFCM = async () => {
        try {
          if ('serviceWorker' in navigator) {
            const workerConfig = new URLSearchParams({
              apiKey: firebaseConfig.apiKey,
              authDomain: firebaseConfig.authDomain,
              projectId: firebaseConfig.projectId,
              storageBucket: firebaseConfig.storageBucket,
              messagingSenderId: firebaseConfig.messagingSenderId,
              appId: firebaseConfig.appId,
            });
            swRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${workerConfig}`);
            await navigator.serviceWorker.ready;
          }

          let token: string | undefined;
          const vapidKey = String((import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || '').trim();

          try {
            token = await getToken(messaging, vapidKey
              ? { vapidKey, serviceWorkerRegistration: swRegistration }
              : { serviceWorkerRegistration: swRegistration });
          } catch (tokenErr) {
            console.warn('FCM token retrieval failed; attempting the Firebase project default:', tokenErr);
            try {
              token = await getToken(messaging, {
                serviceWorkerRegistration: swRegistration,
              });
            } catch (fallbackErr) {
              console.error('FCM token retrieval fallback failed:', fallbackErr);
            }
          }

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
          unsubscribeFn = onMessage(messaging, (payload) => {
            console.log('FCM Foreground message received:', payload);
            if (payload.data || payload.notification) {
              processFCMPayload(payload);
            }
          });
        } catch (err) {
          console.error('Error setting up FCM on client:', err);
        }
      };

      initFCM();

      return () => {
        if (unsubscribeFn) unsubscribeFn();
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleSWMessage);
        }
      };
    }
  }, [user, isDemoMode, triggerPushAlert, fetchAlerts, API_BASE_URL, notificationPermission, notificationsSupported]);

  // Sync Local Storage alerts in Demo mode
  const syncDemoAlerts = (updated: AlertType[]) => {
    if (!user || isDemoMode) {
      setAlerts(updated);
      localStorage.setItem('crypto_tracker_alerts', JSON.stringify(updated));
    }
  };

  // Initialize & reload Historical Data for all 4 coins
  const loadAllHistory = useCallback(async (requestedInterval: string = chartIntervalRef.current) => {
    const updatedCoins = await Promise.all(
      coinsRef.current.map(async (coin) => {
        const history = await fetchInitialHistory(coin.symbol, requestedInterval);
        const ticker = await fetchTicker24h(coin.symbol);

        // Only preserve cached points when they belong to the same interval.
        const newHistory = (history && history.length > 0)
          ? history.slice(-100)
          : (coin.historyInterval === requestedInterval ? coin.history : []);

        const currentPrice = ticker.currentPrice > 0 ? ticker.currentPrice : coin.currentPrice;

        return {
          ...coin,
          ...ticker,
          currentPrice,
          history: newHistory,
          historyInterval: requestedInterval,
        };
      })
    );

    // Ignore a slower response for an interval the user has already left.
    if (chartIntervalRef.current !== requestedInterval) return;
    setCoins(updatedCoins);
  }, []);

  useEffect(() => {
    setCoins(previous => previous.map(coin => (
      coin.historyInterval === chartInterval
        ? coin
        : { ...coin, history: [], historyInterval: chartInterval }
    )));
    loadAllHistory(chartInterval);
  }, [chartInterval, loadAllHistory]);

  // Re-fetch historical klines whenever Binance connection is restored to 'connected'
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadAllHistory(chartIntervalRef.current);
    }
  }, [connectionStatus, loadAllHistory]);

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

  useEffect(() => {
    checkAlertsRef.current = checkAlerts;
  }, [checkAlerts]);

  const connectionStatusRef = useRef<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const reconnectRef = useRef<((force?: boolean) => void) | null>(null);

  const updateConnectionStatus = useCallback((status: 'connected' | 'reconnecting' | 'disconnected') => {
    if (connectionStatusRef.current !== status) {
      connectionStatusRef.current = status;
      setConnectionStatus(status);
    }
  }, []);

  const handleRetryConnection = useCallback(() => {
    if (reconnectRef.current) {
      reconnectRef.current(true);
    }
  }, []);

  // Connect to Binance Websocket or Fallback Stream with Automatic Reconnection Loop
  useEffect(() => {
    let ws: WebSocket | null = null;
    let connectTimeoutTimer: any = null;
    let tickWatchdogTimer: any = null;
    let isMounted = true;
    let lastConnectTime = 0;

    const resetWatchdog = () => {
      if (tickWatchdogTimer) {
        clearTimeout(tickWatchdogTimer);
        tickWatchdogTimer = null;
      }
      if (!isMounted) return;

      // If no price ticks arrive for 3.5 seconds, stream is dead (e.g. VPN dropped midway)
      tickWatchdogTimer = setTimeout(() => {
        if (!isMounted) return;
        console.warn('Binance WebSocket stream watchdog timeout: No price ticks for 3.5s (VPN dropped).');
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          try { ws.close(); } catch (e) {}
          ws = null;
        }
        handleConnectionFailure();
      }, 3500);
    };

    const handleConnectionFailure = () => {
      if (!isMounted) return;
      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      if (tickWatchdogTimer) {
        clearTimeout(tickWatchdogTimer);
        tickWatchdogTimer = null;
      }
      updateConnectionStatus('disconnected');
    };

    const handleTickUpdate = (symbol: string, price: number, changePercent: number, high: number, low: number) => {
      const currentInterval = chartIntervalRef.current;
      const intervalTimeStr = getIntervalTimeString(new Date(), currentInterval);

      setCoins(prevCoins =>
        prevCoins.map(coin => {
          if (coin.symbol === symbol) {
            const updatedHistory = coin.historyInterval === currentInterval ? [...coin.history] : [];

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
              historyInterval: currentInterval,
            };
          }
          return coin;
        })
      );

      // Check alerts instantly
      if (checkAlertsRef.current) {
        checkAlertsRef.current(symbol, price);
      }
    };

    const connectWebSocket = (force = false) => {
      if (!isMounted) return;

      if (!BINANCE_WS_URL) {
        console.error('VITE_BINANCE_WS_URL is not configured; live browser prices are unavailable.');
        updateConnectionStatus('disconnected');
        return;
      }

      // If socket is already open and active, ensure status is connected and exit
      if (!force && ws && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        return;
      }

      const now = Date.now();
      if (!force && now - lastConnectTime < 1500) {
        return;
      }
      lastConnectTime = now;

      // Clear any pending timers
      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      if (tickWatchdogTimer) {
        clearTimeout(tickWatchdogTimer);
        tickWatchdogTimer = null;
      }

      // Close previous dead/closing socket if any
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try { ws.close(); } catch (e) {}
        ws = null;
      }

      updateConnectionStatus('reconnecting');
      
      try {
        ws = new WebSocket(BINANCE_WS_URL);

        // 5-second connection timeout guard: fail fast to RED (disconnected) if TCP handshaking stalls
        connectTimeoutTimer = setTimeout(() => {
          if (!isMounted) return;
          if (ws && ws.readyState !== WebSocket.OPEN) {
            console.warn('Binance WebSocket connection attempt timed out after 5s.');
            if (ws) {
              ws.onopen = null;
              ws.onmessage = null;
              ws.onerror = null;
              ws.onclose = null;
              try { ws.close(); } catch (e) {}
              ws = null;
            }
            handleConnectionFailure();
          }
        }, 5000);

        ws.onopen = () => {
          if (!isMounted) return;
          if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
            connectTimeoutTimer = null;
          }
          console.log('Binance WebSocket connected successfully!');
          updateConnectionStatus('connected');
          resetWatchdog();
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
            connectTimeoutTimer = null;
          }

          // Receiving live price messages confirms connected status & resets watchdog timer
          updateConnectionStatus('connected');
          resetWatchdog();

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
          if (!isMounted) return;
          console.warn('Binance WebSocket connection failed.');
          handleConnectionFailure();
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.warn('Binance WebSocket closed.');
          handleConnectionFailure();
        };
      } catch (err) {
        if (!isMounted) return;
        if (connectTimeoutTimer) {
          clearTimeout(connectTimeoutTimer);
          connectTimeoutTimer = null;
        }
        console.warn('Failed to construct Binance WebSocket:', err);
        handleConnectionFailure();
      }
    };

    reconnectRef.current = connectWebSocket;
    connectWebSocket();

    // Trigger immediate reconnect when browser network comes online or window gains focus (e.g. after turning on VPN)
    const handleOnlineOrFocus = () => {
      if (isMounted && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log('Network online or window focused — attempting to reconnect to Binance...');
        connectWebSocket();
      }
    };

    window.addEventListener('online', handleOnlineOrFocus);
    window.addEventListener('focus', handleOnlineOrFocus);

    return () => {
      isMounted = false;
      if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
      if (tickWatchdogTimer) clearTimeout(tickWatchdogTimer);
      window.removeEventListener('online', handleOnlineOrFocus);
      window.removeEventListener('focus', handleOnlineOrFocus);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try { ws.close(); } catch (e) {}
      }
    };
  }, [BINANCE_WS_URL, updateConnectionStatus]);

  // Handler: Create alert
  const handleCreateAlert = async (symbol: string, condition: 'ABOVE' | 'BELOW', priceThreshold: number) => {
    if (!isDemoMode) {
      const requesterEmail = user?.email || 'guest@pulse.com';
      const payload = {
        requester: requesterEmail,
        symbol: symbol,
        price: priceThreshold.toString(),
        trigger_direction: condition,
        app_origin: typeof window !== 'undefined'
          ? window.location.origin
          : String((import.meta as any).env?.VITE_APP_URL || '').trim(),
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
          let errMessage = 'Failed to create alert';
          try {
            const errData = await response.json();
            errMessage = errData.error || errMessage;
          } catch (e) {}
          throw new Error(errMessage);
        }

        let data = null;
        try {
          data = await response.json();
        } catch (e) {
          console.log('[handleCreateAlert] Alert created successfully (empty/non-JSON response)');
        }
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
          let errMessage = 'Failed to cancel alert';
          try {
            const errData = await response.json();
            errMessage = errData.error || errMessage;
          } catch (e) {}
          throw new Error(errMessage);
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
        onRetryConnection={handleRetryConnection}
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
            connectionStatus={connectionStatus}
            onRetryConnection={handleRetryConnection}
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
              onSelectSymbol={(sym) => {
                const upper = sym.toUpperCase();
                const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upper);
                if (exists) {
                  setActiveSymbol(upper);
                  try {
                    window.history.pushState({}, '', `/?symbol=${upper}`);
                  } catch (e) {}
                }
              }}
            />
            <NotificationLogs
              logs={logs}
              onClearLogs={() => setLogs([])}
              onSelectSymbol={(sym) => {
                const upper = sym.toUpperCase();
                const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upper);
                if (exists) {
                  setActiveSymbol(upper);
                  try {
                    window.history.pushState({}, '', `/?symbol=${upper}`);
                  } catch (e) {}
                }
              }}
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
              onSelectSymbol={(sym) => {
                const upper = sym.toUpperCase();
                const exists = COIN_CONFIGS.some(cfg => cfg.symbol === upper);
                if (exists) {
                  setActiveSymbol(upper);
                  try {
                    window.history.pushState({}, '', `/?symbol=${upper}`);
                  } catch (e) {}
                }
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Required Push Notification Permission Modal */}
      {showNotifPermissionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#0A0A0B] border border-emerald-500/40 rounded-2xl p-7 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 text-3xl animate-bounce">
              🔔
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-wide font-sans">Enable Notifications Required</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                {notificationPermissionError || (notificationPermission === 'denied'
                  ? 'Notifications are blocked for localhost. Reset the permission from the browser address-bar site settings, then reload this page.'
                  : 'Pulse requires notification permissions to deliver instant crypto price alerts directly to your browser even when running in the background.')}
              </p>
            </div>
            <button
              onClick={handleEnableNotifications}
              disabled={notificationPermission === 'denied'}
              className={`w-full py-3.5 font-bold text-sm rounded-xl transition-all font-sans tracking-wide uppercase ${
                notificationPermission === 'denied'
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/25 cursor-pointer'
              }`}
            >
              {notificationPermission === 'denied' ? 'Blocked in Browser Settings' : 'Turn On Notifications Now'}
            </button>
            {notificationPermission === 'denied' && (
              <button
                onClick={() => setShowNotifPermissionModal(false)}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-4 cursor-pointer"
              >
                Continue without notifications
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
