import { PricePoint } from '../types';

const BINANCE_REST_BASE = String((import.meta as any).env?.VITE_BINANCE_REST_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

function marketDataUrl(path: string): string {
  if (!BINANCE_REST_BASE) {
    throw new Error('VITE_BINANCE_REST_BASE_URL is not configured');
  }
  return `${BINANCE_REST_BASE}${path}`;
}

/**
 * Fetches the 100 most recent klines (candlesticks) for a given symbol from Binance
 * to populate the charts on load.
 */
export async function fetchInitialHistory(symbol: string, interval: string = '1m'): Promise<PricePoint[]> {
  try {
    const response = await fetch(marketDataUrl(`/klines?symbol=${symbol}&interval=${interval}&limit=100`));
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Parse the kline structure. Index 0 is open time, Index 4 is close price.
    return data.map((item: any) => ({
      time: formatTimestamp(item[0], interval),
      price: parseFloat(item[4]),
    }));
  } catch (error) {
    console.warn(`Initial history for ${symbol} fetch failed (Binance API disconnected).`, error);
    return [];
  }
}

/**
 * Standard 24h ticker info from Binance
 */
export async function fetchTicker24h(symbol: string) {
  try {
    const response = await fetch(marketDataUrl(`/ticker/24hr?symbol=${symbol}`));
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      currentPrice: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
    };
  } catch (error) {
    console.warn(`24h ticker statistics for ${symbol} fetch failed (Binance API disconnected).`, error);
    return {
      currentPrice: 0,
      change24h: 0,
      high24h: 0,
      low24h: 0,
    };
  }
}

/**
 * Fallback static initializers in case of total offline/CORS issues in sandbox
 */
function generateFallbackHistory(symbol: string, interval: string): PricePoint[] {
  const basePrice = symbol === 'BTCUSDT' ? 65000 : symbol === 'ETHUSDT' ? 3400 : symbol === 'BNBUSDT' ? 580 : 145;
  const history: PricePoint[] = [];
  const now = Date.now();
  
  let stepMs = 60000; // default 1m
  if (interval === '5m') {
    stepMs = 5 * 60000;
  } else if (interval === '15m') {
    stepMs = 15 * 60000;
  } else if (interval === '1h') {
    stepMs = 60 * 60000;
  } else if (interval === '1d') {
    stepMs = 24 * 60 * 60000;
  }

  for (let i = 99; i >= 0; i--) {
    const ms = now - i * stepMs;
    const noise = (Math.sin(i / 10) + Math.cos(i / 5)) * (basePrice * 0.003);
    history.push({
      time: formatTimestamp(ms, interval),
      price: Number((basePrice + noise).toFixed(2)),
    });
  }
  return history;
}

export function formatTimestamp(ms: number, interval: string): string {
  const date = new Date(ms);
  if (interval === '1d') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':');
}

function getFallbackTicker(symbol: string) {
  const basePrice = symbol === 'BTCUSDT' ? 65000 : symbol === 'ETHUSDT' ? 3400 : symbol === 'BNBUSDT' ? 580 : 145;
  return {
    currentPrice: basePrice,
    change24h: 1.45,
    high24h: basePrice * 1.02,
    low24h: basePrice * 0.98,
  };
}
