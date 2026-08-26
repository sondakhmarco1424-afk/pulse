export interface Alert {
  id: string;
  userId: string;
  symbol: string;
  priceThreshold: number;
  condition: 'ABOVE' | 'BELOW';
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

export interface PricePoint {
  time: string;
  price: number;
}

export interface CoinInfo {
  symbol: string;
  name: string;
  icon: string;
  color: string;
  currentPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  history: PricePoint[];
}

export interface NotificationLog {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  rawPayload?: string;
  link?: string;
}
